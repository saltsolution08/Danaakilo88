import crypto from 'node:crypto';
import { get, all, run, tx, getSetting } from './db.js';
import { deliverViaProvider, restockViaProvider } from './providers.js';

export class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const now = () => Date.now();
const last9 = (s) => String(s || '').replace(/\D/g, '').slice(-9);
const ledger = (uid, amt, type, ref) => run('INSERT INTO ledger(user_id,amount,type,ref,created) VALUES(?,?,?,?,?)', uid, amt, type, ref || null, now());

// ---- gaarsiinta ----
export function markDelivered(id, note) {
  return tx(() => {
    const o = get('SELECT * FROM orders WHERE id=?', id);
    if (!o) throw new HttpError(404, 'Dalabka lama helin');
    if (o.status !== 'paid') throw new HttpError(400, 'Xaaladda dalabka ma ogola tallaabadan');
    run("UPDATE orders SET status='delivered', updated=?, note=COALESCE(?,note) WHERE id=?", now(), note || null, id);
    const cost = o.base / getSetting('rate', 5750);
    run('UPDATE float SET usd=usd-? WHERE company=?', cost, o.company);
    run('INSERT INTO float_log(company,usd,kind,note,created) VALUES(?,?,?,?,?)', o.company, -cost, 'sale', 'order#' + id, now());
    return o;
  });
}

export async function maybeRestock(company) {
  if (getSetting('auto_restock', '0') !== '1') return;
  const fl = get('SELECT usd FROM float WHERE company=?', company);
  if (!fl || fl.usd >= getSetting('float_thr', 30)) return;
  const usd = getSetting('restock_usd', 100);
  const r = await restockViaProvider(company, usd);
  if (r.ok) {
    const got = usd * (1 + getSetting('bonus', 17) / 100);
    tx(() => {
      run('UPDATE float SET usd=usd+? WHERE company=?', got, company);
      run('INSERT INTO float_log(company,usd,kind,note,created) VALUES(?,?,?,?,?)', company, got, 'restock', `auto: $${usd} la iibsaday`, now());
    });
  } else if (!r.manual) console.error('Auto-restock fashilmay', company, r.error);
}

export async function autoDeliver(id, attempt = 0) {
  if (getSetting('auto_deliver', '0') !== '1') return;
  const o = get('SELECT * FROM orders WHERE id=?', id);
  if (!o || o.status !== 'paid') return;
  const pr = await deliverViaProvider(o);
  if (pr.ok) { markDelivered(id, 'Si toos ah ayaa loo gaarsiiyay'); await maybeRestock(o.company); return; }
  if (pr.manual) return; // adapter ma jiro: admin ayaa gacanta u diraya
  const waits = [30000, 120000, 600000];
  if (attempt < waits.length) {
    run('UPDATE orders SET note=?, updated=? WHERE id=?', `API khalad (${attempt + 1}): ${pr.error || ''} - dib ayaa loo isku dayayaa`, now(), id);
    setTimeout(() => autoDeliver(id, attempt + 1).catch(() => {}), waits[attempt]).unref();
  } else run('UPDATE orders SET note=?, updated=? WHERE id=?', `API-gu wuu fashilmay (${pr.error || ''}): gacan u dir ama diid`, now(), id);
}

// ---- lacagta merchant-ka (xisaabta $) ----
export function creditMerchant(method, sh, note) {
  const usd = sh / getSetting('rate', 5750);
  run('INSERT INTO merchant_ledger(method,usd,kind,note,created) VALUES(?,?,?,?,?)', method, usd, 'in', note || null, now());
}
export const merchantBalances = () => all('SELECT method, SUM(usd) usd FROM merchant_ledger GROUP BY method HAVING ABS(SUM(usd))>0.000001 ORDER BY usd DESC');
let converting = false;
// marka lacagta merchant-ka ee hal wallet ah gaarto xadka ($30), u beddel float shirkadda ugu hooseysa
export async function maybeConvert() {
  if (converting || getSetting('auto_convert', '0') !== '1') return;
  const th = getSetting('convert_usd', 30);
  const from = merchantBalances()[0];
  if (!from || from.usd < th) return;
  converting = true;
  try {
    const comp = all('SELECT company FROM float ORDER BY usd ASC, company')[0].company;
    const amount = Math.floor(from.usd);
    const r = await restockViaProvider(comp, amount, from.method);
    if (r.ok) {
      const got = amount * (1 + getSetting('bonus', 17) / 100);
      tx(() => {
        run('INSERT INTO merchant_ledger(method,usd,kind,note,created) VALUES(?,?,?,?,?)', from.method, -amount, 'convert', 'float ' + comp, now());
        run('UPDATE float SET usd=usd+? WHERE company=?', got, comp);
        run('INSERT INTO float_log(company,usd,kind,note,created) VALUES(?,?,?,?,?)', comp, got, 'restock', `auto: $${amount} laga bixiyay ${from.method}`, now());
      });
    } else if (!r.manual) console.error('Auto-convert fashilmay', comp, r.error);
  } finally { converting = false; }
}

