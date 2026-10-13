// Tijaabo toos ah: node test.js  (waxay isticmaashaa database ku meel gaar ah)
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dankali-test-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password-123';
process.env.WHATSAPP = '252631234567';
process.env.WEBHOOK_SECRET = 'whsec_test';
process.env.PROVIDER_MODE = 'api';
process.env.SMS_TOKEN = 'smstok';
process.env.PAYMENTS = 'EVC Plus:252634000001,Zaad:252634000002';
const { server } = await import('./server.js');
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

function client() {
  let cookie = '';
  return async (p, method = 'GET', body) => {
    const r = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let d = {}; try { d = await r.json(); } catch {}
    return { s: r.status, d };
  };
}
let n = 0;
const ok = (name) => console.log(`  \u2713 ${++n}. ${name}`);

const anon = client(), user = client(), admin = client(), user2 = client();

let r = await anon('/api/catalog');
assert.equal(r.s, 200); assert.ok(r.d.bundles.length >= 14); assert.equal(r.d.payments['EVC Plus'], '252634000001'); ok('catalog + payments seeded from env');

r = await anon('/api/me'); assert.equal(r.s, 401); ok('me requires login');
r = await user('/api/register', 'POST', { name: 'Test User', phone: '654246143', email: 'u@test.local', password: 'short' }); assert.equal(r.s, 400); ok('weak password rejected');
r = await user('/api/register', 'POST', { name: 'Test User', phone: '554246143', email: 'u@test.local', password: 'password123' }); assert.equal(r.s, 400); ok('bad phone rejected');
r = await user('/api/register', 'POST', { name: 'Test User', phone: '654246143', email: 'u@test.local', password: 'password123' }); assert.equal(r.s, 200); ok('register');
r = await anon('/api/register', 'POST', { name: 'Dup', phone: '654246143', email: 'U@test.local', password: 'password123' }); assert.equal(r.s, 400); ok('duplicate email rejected');
r = await user('/api/me'); assert.equal(r.d.user.role, 'user'); assert.equal(r.d.user.wallet, 0); ok('session cookie works');
r = await user('/api/admin/stats'); assert.equal(r.s, 403); ok('user cannot use admin API');
r = await admin('/api/login', 'POST', { email: 'admin@test.local', password: 'wrong' }); assert.equal(r.s, 401); ok('wrong admin password rejected');
r = await admin('/api/login', 'POST', { email: 'admin@test.local', password: 'admin-password-123' }); assert.equal(r.s, 200); assert.equal(r.d.user.role, 'admin'); ok('admin login');

const cat = (await anon('/api/catalog')).d;
const b1 = cat.bundles.find((b) => b.company === 'somtel' && b.name === 'Unlimited 24 Saac');
// mobile money order
r = await user('/api/orders', 'POST', { bundleId: b1.id, target: '654246143', method: 'EVC Plus', payer: '634111222', txRef: 'ABC123' });
assert.equal(r.s, 200); assert.equal(r.d.status, 'pending_payment'); const oid = r.d.id; ok('order (EVC) -> pending_payment');
r = await user('/api/orders', 'POST', { bundleId: b1.id, target: '654246143', method: 'EVC Plus', payer: '634111222', txRef: 'ABC123' }); assert.equal(r.s, 400); ok('duplicate transaction ID rejected');
r = await user('/api/orders', 'POST', { bundleId: b1.id, target: '654246143', method: 'Nowhere', payer: '634111222', txRef: 'ZZZ999' }); assert.equal(r.s, 400); ok('unknown payment method rejected');
r = await user('/api/orders', 'POST', { bundleId: b1.id, target: '654246143', method: 'Wallet' }); assert.equal(r.s, 400); ok('wallet order with empty wallet rejected');
r = await admin('/api/admin/orders/' + oid + '/deliver', 'POST', {}); assert.equal(r.s, 400); ok('cannot deliver before payment confirmed');
r = await admin('/api/admin/float/restock', 'POST', { company: 'somtel', usd: 100 }); assert.equal(r.s, 200); assert.ok(Math.abs(r.d.added - 117) < 1e-9); ok('float restock $100 -> $117');
r = await admin('/api/admin/orders/' + oid + '/confirm', 'POST', {}); assert.equal(r.s, 200); ok('admin confirms payment');
r = await admin('/api/admin/orders/' + oid + '/deliver', 'POST', {}); assert.equal(r.s, 200); ok('admin delivers (manual mode)');
r = await admin('/api/admin/float'); const sf = r.d.float.find((x) => x.company === 'somtel').usd; assert.ok(Math.abs(sf - (117 - 5490 / 5750)) < 1e-6); ok('float reduced by sale cost');
r = await admin('/api/admin/stats'); assert.equal(r.d.salesToday, 5490); ok('stats: sales today');

