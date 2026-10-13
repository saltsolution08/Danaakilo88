import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { db, get, all, run, tx, getSetting, setSetting, seed, COMPANIES } from './db.js';
import { deliverViaProvider } from './providers.js';
import { HttpError, markDelivered, maybeRestock, ingestPayment, matchAfterCreate, creditMerchant, merchantBalances, maybeConvert } from './automation.js';
import { adapters as payAdapters, pollers, SLUGS, parseSms } from './payments.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dir, 'public');
const PROD = process.env.NODE_ENV === 'production';
const now = () => Date.now();

// ---------- caawiyaal ----------
const bad = (msg, code = 400) => new HttpError(code, msg);
const hashPw = (pw) => { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); };
const checkPw = (pw, h) => {
  const [s, k] = h.split(':');
  const d = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
  return crypto.timingSafeEqual(d, Buffer.from(k, 'hex'));
};
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : NaN; };
const isPhone = (p) => /^6\d{8}$/.test(p);
const isEmail = (e) => /^\S+@\S+\.\S+$/.test(e) && e.length <= 120;
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '');
const safeImg = (u) => (/^(data:image\/(png|jpe?g|webp);base64,|https:\/\/|\/)/i.test(u) && u.length < 900000 ? u : '');

// rate limit (login/register)
const hits = new Map();
function limited(ip) {
  const t = now(); const h = hits.get(ip) || { n: 0, r: t + 60000 };
  if (t > h.r) { h.n = 0; h.r = t + 60000; }
  h.n++; hits.set(ip, h);
  return h.n > 12;
}
setInterval(() => { const t = now(); for (const [k, v] of hits) if (t > v.r) hits.delete(k); run('DELETE FROM sessions WHERE expires<?', t); }, 600000).unref();