// ---- lacagaha soo gala ----
function applyPayment(pid) {
  const p = get('SELECT * FROM payments_in WHERE id=?', pid);
  if (!p || p.matched_type) return null;
  let o = get("SELECT * FROM orders WHERE UPPER(tx_ref)=UPPER(?) AND method=? AND status='pending_payment'", p.tx_ref, p.method);
  if (!o && p.tx_ref.startsWith('SMS-') && p.payer) { // fariinta aan Transaction ID lahayn: ku xir lambarka bixiyay + qadarka (60 daqiiqo)
    o = all("SELECT * FROM orders WHERE method=? AND status='pending_payment' AND price<=? AND created>? ORDER BY id", p.method, p.amount, now() - 3600000).find((x) => last9(x.payer_phone) === last9(p.payer)) || null;
  }
  if (o) {
    const payerOk = !p.payer || !o.payer_phone || last9(p.payer) === last9(o.payer_phone);
    return tx(() => {
      run('UPDATE payments_in SET matched_type=?, matched_id=? WHERE id=?', 'order', o.id, p.id);
      const cap = getSetting('sms_auto_max', 60000), capOk = p.source !== 'sms' || o.price <= cap;
      if (payerOk && capOk && p.amount >= o.price) {
        run("UPDATE orders SET status='paid', updated=?, note=? WHERE id=?", now(), p.amount > o.price ? 'Lacagta si toos ah ayaa loo xaqiijiyay (lacag dheeraad ah ayaa timid)' : 'Lacagta si toos ah ayaa loo xaqiijiyay', o.id);
        return { type: 'order', id: o.id, status: 'paid' };
      }
      run("UPDATE orders SET status='review', updated=?, note=? WHERE id=?", now(), !payerOk ? 'Lambarka bixiyay ma is-waafaqsana' : !capOk ? `Dalab weyn (SMS): hubi gacanta` : `Lacagta la helay (${p.amount}) way ka yar tahay (${o.price})`, o.id);
      return { type: 'order', id: o.id, status: 'review' };
    });
  }
  let t = get("SELECT * FROM topups WHERE UPPER(tx_ref)=UPPER(?) AND method=? AND status='pending'", p.tx_ref, p.method);
  if (!t && p.tx_ref.startsWith('SMS-') && p.payer) t = all("SELECT * FROM topups WHERE method=? AND status='pending' AND amount<=? AND created>? ORDER BY id", p.method, p.amount, now() - 3600000).find((x) => last9(x.payer_phone) === last9(p.payer)) || null;
  if (t && (!p.payer || !t.payer_phone || last9(p.payer) === last9(t.payer_phone))) {
    return tx(() => {
      run('UPDATE payments_in SET matched_type=?, matched_id=? WHERE id=?', 'topup', t.id, p.id);
      run("UPDATE topups SET status='approved', amount=?, updated=? WHERE id=?", p.amount, now(), t.id);
      run('UPDATE users SET wallet=wallet+? WHERE id=?', p.amount, t.user_id);
      ledger(t.user_id, p.amount, 'topup', 'topup#' + t.id);
      return { type: 'topup', id: t.id, status: 'approved' };
    });
  }
  return null;
}
function afterMatch(res) { if (res && res.type === 'order' && res.status === 'paid') autoDeliver(res.id).catch((e) => console.error('autoDeliver', e)); return res; }

export function ingestPayment({ method, txRef, amount, payer, raw, source = 'webhook' }) {
  let ref = String(txRef || '').replace(/[^\w-]/g, '').slice(0, 40).toUpperCase();
  if (!ref && source === 'sms') ref = 'SMS-' + crypto.createHash('sha256').update(String(raw || '')).digest('hex').slice(0, 16).toUpperCase();
  const amt = Math.round(Number(amount));
  if (!ref || !(amt > 0)) throw new HttpError(400, 'Xogta lacagta waa khalad');
  const r = run('INSERT OR IGNORE INTO payments_in(method,tx_ref,amount,payer,raw,source,created) VALUES(?,?,?,?,?,?,?)', method, ref, amt, String(payer || '').replace(/\D/g, '').slice(0, 15), String(raw || '').slice(0, 2000), source, now());
  if (Number(r.changes) === 0) return { ok: true, duplicate: true };
  creditMerchant(method, amt, 'payment#' + r.lastInsertRowid);
  const out = { ok: true, matched: afterMatch(applyPayment(Number(r.lastInsertRowid))) };
  maybeConvert().catch((e) => console.error('convert', e));
  return out;
}
// marka macmiilku Transaction ID geliyo, hubi haddii lacagtu hore u soo gashay
export function matchAfterCreate(method, txRef) {
  const p = get('SELECT id FROM payments_in WHERE method=? AND tx_ref=UPPER(?) AND matched_type IS NULL', method, txRef);
  return p ? afterMatch(applyPayment(p.id)) : null;
}
