// ============================================================
//  PAYMENTS: sida server-ku u arko lacagaha soo gala (EVC Plus, Zaad, eDahab, Soltelco).
//
//  Laba hab ayaa jira (adapter kasta wuxuu isticmaali karaa midkood ama labadaba):
//   1) WEBHOOK  : lacag-bixiyaha ayaa server-kaaga u diraya ogeysiis marka lacag timaado:
//                 POST https://magacaaga/api/webhooks/evc   (evc | zaad | edahab | soltelco)
//   2) POLLING  : server-ku ayaa 30 ilbiriqsi kasta weydiiya liiska lacagaha soo galay (pollers hoose).
//
//  Adapter-ku waa inuu sameeyaa:
//     verify(slug, req, rawBody) -> true/false     (hubi in ogeysiisku run yahay)
//     parse(body)                -> { txRef, amount, payer }  ama null (haddii aan guul ahayn)
//  amount waa inuu ahaadaa **Sh** (haddii lacagtu dollar tahay, halkan u beddel Sh).
//
//  Hadda dhammaan waxay isticmaalaan "generic" adapter: JSON { txRef, amount, payer, status } oo lagu saxiixay
//  HMAC-SHA256 (header: x-signature) iyadoo la isticmaalayo WEBHOOK_SECRET. Marka aad hesho docs-ka dhabta ah,
//  beddel adapter kasta si uu ula mid noqdo qaabka lacag-bixiyaha.
// ============================================================
import crypto from 'node:crypto';

export const SLUGS = { evc: 'EVC Plus', zaad: 'Zaad', edahab: 'eDahab (Somtel)', soltelco: 'Soltelco' };
const secretFor = (slug) => process.env['WEBHOOK_SECRET_' + slug.toUpperCase()] || process.env.WEBHOOK_SECRET || '';

const generic = {
  verify(slug, req, raw) {
    const secret = secretFor(slug); if (!secret) return false;
    const sig = String(req.headers['x-signature'] || '').replace(/^sha256=/, '');
    const exp = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    return sig.length === exp.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp));
  },
  parse(body) {
    if (body.status && !['success', 'paid', 'completed'].includes(String(body.status).toLowerCase())) return null;
    return { txRef: body.txRef || body.transaction_id, amount: body.amount, payer: body.payer || body.sender };
  },
};

export const adapters = { evc: generic, zaad: generic, edahab: generic, soltelco: generic };

// Polling (ikhtiyaari): slug -> async () => [{ txRef, amount, payer }]
export const pollers = {
  // evc: async () => { const r = await fetch(process.env.EVC_TX_URL, { headers: { Authorization: '...' } }); ... return [...]; },
};

// ============================================================
//  SMS: taleefanka merchant-ka ayaa fariinta lacag-helka u diraya server-ka (app-ka SMS forwarder).
//  Qaab kasta oo fariin ah waxaa lagu qeexaa Admin > Settings > "SMS" (regex), kadibna waxaad tijaabin kartaa.
//  rules[slug] = { amount: 'regex', txRef: 'regex', payer: 'regex', currency: 'USD' | 'SOS' }
//  Regex kasta waa inuu lahaado hal (group) oo qabanaya qiimaha.
// ============================================================
const pick = (re, text) => { const m = re.exec(text); if (!m) return ''; for (let i = 1; i < m.length; i++) if (m[i]) return m[i]; return ''; };
export function parseSms(rules, message, rate) {
  const msg = String(message || '').slice(0, 600);
  if (!rules || !rules.amount) return { error: 'Xeerka amount lama dhigin' };
  let amountRaw, txRef = '', payer = '';
  try {
    amountRaw = pick(new RegExp(rules.amount, 'i'), msg);
    if (rules.txRef) txRef = pick(new RegExp(rules.txRef, 'i'), msg);
    if (rules.payer) payer = pick(new RegExp(rules.payer, 'i'), msg);
  } catch (e) { return { error: 'Regex khalad: ' + e.message }; }
  const n = Number(String(amountRaw).replace(/,/g, ''));
  if (!(n > 0)) return { error: 'Qadarka lama helin fariinta' };
  const sh = rules.currency === 'USD' ? Math.round(n * rate) : Math.round(n);
  return { amount: sh, amountRaw: n, currency: rules.currency === 'USD' ? 'USD' : 'SOS', txRef: txRef.replace(/[^\w-]/g, ''), payer: payer.replace(/\D/g, '') };
}