function readBody(req, limit, lenient) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(bad('Xogtu aad bay u weyn tahay', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) { req.rawBody = ''; return resolve({}); }
      req.rawBody = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(req.rawBody)); } catch { lenient ? resolve({ __text: req.rawBody }) : reject(bad('JSON khalad ah')); }
    });
    req.on('error', reject);
  });
}
function cookies(req) {
  const o = {};
  for (const p of (req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
  return o;
}
function send(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function currentUser(req) {
  const t = cookies(req).dk; if (!t) return null;
  const s = get('SELECT * FROM sessions WHERE token_hash=? AND expires>?', sha(t), now());
  if (!s) return null;
  const u = get("SELECT * FROM users WHERE id=? AND status='active'", s.user_id);
  return u || null;
}
const pub = (u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, reseller: !!u.reseller, wallet: u.wallet });
function startSession(res, u) {
  const t = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)', sha(t), u.id, now() + 30 * 864e5);
  return { 'Set-Cookie': `dk=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${PROD ? '; Secure' : ''}` };
}
const priceFor = (u, b) => (u.reseller ? Math.round(b.price * (100 - getSetting('reseller_discount', 5)) / 100) : b.price);
const payments = () => Object.fromEntries(Object.entries(getSetting('payments', {})).filter(([, v]) => v));
function dupRef(ref) {
  if (!ref) return false;
  return !!(get('SELECT 1 FROM orders WHERE UPPER(tx_ref)=UPPER(?)', ref) || get('SELECT 1 FROM topups WHERE UPPER(tx_ref)=UPPER(?)', ref) || get('SELECT 1 FROM payments_in WHERE tx_ref=UPPER(?) AND matched_type IS NOT NULL', ref));
}
const ledger = (uid, amt, type, ref) => run('INSERT INTO ledger(user_id,amount,type,ref,created) VALUES(?,?,?,?,?)', uid, amt, type, ref || null, now());

// ---------- routes ----------
const R = []; // [method, regex, role, handler]
const route = (m, p, role, h) => R.push([m, new RegExp('^' + p.replace(/:id/g, '(\\d+)') + '$'), role, h]);

// -- public
route('GET', '/api/catalog', null, () => {
  const bundles = all('SELECT id,company,category,name,price,validity FROM bundles WHERE active=1 ORDER BY company,sort,id');
  const ads = all('SELECT id,title,subtitle,url,image FROM ads WHERE active=1 ORDER BY sort,id');
  return {
    companies: COMPANIES, bundles, ads, payments: payments(), whatsapp: getSetting('whatsapp', ''),
    social: getSetting('social', {}), userOrders: getSetting('user_orders', '1') === '1',
    resellerDiscount: getSetting('reseller_discount', 5),
  };
});

route('POST', '/api/register', null, (req, res, b, ctx) => {
  if (limited(ctx.ip)) throw bad('Isku day mar dambe', 429);
  const name = str(b.name, 80), phone = str(b.phone, 9), email = str(b.email, 120).toLowerCase(), pw = typeof b.password === 'string' ? b.password : '';
  if (name.length < 3) throw bad('Geli magacaaga oo dhan');
  if (!isPhone(phone)) throw bad('Telefoon sax ah geli (9 lambar, tusaale 654246143)');
  if (!isEmail(email)) throw bad('Email sax ah geli');
  if (pw.length < 8 || pw.length > 100) throw bad('Password ugu yaraan 8 xaraf');
  if (get('SELECT 1 FROM users WHERE email=?', email)) throw bad('Email-kan hore ayaa loo isticmaalay');
  const r = run('INSERT INTO users(name,phone,email,pw_hash,created) VALUES(?,?,?,?,?)', name, phone, email, hashPw(pw), now());
  const u = get('SELECT * FROM users WHERE id=?', Number(r.lastInsertRowid));
  return [200, { user: pub(u) }, startSession(res, u)];
});

route('POST', '/api/login', null, (req, res, b, ctx) => {
  if (limited(ctx.ip)) throw bad('Isku day mar dambe', 429);
  const email = str(b.email, 120).toLowerCase(), pw = typeof b.password === 'string' ? b.password : '';
  const u = get("SELECT * FROM users WHERE email=? AND status='active'", email);
  if (!u || !checkPw(pw, u.pw_hash)) throw bad('Email ama password waa khalad', 401);
  return [200, { user: pub(u) }, startSession(res, u)];
});

route('POST', '/api/logout', null, (req) => {
  const t = cookies(req).dk; if (t) run('DELETE FROM sessions WHERE token_hash=?', sha(t));
  return [200, { ok: true }, { 'Set-Cookie': 'dk=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }];
});

// -- user
route('GET', '/api/me', 'user', (req, res, b, ctx) => ({ user: pub(ctx.user) }));

route('PUT', '/api/me', 'user', (req, res, b, ctx) => {
  const name = str(b.name, 80), phone = str(b.phone, 9);
  if (name.length < 3 || !isPhone(phone)) throw bad('Xogta waa khalad');
  run('UPDATE users SET name=?,phone=? WHERE id=?', name, phone, ctx.user.id);
  return { user: pub(get('SELECT * FROM users WHERE id=?', ctx.user.id)) };
});

route('POST', '/api/me/password', 'user', (req, res, b, ctx) => {
  if (!checkPw(String(b.old || ''), ctx.user.pw_hash)) throw bad('Password-ka hore waa khalad');
  const n = String(b.password || '');
  if (n.length < 8 || n.length > 100) throw bad('Password ugu yaraan 8 xaraf');
  run('UPDATE users SET pw_hash=? WHERE id=?', hashPw(n), ctx.user.id);
  return { ok: true };
});

route('POST', '/api/me/delete', 'user', (req, res, b, ctx) => {
  if (ctx.user.role === 'admin') throw bad('Akoonka maamulaha lama tirtiri karo', 403);
  if (!checkPw(String(b.password || ''), ctx.user.pw_hash)) throw bad('Password waa khalad');
  tx(() => {
    run("UPDATE users SET status='deleted', email=?, name='Deleted', phone='000000000' WHERE id=?", `deleted-${ctx.user.id}-${now()}@deleted.local`, ctx.user.id);
    run('DELETE FROM sessions WHERE user_id=?', ctx.user.id);
  });
  return [200, { ok: true }, { 'Set-Cookie': 'dk=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }];
});

route('POST', '/api/orders', 'user', (req, res, b, ctx) => {
  const u = ctx.user;
  const bun = get('SELECT * FROM bundles WHERE id=? AND active=1', int(b.bundleId));
  if (!bun) throw bad('Baakadda lama helin');
  const target = str(b.target, 9);
  if (!isPhone(target)) throw bad('Lambarka data-da la geynayo waa khalad (9 lambar)');
  const method = str(b.method, 40), price = priceFor(u, bun), t = now();
  if (method === 'Wallet') {
    const id = tx(() => {
      const w = get('SELECT wallet FROM users WHERE id=?', u.id).wallet;
      if (w < price) throw bad('Wallet-kaaga ma ku filna. Shub lacag.');
      run('UPDATE users SET wallet=wallet-? WHERE id=?', price, u.id);
      const r = run(`INSERT INTO orders(user_id,bundle_id,company,category,bundle_name,target_phone,base,price,method,status,created,updated)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, u.id, bun.id, bun.company, bun.category, bun.name, target, bun.price, price, 'Wallet', 'paid', t, t);
      ledger(u.id, -price, 'order', 'order#' + r.lastInsertRowid);
      return Number(r.lastInsertRowid);
    });
    return { id, status: 'paid' };
  }
  if (!payments()[method]) throw bad('Habka lacag-bixinta lama helin');
  const payer = str(b.payer, 12).replace(/\D/g, ''), ref = str(b.txRef, 30).replace(/[^\w-]/g, '');
  if (payer.length < 9) throw bad('Geli lambarka aad lacagta ka bixisay');
  if (ref.length < 4) throw bad('Geli Transaction ID (ugu yaraan 4 xaraf)');
  if (dupRef(ref)) throw bad('Transaction ID-gan hore ayaa loo isticmaalay');
  const r = run(`INSERT INTO orders(user_id,bundle_id,company,category,bundle_name,target_phone,base,price,method,payer_phone,tx_ref,status,created,updated)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, u.id, bun.id, bun.company, bun.category, bun.name, target, bun.price, price, method, payer, ref, 'pending_payment', t, t);
  const oid = Number(r.lastInsertRowid);
  matchAfterCreate(method, ref);
  return { id: oid, status: get('SELECT status FROM orders WHERE id=?', oid).status };
});

route('GET', '/api/orders', 'user', (req, res, b, ctx) => {
  if (getSetting('user_orders', '1') !== '1') throw bad('Lama furin', 403);
  return { orders: all('SELECT id,company,category,bundle_name,target_phone,price,method,status,created,updated FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 200', ctx.user.id) };
});

route('POST', '/api/topups', 'user', (req, res, b, ctx) => {
  const amount = int(b.amount), method = str(b.method, 40);
  if (!(amount >= 1000 && amount <= 5000000)) throw bad('Qadarka waa inuu ahaadaa Sh1,000 ilaa Sh5,000,000');
  if (!payments()[method]) throw bad('Habka lacag-bixinta lama helin');
  const payer = str(b.payer, 12).replace(/\D/g, ''), ref = str(b.txRef, 30).replace(/[^\w-]/g, '');
  if (payer.length < 9) throw bad('Geli lambarka aad lacagta ka bixisay');
  if (ref.length < 4) throw bad('Geli Transaction ID');
  if (dupRef(ref)) throw bad('Transaction ID-gan hore ayaa loo isticmaalay');
  const t = now();
  const r = run('INSERT INTO topups(user_id,amount,method,payer_phone,tx_ref,created,updated) VALUES(?,?,?,?,?,?,?)', ctx.user.id, amount, method, payer, ref, t, t);
  const tid = Number(r.lastInsertRowid);
  matchAfterCreate(method, ref);
  return { id: tid, status: get('SELECT status FROM topups WHERE id=?', tid).status };
});

route('GET', '/api/topups', 'user', (req, res, b, ctx) => ({
  topups: all('SELECT id,amount,method,status,created FROM topups WHERE user_id=? ORDER BY id DESC LIMIT 20', ctx.user.id),
}));

// -- admin: dalabyada
route('GET', '/api/admin/stats', 'admin', () => {
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const sales = get("SELECT COALESCE(SUM(price),0) s, COUNT(*) n FROM orders WHERE status='delivered' AND updated>=?", day.getTime());
  const thr = getSetting('float_thr', 30);
  const fl = all('SELECT company,usd FROM float');
  return {
    salesToday: sales.s, deliveredToday: sales.n,
    pendingPayment: get("SELECT COUNT(*) n FROM orders WHERE status='pending_payment'").n,
    toDeliver: get("SELECT COUNT(*) n FROM orders WHERE status='paid'").n,
    pendingTopups: get("SELECT COUNT(*) n FROM topups WHERE status='pending'").n,
    users: get("SELECT COUNT(*) n FROM users WHERE role='user' AND status='active'").n,
    float: fl, floatThr: thr, lowFloat: fl.filter((f) => f.usd < thr).map((f) => f.company),
    merchant: merchantBalances(), convertUsd: getSetting('convert_usd', 30), autoConvert: getSetting('auto_convert', '0') === '1',
    unmatchedPayments: get('SELECT COUNT(*) n FROM payments_in WHERE matched_type IS NULL AND created>?', Date.now() - 864e5).n,
    userWallets: get("SELECT COALESCE(SUM(wallet),0) s FROM users").s,
  };
});

route('GET', '/api/admin/orders', 'admin', (req, res, b, ctx) => {
  const st = ctx.url.searchParams.get('status');
  const rows = st
    ? all(`SELECT o.*,u.name uname,u.phone uphone FROM orders o JOIN users u ON u.id=o.user_id WHERE o.status=? ORDER BY o.id DESC LIMIT 200`, st)
    : all(`SELECT o.*,u.name uname,u.phone uphone FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 200`);
  return { orders: rows };
});

function setOrder(id, from, to, extra) {
  return tx(() => {
    const o = get('SELECT * FROM orders WHERE id=?', id);
    if (!o) throw bad('Dalabka lama helin', 404);
    if (!from.includes(o.status)) throw bad('Xaaladda dalabka ma ogola tallaabadan');
    run('UPDATE orders SET status=?, updated=?, note=COALESCE(?,note) WHERE id=?', to, now(), extra?.note ?? null, id);
    return o;
  });
}
route('POST', '/api/admin/orders/:id/confirm', 'admin', (req, res, b, ctx) => {
  const o = setOrder(+ctx.m[1], ['pending_payment', 'review'], 'paid');
  if (o.method !== 'Wallet' && !get("SELECT 1 FROM payments_in WHERE matched_type='order' AND matched_id=?", o.id)) { creditMerchant(o.method, o.price, 'manual order#' + o.id); maybeConvert().catch(() => {}); }
  return { ok: true };
});
route('POST', '/api/admin/orders/:id/deliver', 'admin', async (req, res, b, ctx) => {
  const id = +ctx.m[1];
  const o = get('SELECT * FROM orders WHERE id=?', id);
  if (!o) throw bad('Dalabka lama helin', 404);
  if (o.status !== 'paid') throw bad('Marka hore lacagta xaqiiji');
  const pr = await deliverViaProvider(o); // { ok, manual }
  if (!pr.ok && !pr.manual) throw bad('Shirkadda ayaa diiday: ' + (pr.error || 'khalad'), 502);
  markDelivered(id, str(b.note, 200) || null);
  await maybeRestock(o.company);
  return { ok: true };
});
route('POST', '/api/admin/orders/:id/reject', 'admin', (req, res, b, ctx) => {
  const id = +ctx.m[1];
  tx(() => {
    const o = setOrder(id, ['pending_payment', 'paid', 'review'], 'failed', { note: str(b.note, 200) || null });
    if (o.method === 'Wallet' && o.status === 'paid') {
      run('UPDATE users SET wallet=wallet+? WHERE id=?', o.price, o.user_id);
      ledger(o.user_id, o.price, 'refund', 'order#' + id);
    }
  });
  return { ok: true };
});

// -- admin: lacagaha soo gashay (webhook/polling)
route('GET', '/api/admin/payments-in', 'admin', () => ({
  payments: all('SELECT id,method,tx_ref,amount,payer,matched_type,matched_id,created FROM payments_in ORDER BY id DESC LIMIT 100'),
}));

// -- SMS: taleefanka merchant-ka ayaa fariinta lacag-helka u dira (SMS forwarder)
route('POST', '/api/webhooks/sms/([a-z]+)', null, (req, res, b, ctx) => {
  const slug = ctx.m[1];
  if (!SLUGS[slug]) throw bad('Lama helin', 404);
  const tok = Buffer.from(process.env.SMS_TOKEN || ''), got = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!tok.length || tok.length !== got.length || !crypto.timingSafeEqual(tok, got)) throw bad('Token waa khalad', 401);
  const message = String(b.message || b.text || b.body || b.__text || '').slice(0, 600), sender = String(b.sender || b.from || '').slice(0, 40);
  const senders = (getSetting('sms_senders', {})[slug] || []).map((x) => String(x).toLowerCase());
  if (senders.length && !senders.includes(sender.toLowerCase())) throw bad('Sender lama oggola', 403);
  const p = parseSms(getSetting('sms_rules', {})[slug], message, getSetting('rate', 5750));
  if (p.error) return { ok: false, ignored: true, reason: p.error };
  return ingestPayment({ method: SLUGS[slug], txRef: p.txRef, amount: p.amount, payer: p.payer, raw: message, source: 'sms' });
});
route('POST', '/api/admin/sms/test', 'admin', (req, res, b) => {
  const slug = str(b.slug, 20);
  if (!SLUGS[slug]) throw bad('Habka lama helin');
  const r = b.rules && typeof b.rules === 'object' ? b.rules : getSetting('sms_rules', {})[slug];
  return parseSms(r, String(b.message || ''), getSetting('rate', 5750));
});

// -- webhook: lacag-bixiyaha ayaa halkan ka soo diraya lacagaha soo galay
route('POST', '/api/webhooks/([a-z]+)', null, (req, res, b, ctx) => {
  const slug = ctx.m[1], ad = payAdapters[slug];
  if (!ad) throw bad('Lama helin', 404);
  if (!ad.verify(slug, req, req.rawBody || '')) throw bad('Saxiixa waa khalad', 401);
  const p = ad.parse(b);
  if (!p) return { ok: true, ignored: true };
  return ingestPayment({ method: SLUGS[slug], txRef: p.txRef, amount: p.amount, payer: p.payer, raw: req.rawBody });
});

// -- admin: wallet topups
route('GET', '/api/admin/topups', 'admin', (req, res, b, ctx) => {
  const st = ctx.url.searchParams.get('status') || 'pending';
  return { topups: all('SELECT t.*,u.name uname,u.phone uphone FROM topups t JOIN users u ON u.id=t.user_id WHERE t.status=? ORDER BY t.id DESC LIMIT 200', st) };
});
function setTopup(id, to) {
  tx(() => {
    const t = get('SELECT * FROM topups WHERE id=?', id);
    if (!t) throw bad('Lama helin', 404);
    if (t.status !== 'pending') throw bad('Horey ayaa loo qabtay');
    run('UPDATE topups SET status=?, updated=? WHERE id=?', to, now(), id);
    if (to === 'approved') {
      run('UPDATE users SET wallet=wallet+? WHERE id=?', t.amount, t.user_id); ledger(t.user_id, t.amount, 'topup', 'topup#' + id);
      if (!get("SELECT 1 FROM payments_in WHERE matched_type='topup' AND matched_id=?", id)) creditMerchant(t.method, t.amount, 'manual topup#' + id);
    }
  });
}
route('POST', '/api/admin/topups/:id/approve', 'admin', (req, res, b, ctx) => { setTopup(+ctx.m[1], 'approved'); return { ok: true }; });
route('POST', '/api/admin/topups/:id/reject', 'admin', (req, res, b, ctx) => { setTopup(+ctx.m[1], 'rejected'); return { ok: true }; });

// -- admin: isticmaalayaasha
route('GET', '/api/admin/users', 'admin', (req, res, b, ctx) => {
  const q = '%' + (ctx.url.searchParams.get('q') || '').replace(/[%_]/g, '') + '%';
  return { users: all("SELECT id,name,phone,email,role,reseller,wallet,status,created FROM users WHERE status!='deleted' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY id DESC LIMIT 200", q, q, q) };
});
route('PUT', '/api/admin/users/:id', 'admin', (req, res, b, ctx) => {
  const id = +ctx.m[1];
  if (!get('SELECT 1 FROM users WHERE id=?', id)) throw bad('Lama helin', 404);
  if (typeof b.reseller === 'boolean') run('UPDATE users SET reseller=? WHERE id=?', b.reseller ? 1 : 0, id);
  if (b.status === 'blocked' || b.status === 'active') {
    if (get("SELECT 1 FROM users WHERE id=? AND role='admin'", id)) throw bad('Maamulaha lama xannibi karo');
    run('UPDATE users SET status=? WHERE id=?', b.status, id);
    if (b.status === 'blocked') run('DELETE FROM sessions WHERE user_id=?', id);
  }
  return { ok: true };
});
route('POST', '/api/admin/users/:id/wallet', 'admin', (req, res, b, ctx) => {
  const id = +ctx.m[1], amt = int(b.amount);
  if (!Number.isFinite(amt) || amt === 0 || Math.abs(amt) > 5000000) throw bad('Qadar khalad ah');
  tx(() => {
    const u = get('SELECT wallet FROM users WHERE id=?', id);
    if (!u) throw bad('Lama helin', 404);
    if (u.wallet + amt < 0) throw bad('Wallet-ku ma noqon karo taban');
    run('UPDATE users SET wallet=wallet+? WHERE id=?', amt, id);
    ledger(id, amt, 'admin_adjust', str(b.note, 100));
  });
  return { ok: true };
});

// -- admin: float
route('GET', '/api/admin/float', 'admin', () => ({
  float: all('SELECT company,usd FROM float'), log: all('SELECT * FROM float_log ORDER BY id DESC LIMIT 50'),
  bonus: getSetting('bonus', 17), thr: getSetting('float_thr', 30), restockUsd: getSetting('restock_usd', 100),
  merchant: merchantBalances(), convertUsd: getSetting('convert_usd', 30), autoConvert: getSetting('auto_convert', '0') === '1',
}));
route('POST', '/api/admin/float/restock', 'admin', (req, res, b) => {
  const c = str(b.company, 20), usd = Number(b.usd);
  if (!COMPANIES[c] || !(usd > 0 && usd <= 100000)) throw bad('Xog khalad ah');
  const got = usd * (1 + getSetting('bonus', 17) / 100);
  const from = str(b.from, 40);
  tx(() => {
    if (from) {
      const bal = get('SELECT COALESCE(SUM(usd),0) s FROM merchant_ledger WHERE method=?', from).s;
      if (bal < usd - 1e-9) throw bad(`Lacagta merchant-ka ee ${from} ma ku filna ($${bal.toFixed(2)})`);
      run('INSERT INTO merchant_ledger(method,usd,kind,note,created) VALUES(?,?,?,?,?)', from, -usd, 'convert', 'float ' + c, now());
    }
    run('UPDATE float SET usd=usd+? WHERE company=?', got, c);
    run('INSERT INTO float_log(company,usd,kind,note,created) VALUES(?,?,?,?,?)', c, got, 'restock', `$${usd} la iibsaday`, now());
  });
  return { ok: true, added: got };
});

// -- admin: baakadaha
function bundleBody(b) {
  const company = str(b.company, 20), category = str(b.category, 60), name = str(b.name, 80), validity = str(b.validity, 40), price = int(b.price);
  if (!COMPANIES[company] || !category || !name || !(price > 0 && price < 10000000)) throw bad('Xogta baakadda waa khalad');
  return [company, category, name, price, validity];
}
route('GET', '/api/admin/bundles', 'admin', () => ({ bundles: all('SELECT * FROM bundles ORDER BY company,sort,id') }));
route('POST', '/api/admin/bundles', 'admin', (req, res, b) => {
  const v = bundleBody(b);
  const r = run('INSERT INTO bundles(company,category,name,price,validity,sort) VALUES(?,?,?,?,?,?)', ...v, 1000 + (get('SELECT COUNT(*) n FROM bundles').n));
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/admin/bundles/:id', 'admin', (req, res, b, ctx) => {
  const v = bundleBody(b);
  run('UPDATE bundles SET company=?,category=?,name=?,price=?,validity=?,active=? WHERE id=?', ...v, b.active === false ? 0 : 1, +ctx.m[1]);
  return { ok: true };
});
route('DELETE', '/api/admin/bundles/:id', 'admin', (req, res, b, ctx) => { run('DELETE FROM bundles WHERE id=?', +ctx.m[1]); return { ok: true }; });

// -- admin: xayeysiis
function adBody(b) {
  const title = str(b.title, 80);
  if (!title) throw bad('Cinwaan geli');
  return [title, str(b.subtitle, 160), safeUrl(str(b.url, 300)), safeImg(typeof b.image === 'string' ? b.image : '')];
}
route('GET', '/api/admin/ads', 'admin', () => ({ ads: all('SELECT * FROM ads ORDER BY sort,id') }));
route('POST', '/api/admin/ads', 'admin', (req, res, b) => {
  const r = run('INSERT INTO ads(title,subtitle,url,image,sort) VALUES(?,?,?,?,?)', ...adBody(b), get('SELECT COUNT(*) n FROM ads').n);
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/admin/ads/:id', 'admin', (req, res, b, ctx) => {
  run('UPDATE ads SET title=?,subtitle=?,url=?,image=?,active=? WHERE id=?', ...adBody(b), b.active === false ? 0 : 1, +ctx.m[1]);
  return { ok: true };
});
route('DELETE', '/api/admin/ads/:id', 'admin', (req, res, b, ctx) => { run('DELETE FROM ads WHERE id=?', +ctx.m[1]); return { ok: true }; });

// -- admin: backup (soo deji database-ka)
route('GET', '/api/admin/backup', 'admin', (req, res) => {
  const tmp = path.join(os.tmpdir(), `dk-backup-${now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const buf = fs.readFileSync(tmp); fs.unlinkSync(tmp);
  const d = new Date().toISOString().slice(0, 10);
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="dankali-backup-${d}.db"`, 'Cache-Control': 'no-store' });
  res.end(buf);
  return { __sent: true };
});

// -- admin: settings
route('GET', '/api/admin/settings', 'admin', () => ({
  payments: getSetting('payments', {}), social: getSetting('social', {}), whatsapp: getSetting('whatsapp', ''),
  rate: getSetting('rate', 5750), bonus: getSetting('bonus', 17), float_thr: getSetting('float_thr', 30),
  restock_usd: getSetting('restock_usd', 100), reseller_discount: getSetting('reseller_discount', 5), user_orders: getSetting('user_orders', '1'),
  auto_deliver: getSetting('auto_deliver', '0'), auto_restock: getSetting('auto_restock', '0'), auto_convert: getSetting('auto_convert', '0'),
  convert_usd: getSetting('convert_usd', 30), sms_auto_max: getSetting('sms_auto_max', 60000), sms_rules: getSetting('sms_rules', {}), sms_senders: getSetting('sms_senders', {}),
}));
route('PUT', '/api/admin/settings', 'admin', (req, res, b) => {
  if (b.payments && typeof b.payments === 'object') {
    const p = {};
    for (const [k, v] of Object.entries(b.payments).slice(0, 10)) { const kk = str(k, 40); if (kk) p[kk] = String(v ?? '').replace(/\D/g, '').slice(0, 15); }
    setSetting('payments', p);
  }
  if (b.social && typeof b.social === 'object') {
    const s = {};
    for (const k of ['tiktok', 'instagram', 'facebook', 'youtube', 'telegram']) s[k] = safeUrl(str(b.social[k], 300));
    setSetting('social', s);
  }
  if ('whatsapp' in b) setSetting('whatsapp', String(b.whatsapp || '').replace(/\D/g, '').slice(0, 15));
  for (const [k, lo, hi] of [['rate', 1, 1e6], ['bonus', 0, 100], ['float_thr', 0, 1e5], ['restock_usd', 1, 1e5], ['reseller_discount', 0, 50]]) {
    if (k in b) { const n = Number(b[k]); if (!(n >= lo && n <= hi)) throw bad(`${k} khalad`); setSetting(k, n); }
  }
  if ('user_orders' in b) setSetting('user_orders', b.user_orders === '1' || b.user_orders === true ? '1' : '0');
  if (b.sms_rules && typeof b.sms_rules === 'object') {
    const rules = {};
    for (const k of Object.keys(SLUGS)) {
      const r = b.sms_rules[k]; if (!r) continue;
      const o = { amount: str(r.amount, 200), txRef: str(r.txRef, 200), payer: str(r.payer, 200), currency: r.currency === 'USD' ? 'USD' : 'SOS' };
      for (const f of ['amount', 'txRef', 'payer']) if (o[f]) { try { new RegExp(o[f], 'i'); } catch (e) { throw bad(`Regex ${k}.${f} khalad: ${e.message}`); } }
      rules[k] = o;
    }
    setSetting('sms_rules', rules);
  }
  if (b.sms_senders && typeof b.sms_senders === 'object') {
    const sd = {};
    for (const k of Object.keys(SLUGS)) { const v = b.sms_senders[k]; sd[k] = (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => str(String(x), 40)).filter(Boolean).slice(0, 10); }
    setSetting('sms_senders', sd);
  }
  for (const [k, lo, hi] of [['sms_auto_max', 0, 1e8], ['convert_usd', 1, 1e5]]) if (k in b) { const n = Number(b[k]); if (!(n >= lo && n <= hi)) throw bad(`${k} khalad`); setSetting(k, n); }
  for (const k of ['auto_deliver', 'auto_restock', 'auto_convert']) if (k in b) setSetting(k, b[k] === '1' || b[k] === true ? '1' : '0');
  return { ok: true };
});

// ---------- static ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ico': 'image/x-icon' };
const SEC = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB + path.sep) && file !== PUB) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, SEC); return res.end('Lama helin'); }
    const ext = path.extname(file).toLowerCase();
    const cache = ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, ...SEC });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    try { return serveStatic(req, res, url.pathname); } catch { res.writeHead(400); return res.end(); }
  }
  try {
    let hit = null;
    for (const [m, re, role, h] of R) {
      if (m !== req.method) continue;
      const mm = re.exec(url.pathname);
      if (mm) { hit = { role, h, m: mm }; break; }
    }
    if (!hit) return send(res, 404, { error: 'Lama helin' });
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    const ctx = { url, m: hit.m, ip, user: null };
    if (hit.role) {
      const u = currentUser(req);
      if (!u) return send(res, 401, { error: 'Fadlan gal' });
      if (hit.role === 'admin' && u.role !== 'admin') return send(res, 403, { error: 'Ogolaansho ma lihid' });
      ctx.user = u;
    }
    let body = {};
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      if (!(req.headers['content-type'] || '').includes('application/json') && !url.pathname.startsWith('/api/webhooks/')) throw bad('Content-Type khalad', 415);
      body = await readBody(req, req.url.includes('/ads') ? 2_000_000 : 100_000, url.pathname.startsWith('/api/webhooks/'));
    }
    const out = await hit.h(req, res, body, ctx);
    if (out && out.__sent) return;
    if (Array.isArray(out)) send(res, out[0], out[1], out[2]); else send(res, 200, out);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    console.error('ERR', req.method, req.url, e);
    send(res, 500, { error: 'Khalad server-ka ah' });
  }
});