// wallet topup
r = await user('/api/topups', 'POST', { amount: 20000, method: 'Zaad', payer: '634111222', txRef: 'TOP001' }); assert.equal(r.s, 200); const tid = r.d.id; ok('topup request');
r = await admin('/api/admin/topups'); assert.equal(r.d.topups.length, 1); ok('admin sees pending topup');
r = await admin('/api/admin/topups/' + tid + '/approve', 'POST', {}); assert.equal(r.s, 200);
r = await admin('/api/admin/topups/' + tid + '/approve', 'POST', {}); assert.equal(r.s, 400); ok('topup cannot be approved twice');
r = await user('/api/me'); assert.equal(r.d.user.wallet, 20000); ok('wallet credited');
r = await user('/api/orders', 'POST', { bundleId: b1.id, target: '654246143', method: 'Wallet' }); assert.equal(r.s, 200); assert.equal(r.d.status, 'paid'); const w1 = r.d.id; ok('wallet order -> paid');
r = await user('/api/me'); assert.equal(r.d.user.wallet, 20000 - 5490); ok('wallet debited');
r = await admin('/api/admin/orders/' + w1 + '/reject', 'POST', {}); assert.equal(r.s, 200);
r = await user('/api/me'); assert.equal(r.d.user.wallet, 20000); ok('reject refunds wallet');

// reseller price
const uid = (await admin('/api/admin/users')).d.users.find((u) => u.email === 'u@test.local').id;
r = await admin('/api/admin/users/' + uid, 'PUT', { reseller: true }); assert.equal(r.s, 200);
r = await user('/api/orders', 'POST', { bundleId: b1.id, target: '654246143', method: 'Wallet' }); assert.equal(r.s, 200);
r = await user('/api/me'); assert.equal(r.d.user.wallet, 20000 - Math.round(5490 * 0.95)); ok('reseller discount applied server-side');

// user orders hidden by default
r = await user('/api/orders'); assert.equal(r.s, 200); assert.ok(r.d.orders.length >= 2); assert.ok(r.d.orders[0].created > 0 && r.d.orders[0].updated > 0); ok('user sees own orders with date/time');
r = await admin('/api/admin/settings', 'PUT', { user_orders: '0' }); assert.equal(r.s, 200);
r = await user('/api/orders'); assert.equal(r.s, 403); ok('admin can hide user orders');
await admin('/api/admin/settings', 'PUT', { user_orders: '1' });

// admin CRUD
r = await admin('/api/admin/bundles', 'POST', { company: 'soltelco', category: 'Casri Bundle', name: '1GB', price: 4500, validity: '1 maalin' }); assert.equal(r.s, 200); const nb = r.d.id;
r = await anon('/api/catalog'); assert.ok(r.d.bundles.some((b) => b.id === nb)); ok('admin adds bundle -> visible in catalog');
r = await admin('/api/admin/bundles/' + nb, 'PUT', { company: 'soltelco', category: 'Casri Bundle', name: '1GB', price: 4700, validity: '1 maalin', active: false }); assert.equal(r.s, 200);
r = await anon('/api/catalog'); assert.ok(!r.d.bundles.some((b) => b.id === nb)); ok('inactive bundle hidden');
r = await admin('/api/admin/ads', 'POST', { title: 'Test Ad', subtitle: 'x', url: 'javascript:alert(1)', image: '' }); assert.equal(r.s, 200);
r = await anon('/api/catalog'); assert.equal(r.d.ads[0].url, ''); ok('unsafe ad URL sanitized');
r = await admin('/api/admin/settings', 'PUT', { payments: { 'EVC Plus': '252 634 000 009' } });
r = await anon('/api/catalog'); assert.equal(r.d.payments['EVC Plus'], '252634000009'); ok('payment numbers editable');


