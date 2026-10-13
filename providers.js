// ============================================================
//  PROVIDERS: halkan ayaa lagu xiraa API-ga shirkadaha (Somtel, Telesom, Soltelco)
//
//  PROVIDER_MODE=manual (default) -> Admin ayaa gacanta ku diraya data-da, kadibna riixa "Gaarsiiyay".
//  PROVIDER_MODE=api              -> server-ku wuxuu isticmaalaa adapter-ka shirkaddaas (hoose).
//
//  Adapter kasta waa async function:
//     deliver(order) -> { ok: true }  ama  { ok: false, error: '...' }
//  order waxaa ku jira: id, company, bundle_name, category, target_phone (9 lambar), base, price.
//
//  ADMIN > Settings > "Si toos ah u gaarsii" waa in la shiday si data-du u socoto marka lacagta la xaqiijiyo.
// ============================================================
const adapters = {
  // Tusaale (beddel marka aad hesho documentation-ka):
  // somtel: async (order) => {
  //   const r = await fetch(process.env.SOMTEL_API_URL, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.SOMTEL_API_KEY },
  //     body: JSON.stringify({ msisdn: '252' + order.target_phone, product: order.bundle_name, ref: 'dankali-' + order.id }),
  //   });
  //   const d = await r.json();
  //   return r.ok && d.success ? { ok: true } : { ok: false, error: d.message };
  // },
  somtel: null,
  telesom: null,
  soltelco: null,
};

// Ikhtiyaari: iibsiga float si toos ah (haddii shirkaddu API u leedahay). restock(usd, fromMethod) -> { ok } | { ok:false, error }
// fromMethod = wallet-ka merchant-ka laga bixinayo (tusaale 'Zaad').
const restockers = { somtel: null, telesom: null, soltelco: null };

export function setAdapter(company, fn) { adapters[company] = fn; }       // tijaabo
export function setRestocker(company, fn) { restockers[company] = fn; }   // tijaabo

export async function deliverViaProvider(order) {
  const mode = (process.env.PROVIDER_MODE || 'manual').toLowerCase();
  const adapter = adapters[order.company];
  if (mode !== 'api' || !adapter) return { ok: false, manual: true };
  try { return await adapter(order); }
  catch (e) { return { ok: false, error: e.message }; }
}

export async function restockViaProvider(company, usd, from) {
  const mode = (process.env.PROVIDER_MODE || 'manual').toLowerCase();
  const fn = restockers[company];
  if (mode !== 'api' || !fn) return { ok: false, manual: true };
  try { return await fn(usd, from); }
  catch (e) { return { ok: false, error: e.message }; }
}