// ---------- bilow ----------
seed();
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase(), pw = process.env.ADMIN_PASSWORD || '';
if (email && pw) {
  if (!get('SELECT 1 FROM users WHERE email=?', email)) {
    if (pw.length < 8) console.warn('ADMIN_PASSWORD waa inuu ahaadaa ugu yaraan 8 xaraf, admin lama sameynin');
    else { run("INSERT INTO users(name,phone,email,pw_hash,role,created) VALUES('Admin','000000000',?,?,'admin',?)", email, hashPw(pw), now()); console.log('=== ADMIN LA SAMEEYAY ===', email); }
  }
} else if (!get("SELECT 1 FROM users WHERE role='admin'")) console.warn('ADMIN_EMAIL/ADMIN_PASSWORD lama dhigin: admin ma jiro');

for (const [slug, fn] of Object.entries(pollers)) {
  setInterval(async () => {
    try { for (const p of await fn()) ingestPayment({ method: SLUGS[slug], txRef: p.txRef, amount: p.amount, payer: p.payer, raw: JSON.stringify(p) }); }
    catch (e) { console.error('poll', slug, e.message); }
  }, 30000).unref();
}
const PORT = Number(process.env.PORT) || 3000;
export { server };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log('Dankali waa socotaa: port ' + PORT));
}
