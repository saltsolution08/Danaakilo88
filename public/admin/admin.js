(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f = (n) => 'Sh' + Number(n).toLocaleString();
const when = (t) => new Date(t).toLocaleString();
const CO = { somtel: 'Somtel', telesom: 'Telesom', soltelco: 'Soltelco' };
const TABS = [['dash', 'Guudmar'], ['orders', 'Dalabyada'], ['topups', 'Lacag-shub'], ['pin', 'Lacag-soo-gashay'], ['users', 'Isticmaalayaasha'], ['float', 'Float'], ['prices', 'Qiimaha'], ['ads', 'Xayeysiis'], ['set', 'Settings']];
const ST = { pending_payment: ['Sugaya lacag', 'wt'], paid: ['La bixiyay (loo diro)', 'wt'], review: ['Baaritaan (lacag/xog khalad)', 'rd'], delivered: ['La gaarsiiyay', 'ok'], failed: ['Fashilmay', 'rd'] };
let ME = null, tab = 'dash', ofilter = '', D = {}, imgs = {}, busy = false, lastPending = -1, uq = '';

async function api(p, o = {}) {
  const r = await fetch('/api' + p, { method: o.m || 'GET', credentials: 'same-origin', headers: o.b ? { 'Content-Type': 'application/json' } : {}, body: o.b ? JSON.stringify(o.b) : undefined });
  let d = {}; try { d = await r.json(); } catch { /* ignore */ }
  if (!r.ok) throw new Error(d.error || 'Khalad ayaa dhacay');
  return d;
}
const post = (p, b = {}) => api(p, { m: 'POST', b });
function toast(m) { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 3000); }
const val = (id) => ($(id) ? $(id).value.trim() : '');
async function guard(btn, fn) { if (busy) return; busy = true; if (btn) btn.disabled = true; try { await fn(); } catch (e) { toast(e.message); } finally { busy = false; if (btn) btn.disabled = false; } }

// ---------- data loading ----------
async function load(silent) {
  try {
    if (tab === 'dash') D.stats = await api('/admin/stats');
    if (tab === 'orders') D.orders = (await api('/admin/orders' + (ofilter ? '?status=' + ofilter : ''))).orders;
    if (tab === 'topups') D.topups = (await api('/admin/topups')).topups;
    if (tab === 'pin') D.pin = (await api('/admin/payments-in')).payments;
    if (tab === 'users') D.users = (await api('/admin/users?q=' + encodeURIComponent(uq))).users;
    if (tab === 'float') D.float = await api('/admin/float');
    if (tab === 'prices') D.bundles = (await api('/admin/bundles')).bundles;
    if (tab === 'ads') D.ads = (await api('/admin/ads')).ads;
    if (tab === 'set') D.set = await api('/admin/settings');
    const s = await api('/admin/stats'); D.stats = s;
    const n = s.pendingPayment + s.toDeliver + s.pendingTopups;
    document.title = (n ? `(${n}) ` : '') + 'Dankali Admin';
    if (lastPending >= 0 && n > lastPending) beep();
    lastPending = n;
  } catch (e) { if (/gal|401/i.test(e.message)) { ME = null; } else if (!silent) toast(e.message); }
  render();
}
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 880; o.start(); o.stop(a.currentTime + 0.25); } catch { /* ignore */ } }
async function go(t) { tab = t; imgs = {}; render(); await load(); }