// ================= AUTOMATION =================
const hook = async (slug, body, secret = 'whsec_test') => {
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const rr = await fetch(base + '/api/webhooks/' + slug, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-signature': sig }, body: raw });
  let d = {}; try { d = await rr.json(); } catch {} return { s: rr.status, d };
};
const user3 = client();
await admin('/api/admin/settings', 'PUT', { payments: { 'EVC Plus': '252634000009', Zaad: '252634000002' } });
r = await user3('/api/register', 'POST', { name: 'Auto User', phone: '634555111', email: 'auto@test.local', password: 'password123' }); assert.equal(r.s, 200);
const orderStatus = async (id) => (await admin('/api/admin/orders')).d.orders.find((o) => o.id === id);
const mk = (ref, payer = '634555111') => user3('/api/orders', 'POST', { bundleId: b1.id, target: '654246143', method: 'EVC Plus', payer, txRef: ref });

r = await hook('evc', { txRef: 'X', amount: 5490 }, 'wrong-secret'); assert.equal(r.s, 401); ok('webhook with bad signature rejected');
r = await anon('/api/webhooks/nope', 'POST', {}); assert.equal(r.s, 404); ok('unknown webhook slug 404');

// 1) dalabka marka hore, lacagta kadib
r = await mk('AUTO1'); assert.equal(r.d.status, 'pending_payment'); const a1 = r.d.id;
r = await hook('evc', { txRef: 'auto1', amount: 5490, payer: '252634555111', status: 'success' }); assert.equal(r.s, 200); assert.equal(r.d.matched.status, 'paid');
assert.equal((await orderStatus(a1)).status, 'paid'); ok('payment arrives after order -> auto-confirmed (paid)');
r = await hook('evc', { txRef: 'AUTO1', amount: 5490, payer: '634555111' }); assert.equal(r.d.duplicate, true); ok('duplicate webhook is idempotent');

// 2) lacagta marka hore, dalabka kadib
r = await hook('evc', { txRef: 'PRE777', amount: 5490, payer: '634555111' }); assert.equal(r.d.matched, null);
r = await mk('PRE777'); assert.equal(r.d.status, 'paid'); ok('payment arrives before order -> paid immediately on submit');
r = await mk('PRE777'); assert.equal(r.s, 400); ok('same Transaction ID cannot be reused');

// 3) lacag yar
r = await mk('LOW1'); const low = r.d.id;
r = await hook('evc', { txRef: 'LOW1', amount: 1000, payer: '634555111' }); assert.equal(r.d.matched.status, 'review');
assert.equal((await orderStatus(low)).status, 'review'); ok('underpayment -> review (not delivered)');
r = await admin('/api/admin/orders/' + low + '/confirm', 'POST', {}); assert.equal(r.s, 200); ok('admin can confirm a review order');

// 4) payer ma is-waafaqsana
r = await mk('MIS1'); const mis = r.d.id;
r = await hook('evc', { txRef: 'MIS1', amount: 5490, payer: '634999999' }); assert.equal(r.d.matched.status, 'review'); ok('payer mismatch -> review (anti-fraud)');

// 5) wallet topup toos ah
r = await user3('/api/topups', 'POST', { amount: 10000, method: 'Zaad', payer: '634555111', txRef: 'TUP1' }); assert.equal(r.d.status, 'pending');
r = await hook('zaad', { txRef: 'TUP1', amount: 10000, payer: '634555111' }); assert.equal(r.d.matched.type, 'topup');
r = await user3('/api/me'); assert.equal(r.d.user.wallet, 10000); ok('wallet topup auto-credited from webhook');

// 6) gaarsiin toos ah (adapter-ka shirkadda)
const prov = await import('./providers.js');
let sent = [];
prov.setAdapter('somtel', async (o) => { sent.push(o.target_phone); return { ok: true }; });
await admin('/api/admin/settings', 'PUT', { auto_deliver: '1' });
const fb = (await admin('/api/admin/float')).d.float.find((x) => x.company === 'somtel').usd;
r = await mk('DEL1'); const d1 = r.d.id;
await hook('evc', { txRef: 'DEL1', amount: 5490, payer: '634555111' });
await new Promise((x) => setTimeout(x, 150));
assert.equal((await orderStatus(d1)).status, 'delivered'); assert.deepEqual(sent, ['654246143']); ok('auto-deliver via provider adapter -> delivered');
const fa = (await admin('/api/admin/float')).d.float.find((x) => x.company === 'somtel').usd; assert.ok(fb - fa > 0.9 && fb - fa < 1); ok('float reduced automatically');

// 7) API fashil
prov.setAdapter('somtel', async () => ({ ok: false, error: 'timeout' }));
r = await mk('DEL2'); const d2 = r.d.id;
await hook('evc', { txRef: 'DEL2', amount: 5490, payer: '634555111' });
await new Promise((x) => setTimeout(x, 150));
const o2 = await orderStatus(d2); assert.equal(o2.status, 'paid'); assert.match(o2.note, /API khalad/); ok('provider failure -> stays paid with note, retries later');

// 8) auto restock
let restocked = 0;
prov.setRestocker('somtel', async (usd) => { restocked = usd; return { ok: true }; });
await admin('/api/admin/settings', 'PUT', { auto_restock: '1', float_thr: 1000 });
prov.setAdapter('somtel', async () => ({ ok: true }));
r = await mk('DEL3'); await hook('evc', { txRef: 'DEL3', amount: 5490, payer: '634555111' });
await new Promise((x) => setTimeout(x, 150));
assert.equal(restocked, 100); ok('auto-restock triggered when float is low');
await admin('/api/admin/settings', 'PUT', { auto_deliver: '0', auto_restock: '0', float_thr: 30 });
prov.setAdapter('somtel', null);

r = await admin('/api/admin/payments-in'); assert.ok(r.d.payments.length >= 6); ok('admin sees incoming payments log');
r = await admin('/api/admin/stats'); assert.ok('unmatchedPayments' in r.d); ok('stats include unmatched payments');


// ================= SMS + MERCHANT CONVERT =================
const sms = async (slug, body, token = 'smstok') => {
  const rr = await fetch(base + '/api/webhooks/sms/' + slug, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  let d = {}; try { d = await rr.json(); } catch {} return { s: rr.status, d };
};
r = await admin('/api/admin/settings', 'PUT', {
  sms_rules: {
    zaad: { amount: 'Sh\\s?([\\d,]+)', txRef: 'Tx:\\s?(\\w+)', payer: 'ka timid\\s?(\\d{9})', currency: 'SOS' },
    evc: { amount: '\\$\\s?([\\d.]+)', payer: 'from\\s?(\\d{9})', currency: 'USD' },
  },
  sms_senders: { zaad: ['Zaad'] },
}); assert.equal(r.s, 200); ok('SMS rules saved');
r = await admin('/api/admin/settings', 'PUT', { sms_rules: { zaad: { amount: '([', currency: 'SOS' } } }); assert.equal(r.s, 400); ok('invalid regex rejected');
r = await admin('/api/admin/sms/test', 'POST', { slug: 'zaad', message: 'Waxaad heshay Sh5,490 ka timid 634555111. Tx: ZD001' });
assert.equal(r.d.amount, 5490); assert.equal(r.d.txRef, 'ZD001'); assert.equal(r.d.payer, '634555111'); ok('admin SMS test tool parses a sample');

r = await sms('zaad', { message: 'x', sender: 'Zaad' }, 'bad'); assert.equal(r.s, 401); ok('SMS endpoint requires token');
r = await sms('zaad', { message: 'Waxaad heshay Sh5,490 ka timid 634555111. Tx: ZD001', sender: 'Hacker' }); assert.equal(r.s, 403); ok('SMS from non-allowed sender rejected');
r = await sms('zaad', { message: 'Ku soo dhawaaw adeegga Zaad', sender: 'Zaad' }); assert.equal(r.s, 200); assert.equal(r.d.ignored, true); ok('non-payment SMS ignored');

const zmk = (ref) => user3('/api/orders', 'POST', { bundleId: b1.id, target: '654246143', method: 'Zaad', payer: '634555111', txRef: ref });
r = await zmk('ZD001'); const z1 = r.d.id;
r = await sms('zaad', { message: 'Waxaad heshay Sh5,490 ka timid 634555111. Tx: ZD001', sender: 'Zaad' }); assert.equal(r.d.matched.status, 'paid');
assert.equal((await orderStatus(z1)).status, 'paid'); ok('SMS reader confirms order automatically');

r = await user3('/api/orders', 'POST', { bundleId: b1.id, target: '654246143', method: 'EVC Plus', payer: '634555111', txRef: 'NOREF1' }); const nr = r.d.id;
r = await sms('evc', { message: 'You received $0.96 from 634555111' }); assert.equal(r.d.matched.status, 'paid');
assert.equal((await orderStatus(nr)).status, 'paid'); ok('SMS without transaction ID matched by payer + amount (USD converted)');

await admin('/api/admin/settings', 'PUT', { sms_auto_max: 1000 });
r = await zmk('ZD002'); const z2 = r.d.id;
r = await sms('zaad', { message: 'Waxaad heshay Sh5,490 ka timid 634555111. Tx: ZD002', sender: 'Zaad' }); assert.equal(r.d.matched.status, 'review');
await admin('/api/admin/settings', 'PUT', { sms_auto_max: 60000 }); ok('large SMS-confirmed order goes to review (spoofing guard)');

// ---- lacagta merchant-ka ----
r = await admin('/api/admin/float'); const zb = r.d.merchant.find((m) => m.method === 'Zaad'); assert.ok(zb && zb.usd > 0); ok('merchant balance tracked per payment method');
r = await admin('/api/admin/float/restock', 'POST', { company: 'telesom', usd: 100000, from: 'Zaad' }); assert.equal(r.s, 400); ok('restock from merchant rejected when balance too small');

const calls = [];
for (const c of ['somtel', 'telesom', 'soltelco']) prov.setRestocker(c, async (usd, from) => { calls.push({ c, usd, from }); return { ok: true }; });
await admin('/api/admin/settings', 'PUT', { auto_convert: '1', convert_usd: 1 });
const floatBefore = Object.fromEntries((await admin('/api/admin/float')).d.float.map((x) => [x.company, x.usd]));
const zBefore = (await admin('/api/admin/float')).d.merchant.find((m) => m.method === 'Zaad').usd;
r = await sms('zaad', { message: 'Waxaad heshay Sh20,000 ka timid 634777000. Tx: ZD003', sender: 'Zaad' }); assert.equal(r.s, 200);
await new Promise((x) => setTimeout(x, 200));
assert.equal(calls.length, 1); assert.equal(calls[0].from, 'Zaad'); assert.ok(calls[0].usd >= 1); ok('merchant balance reached threshold -> auto-convert requested');
const fa2 = (await admin('/api/admin/float')).d; const zAfter = fa2.merchant.find((m) => m.method === 'Zaad');
assert.ok(!zAfter || zAfter.usd < zBefore + 20000 / 5750 - 0.5); ok('merchant balance debited after conversion');
const gained = fa2.float.find((x) => x.company === calls[0].c).usd - floatBefore[calls[0].c]; assert.ok(Math.abs(gained - calls[0].usd * 1.17) < 1e-6); ok('float credited with bonus after conversion');
await admin('/api/admin/settings', 'PUT', { auto_convert: '0' });
for (const c of ['somtel', 'telesom', 'soltelco']) prov.setRestocker(c, null);

// blocked user
r = await admin('/api/admin/users/' + uid, 'PUT', { status: 'blocked' });
r = await user('/api/me'); assert.equal(r.s, 401); ok('blocked user loses session');

const bk = await fetch(base + '/api/admin/backup', { headers: { Cookie: '' } }); assert.equal(bk.status, 401);
ok('backup requires admin');

// CSRF-ish: wrong content type
const raw = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }); assert.equal(raw.status, 415); ok('non-JSON POST rejected');

// static + traversal
let s = await fetch(base + '/'); assert.equal(s.status, 200); assert.match(await s.text(), /Dankali/); ok('user app served');
s = await fetch(base + '/admin/'); assert.equal(s.status, 200); ok('admin app served');
s = await fetch(base + '/icon-192.png'); assert.equal(s.status, 200); ok('icons served');
const trav = (p) => new Promise((res) => http.get({ host: '127.0.0.1', port: server.address().port, path: p }, (x) => { x.resume(); res(x.statusCode); }));
for (const p of ['/%2e%2e/server.js', '/..%2fserver.js', '/%2e%2e%2fdb.js']) assert.ok([403, 404].includes(await trav(p)), p);
ok('path traversal blocked');

console.log(`\nDhammaan ${n} tijaabo way gudbeen \u2705`);
server.close(); process.exit(0);