// ---------- views ----------
function loginView() {
  return `<div class="card" style="max-width:380px;margin:30px auto"><h2 style="margin:0 0 6px">Maamulaha</h2><p class="mu">Gal adigoo isticmaalaya email-ka iyo password-ka maamulaha.</p>
  <input id="le" type="email" placeholder="Email" autocomplete="username"><input id="lw" type="password" placeholder="Password" autocomplete="current-password"><button class="btn" data-a="login">Gal</button></div>`;
}
function dash() {
  const s = D.stats; if (!s) return '<p class="mu">Waa la furayaa...</p>';
  return `<div class="g" style="margin-top:10px">
  <div class="k"><small>Iibka maanta</small><b>${f(s.salesToday)}</b></div><div class="k"><small>La gaarsiiyay maanta</small><b>${s.deliveredToday}</b></div>
  <div class="k" data-a="tab" data-t="orders" data-f="pending_payment"><small>Sugaya xaqiijin lacag</small><b class="${s.pendingPayment ? 'wt' : ''}">${s.pendingPayment}</b></div>
  <div class="k" data-a="tab" data-t="orders" data-f="paid"><small>Loo diro (la bixiyay)</small><b class="${s.toDeliver ? 'rd' : ''}">${s.toDeliver}</b></div>
  <div class="k" data-a="tab" data-t="topups"><small>Codsiyada shubka</small><b class="${s.pendingTopups ? 'wt' : ''}">${s.pendingTopups}</b></div>
  <div class="k" data-a="tab" data-t="pin"><small>Lacag lama xirin (24 saac)</small><b class="${s.unmatchedPayments ? 'wt' : ''}">${s.unmatchedPayments}</b></div>
  <div class="k"><small>Isticmaalayaal</small><b>${s.users}</b></div><div class="k"><small>Wallet-yada macaamiisha</small><b>${f(s.userWallets)}</b></div></div>
  ${s.lowFloat.length ? `<div class="card"><b class="rd">Float hoose!</b><p class="mu">${s.lowFloat.map((c) => esc(CO[c])).join(', ')} wuu ka hooseeyaa $${s.floatThr}. Dalab float cusub tab-ka Float.</p></div>` : ''}
  <div class="card"><b>Float-ka shirkadaha</b>${s.float.map((x) => `<div class="r"><span>${esc(CO[x.company])}</span><b class="${x.usd < s.floatThr ? 'wt' : 'ok'}">$${x.usd.toFixed(2)}</b></div>`).join('')}</div>`;
}
function orders() {
  const fl = [['', 'Dhammaan'], ['pending_payment', 'Sugaya lacag'], ['paid', 'Loo diro'], ['delivered', 'La gaarsiiyay'], ['failed', 'Fashilmay']];
  const rows = (D.orders || []).map((o) => {
    const s = ST[o.status] || [o.status, ''];
    const acts = (o.status === 'pending_payment' || o.status === 'review') ? `<button class="btn sm" data-a="oconf" data-id="${o.id}">Xaqiiji lacagta</button><button class="btn sm ghost" data-a="orej" data-id="${o.id}">Diid</button>`
      : o.status === 'paid' ? `<button class="btn sm" data-a="odel" data-id="${o.id}">Gaarsiiyay</button><button class="btn sm ghost" data-a="orej" data-id="${o.id}">Diid</button>` : '';
    return `<div class="card"><div class="r" style="border:0;padding:0"><b>#${o.id} \u00b7 ${esc(CO[o.company] || o.company)} ${esc(o.bundle_name)}</b><b class="${s[1]}">${s[0]}</b></div>
    <div class="mu">${esc(o.category)} \u00b7 ${when(o.created)}</div>
    <div style="margin-top:6px">Macmiil: <b>${esc(o.uname)}</b> (+252${esc(o.uphone)})</div>
    <div>Data-da u dir: <b>${esc(o.target_phone)}</b> <button class="btn sm ghost" data-a="copy" data-v="${esc(o.target_phone)}">Koobiyee</button></div>
    <div class="mu">${esc(o.method)}${o.payer_phone ? ' \u00b7 ' + esc(o.payer_phone) : ''}${o.tx_ref ? ' \u00b7 ID: ' + esc(o.tx_ref) : ''} \u00b7 <b>${f(o.price)}</b></div>
    ${o.note ? `<div class="mu">Fiiro: ${esc(o.note)}</div>` : ''}${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
  }).join('');
  return `<div class="tabs" style="margin-top:8px">${fl.map((x) => `<button class="${ofilter === x[0] ? 'on' : ''}" data-a="ofilter" data-f="${x[0]}">${x[1]}</button>`).join('')}</div>${rows || '<p class="mu">Dalab ma jiro.</p>'}`;
}
function topups() {
  const rows = (D.topups || []).map((t) => `<div class="card"><div class="r" style="border:0;padding:0"><b>${f(t.amount)}</b><span class="wt">Sugaya</span></div>
  <div>${esc(t.uname)} (+252${esc(t.uphone)})</div><div class="mu">${esc(t.method)} \u00b7 ${esc(t.payer_phone)} \u00b7 ID: ${esc(t.tx_ref)} \u00b7 ${when(t.created)}</div>
  <div class="acts"><button class="btn sm" data-a="tapp" data-id="${t.id}">Ogolow (ku dar wallet)</button><button class="btn sm ghost" data-a="trej" data-id="${t.id}">Diid</button></div></div>`).join('');
  return `<h3>Codsiyada shubka ee sugaya</h3>${rows || '<p class="mu">Wax codsi ah ma jiro.</p>'}`;
}
function pin() {
  const rows = (D.pin || []).map((p) => `<div class="r"><div><b>${f(p.amount)}</b> \u00b7 ${esc(p.method)}<div class="mu">ID: ${esc(p.tx_ref)}${p.payer ? ' \u00b7 ' + esc(p.payer) : ''} \u00b7 ${when(p.created)}</div></div><b class="${p.matched_type ? 'ok' : 'wt'}">${p.matched_type ? 'La xiray (' + (p.matched_type === 'order' ? 'dalab #' : 'shub #') + p.matched_id + ')' : 'Lama xirin'}</b></div>`).join('');
  return `<div class="card"><b>Lacagaha API-gu arkay</b><p class="mu">Lacag kasta oo soo gasha merchant-kaaga waxay halkan ka muuqataa. "Lama xirin" macnaheedu waa: weli macmiil ma geliyin Transaction ID-ga. Marka uu geliyo, si toos ah ayaa loo xirayaa.</p>${rows || '<p class="mu">Weli lacag lama arkin.</p>'}</div>`;
}
function users() {
  const rows = (D.users || []).map((u) => `<div class="card"><div class="r" style="border:0;padding:0"><b>${esc(u.name)} ${u.role === 'admin' ? '<span class="pill">ADMIN</span>' : ''}</b><b>${f(u.wallet)}</b></div>
  <div class="mu">+252${esc(u.phone)} \u00b7 ${esc(u.email)} \u00b7 ${when(u.created)}</div>
  ${u.role === 'admin' ? '' : `<div class="acts"><button class="btn sm ${u.reseller ? '' : 'ghost'}" data-a="ures" data-id="${u.id}" data-v="${u.reseller ? 0 : 1}">${u.reseller ? 'Reseller \u2713' : 'Ka dhig Reseller'}</button>
  <button class="btn sm ghost" data-a="ublk" data-id="${u.id}" data-v="${u.status === 'blocked' ? 'active' : 'blocked'}">${u.status === 'blocked' ? 'Furo' : 'Xannibo'}</button></div>
  <div class="row" style="margin-top:8px"><input id="adj_${u.id}" type="number" placeholder="Wallet (+/- Sh)"><button class="btn sm" style="flex:none" data-a="uadj" data-id="${u.id}">Beddel</button></div>`}</div>`).join('');
  return `<div class="row" style="margin-top:8px"><input id="uq" placeholder="Raadi magac, email, telefoon" value="${esc(uq)}"><button class="btn sm" style="flex:none" data-a="usearch">Raadi</button></div>${rows || '<p class="mu">Lama helin.</p>'}`;
}
function float() {
  const x = D.float; if (!x) return '';
  return `<div class="card"><b>Float ($)</b><p class="mu">Bonus: ${x.bonus}% \u00b7 Digniin marka uu ka hooseeyo $${x.thr}. Tusaale: $${x.restockUsd} \u2192 $${(x.restockUsd * (1 + x.bonus / 100)).toFixed(0)}</p>
  ${x.float.map((c) => `<div class="r"><div>${esc(CO[c.company])}<div class="${c.usd < x.thr ? 'wt' : 'ok'}">${c.usd < x.thr ? 'Hoose' : 'Wanaagsan'}</div></div><div class="row" style="flex:none;align-items:center"><b>$${c.usd.toFixed(2)}</b><input id="rs_${c.company}" type="number" style="width:90px" value="${x.restockUsd}"><button class="btn sm" data-a="restock" data-k="${c.company}">Diiwaan geli</button></div></div>`).join('')}
  <p class="mu">Marka aad shirkadda ka iibsato float (USSD/app), halkan ku diiwaan geli qadarka aad bixisay. Float-ku wuxuu hoos u dhacaa marka dalab la gaarsiiyo.</p></div>
  <div class="card"><b>Taariikhda</b>${x.log.map((l) => `<div class="r"><span>${esc(CO[l.company])} \u00b7 ${esc(l.note || l.kind)}</span><b class="${l.usd < 0 ? 'rd' : 'ok'}">${l.usd < 0 ? '' : '+'}$${l.usd.toFixed(2)}</b></div>`).join('') || '<p class="mu">Weli ma jirto.</p>'}</div>`;
}
function bRow(b) {
  return `<div class="card" style="margin:6px 0"><div class="f2"><input id="b${b.id}_name" value="${esc(b.name)}" placeholder="Magac"><input id="b${b.id}_cat" value="${esc(b.category)}" placeholder="Qayb"><input id="b${b.id}_price" type="number" value="${b.price}" placeholder="Qiimo"><input id="b${b.id}_val" value="${esc(b.validity)}" placeholder="Muddo"></div>
  <div class="acts"><label class="mu"><input id="b${b.id}_act" type="checkbox" style="width:auto" ${b.active ? 'checked' : ''}> Shaqeynaya</label><button class="btn sm" data-a="bsave" data-id="${b.id}" data-c="${b.company}">Kaydi</button><button class="btn sm ghost" data-a="bdel" data-id="${b.id}">Tirtir</button></div></div>`;
}
function prices() {
  return Object.keys(CO).map((k) => `<div class="card"><b>${CO[k]}</b>${(D.bundles || []).filter((b) => b.company === k).map(bRow).join('')}
  <div class="mu" style="margin-top:10px">Baakad cusub</div><div class="f2"><input id="n_${k}_name" placeholder="Magac (1GB)"><input id="n_${k}_cat" placeholder="Qayb (Casri Bundle)"><input id="n_${k}_price" type="number" placeholder="Qiimo (Sh)"><input id="n_${k}_val" placeholder="Muddo (1 toddobaad)"></div>
  <button class="btn sm" style="margin-top:6px" data-a="badd" data-k="${k}">+ Ku dar</button></div>`).join('');
}
function ads() {
  return `<div class="card"><b>Xayeysiisyada</b><p class="mu">Waxay ka muuqdaan bogga hore ee app-ka. Sawirka ugu fiican: 800\u00d7400.</p><button class="btn sm" data-a="aadd">+ Xayeysiis cusub</button></div>` + (D.ads || []).map((a) => `<div class="card">
  <div id="pv_${a.id}" style="border-radius:14px;min-height:110px;padding:14px;color:#fff;background:linear-gradient(135deg,#111,#e11d2e) center/cover"><b>${esc(a.title)}</b><div>${esc(a.subtitle)}</div></div>
  <input id="a${a.id}_t" value="${esc(a.title)}" placeholder="Cinwaan"><input id="a${a.id}_s" value="${esc(a.subtitle)}" placeholder="Qoraal"><input id="a${a.id}_u" value="${esc(a.url)}" placeholder="Link (https://...)">
  <input type="file" accept="image/*" data-img="${a.id}">
  <div class="acts"><label class="mu"><input id="a${a.id}_x" type="checkbox" style="width:auto" ${a.active ? 'checked' : ''}> Muuqda</label><button class="btn sm" data-a="asave" data-id="${a.id}">Kaydi</button><button class="btn sm ghost" data-a="adel" data-id="${a.id}">Tirtir</button></div></div>`).join('');
}
function settings() {
  const s = D.set; if (!s) return '';
  const cb = (id, l, on) => `<label class="mu" style="display:block;margin-top:8px"><input id="${id}" type="checkbox" style="width:auto" ${on ? 'checked' : ''}> ${l}</label>`;
  const nf = (id, l, v) => `<div><label class="mu">${l}</label><input id="${id}" type="number" value="${esc(v)}"></div>`;
  return `<div class="card"><b>Lambarrada lacag-bixinta</b><p class="mu">Macaamiishu waxay lacagta u diraan lambarradan.</p>
  ${Object.entries(s.payments).map(([k, v], i) => `<div class="row"><input id="pk${i}" value="${esc(k)}"><input id="pv${i}" inputmode="numeric" value="${esc(v)}" placeholder="2526..."></div>`).join('')}
  <div class="row"><input id="pkn" placeholder="Habka cusub (magac)"><input id="pvn" inputmode="numeric" placeholder="Lambar"></div></div>
  <div class="card"><b>WhatsApp iyo social media</b><label class="mu">WhatsApp (252...)</label><input id="wa" value="${esc(s.whatsapp)}">
  ${['tiktok', 'instagram', 'facebook', 'youtube', 'telegram'].map((k) => `<label class="mu">${k}</label><input id="so_${k}" value="${esc(s.social[k] || '')}" placeholder="https://...">`).join('')}</div>
  <div class="card"><b>Xisaabaadka</b><div class="f2">${nf('rate', 'Sh ee $1', s.rate)}${nf('bonus', 'Bonus float (%)', s.bonus)}${nf('thr', 'Digniin float ($)', s.float_thr)}${nf('rsu', 'Qadarka restock ($)', s.restock_usd)}${nf('rd', 'Dhimista Reseller (%)', s.reseller_discount)}</div>
  <label class="mu" style="margin-top:10px"><input id="uo" type="checkbox" style="width:auto" ${s.user_orders === '1' ? 'checked' : ''}> Macmiilku ha arko dalabyadiisa</label></div>
  <div class="card"><b>Automation</b><p class="mu">Shid kaliya marka API-yada la xiray (README). Lacagta si toos ah ayaa loo xaqiijiyaa marka webhook/polling uu shaqeeyo.</p>${cb('aD', 'Data si toos ah u gaarsii marka lacagta la xaqiijiyo (API shirkadda)', s.auto_deliver === '1')}${cb('aR', 'Float si toos ah u iibso marka uu hoosaado (haddii API-gu taageero)', s.auto_restock === '1')}</div>
  <button class="btn" data-a="sset">Kaydi dhammaan</button>
  <div class="card" style="margin-top:14px"><b>Backup</b><p class="mu">Soo deji koobi database-ka ah (isticmaalayaasha, wallet-yada, dalabyada). Samee toddobaad kasta ugu yaraan.</p><a class="btn sm" style="display:inline-block;text-decoration:none" href="/api/admin/backup">Soo deji backup</a></div>
  <div class="card" style="margin-top:14px"><b>Beddel password-ka</b><input id="op" type="password" placeholder="Password-ka hadda"><input id="np" type="password" placeholder="Password cusub (8+ xaraf)"><button class="btn alt" data-a="chpw">Beddel</button></div>`;
}
function render() {
  $('lo').style.display = ME ? 'block' : 'none';
  if (!ME) { $('v').innerHTML = loginView(); return; }
  const body = { dash, orders, topups, pin, users, float, prices, ads, set: settings }[tab]();
  $('v').innerHTML = `<div class="tabs">${TABS.map((t) => `<button class="${t[0] === tab ? 'on' : ''}" data-a="tab" data-t="${t[0]}">${t[1]}${t[0] === 'orders' && D.stats && D.stats.toDeliver + D.stats.pendingPayment ? ' \u2022' : ''}${t[0] === 'topups' && D.stats && D.stats.pendingTopups ? ' \u2022' : ''}</button>`).join('')}</div>${body}`;
}

// ---------- actions ----------
const act = (btn, fn, msg) => guard(btn, async () => { await fn(); if (msg) toast(msg); await load(true); });
const H = {
  tab: (t) => { if (t.dataset.f !== undefined) ofilter = t.dataset.f; else if (t.dataset.t === 'orders') ofilter = ''; go(t.dataset.t); },
  ofilter: (t) => { ofilter = t.dataset.f; load(); },
  login: (t) => guard(t, async () => { const u = (await post('/login', { email: val('le'), password: $('lw').value })).user; if (u.role !== 'admin') { await post('/logout'); throw new Error('Akoonkan maamule ma aha'); } ME = u; await go('dash'); }),
  logout: async () => { try { await post('/logout'); } catch { /* ignore */ } ME = null; render(); },
  copy: async (t) => { try { await navigator.clipboard.writeText(t.dataset.v); toast('La koobiyeeyay'); } catch { toast(t.dataset.v); } },
  oconf: (t) => act(t, () => post(`/admin/orders/${t.dataset.id}/confirm`), 'Lacagta waa la xaqiijiyay'),
  odel: (t) => { if (confirm('Ma dirtay data-da lambarka macmiilka? Tani float-ka ayay ka jaraysaa.')) act(t, () => post(`/admin/orders/${t.dataset.id}/deliver`), 'Dalabka waa la gaarsiiyay'); },
  orej: (t) => { if (confirm('Ma diidaysaa dalabkan? (Haddii uu Wallet ahaa lacagta waa la celinayaa)')) act(t, () => post(`/admin/orders/${t.dataset.id}/reject`), 'Dalabka waa la diiday'); },
  tapp: (t) => act(t, () => post(`/admin/topups/${t.dataset.id}/approve`), 'Wallet-ka waa la shubay'),
  trej: (t) => { if (confirm('Diid codsigan?')) act(t, () => post(`/admin/topups/${t.dataset.id}/reject`), 'La diiday'); },
  usearch: () => { uq = val('uq'); load(); },
  ures: (t) => act(t, () => api('/admin/users/' + t.dataset.id, { m: 'PUT', b: { reseller: t.dataset.v === '1' } }), 'Waa la beddelay'),
  ublk: (t) => act(t, () => api('/admin/users/' + t.dataset.id, { m: 'PUT', b: { status: t.dataset.v } }), 'Waa la beddelay'),
  uadj: (t) => act(t, () => post(`/admin/users/${t.dataset.id}/wallet`, { amount: Number(val('adj_' + t.dataset.id)), note: 'admin' }), 'Wallet waa la beddelay'),
  restock: (t) => act(t, () => post('/admin/float/restock', { company: t.dataset.k, usd: Number(val('rs_' + t.dataset.k)) }), 'Float waa la diiwaan geliyay'),
  bsave: (t) => { const i = t.dataset.id; act(t, () => api('/admin/bundles/' + i, { m: 'PUT', b: { company: t.dataset.c, name: val(`b${i}_name`), category: val(`b${i}_cat`), price: Number(val(`b${i}_price`)), validity: val(`b${i}_val`), active: $(`b${i}_act`).checked } }), 'Waa la kaydiyay'); },
  bdel: (t) => { if (confirm('Tirtir baakadda?')) act(t, () => api('/admin/bundles/' + t.dataset.id, { m: 'DELETE' }), 'La tirtiray'); },
  badd: (t) => { const k = t.dataset.k; act(t, () => post('/admin/bundles', { company: k, name: val(`n_${k}_name`), category: val(`n_${k}_cat`), price: Number(val(`n_${k}_price`)), validity: val(`n_${k}_val`) }), 'Baakadda waa la daray'); },
  aadd: (t) => act(t, () => post('/admin/ads', { title: 'Xayeysiis cusub', subtitle: '', url: '', image: '' }), 'La daray'),
  asave: (t) => { const i = t.dataset.id, cur = (D.ads || []).find((a) => String(a.id) === i); act(t, () => api('/admin/ads/' + i, { m: 'PUT', b: { title: val(`a${i}_t`), subtitle: val(`a${i}_s`), url: val(`a${i}_u`), image: imgs[i] ?? (cur ? cur.image : ''), active: $(`a${i}_x`).checked } }), 'Waa la kaydiyay'); },
  adel: (t) => { if (confirm('Tirtir xayeysiiskan?')) act(t, () => api('/admin/ads/' + t.dataset.id, { m: 'DELETE' }), 'La tirtiray'); },
  sset: (t) => {
    const payments = {}; let i = 0;
    while ($('pk' + i)) { if (val('pk' + i)) payments[val('pk' + i)] = val('pv' + i); i++; }
    if (val('pkn')) payments[val('pkn')] = val('pvn');
    const social = {}; for (const k of ['tiktok', 'instagram', 'facebook', 'youtube', 'telegram']) social[k] = val('so_' + k);
    act(t, () => api('/admin/settings', { m: 'PUT', b: { payments, social, whatsapp: val('wa'), rate: Number(val('rate')), bonus: Number(val('bonus')), float_thr: Number(val('thr')), restock_usd: Number(val('rsu')), reseller_discount: Number(val('rd')), user_orders: $('uo').checked ? '1' : '0', auto_deliver: $('aD').checked ? '1' : '0', auto_restock: $('aR').checked ? '1' : '0' } }), 'Settings waa la kaydiyay');
  },
  chpw: (t) => guard(t, async () => { await post('/me/password', { old: $('op').value, password: $('np').value }); toast('Password waa la beddelay'); $('op').value = ''; $('np').value = ''; }),
};
document.addEventListener('click', (e) => { const t = e.target.closest('[data-a]'); if (!t) return; const h = H[t.dataset.a]; if (h) h(t); });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target.id === 'lw' || e.target.id === 'le')) H.login(document.querySelector('[data-a=login]')); });
document.addEventListener('change', (e) => {
  const id = e.target.dataset && e.target.dataset.img; if (!id || !e.target.files[0]) return;
  const rd = new FileReader();
  rd.onload = () => { const im = new Image(); im.onload = () => {
    const c = document.createElement('canvas'), s = Math.min(1, 800 / im.width); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); imgs[id] = c.toDataURL('image/jpeg', 0.75);
    const pv = $('pv_' + id); if (pv) pv.style.backgroundImage = 'url("' + imgs[id] + '")'; toast('Sawirka waa diyaar, riix Kaydi');
  }; im.src = rd.result; };
  rd.readAsDataURL(e.target.files[0]);
});
setInterval(() => { if (ME && ['dash', 'orders', 'topups'].includes(tab)) load(true); }, 20000);

(async () => {
  render();
  try { const u = (await api('/me')).user; if (u.role === 'admin') { ME = u; await go('dash'); return; } } catch { /* ignore */ }
  render();
})();
})();
