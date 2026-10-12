(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f = (n) => 'Sh' + Number(n).toLocaleString();
const SOCIALS = [['tiktok', 'TikTok', '#111', '\u266a'], ['instagram', 'Instagram', 'linear-gradient(45deg,#f9a825,#e1306c,#833ab4)', '\u25ce'],
  ['facebook', 'Facebook', '#1877f2', 'f'], ['whatsapp', 'WhatsApp', '#25d366', '\u2706'], ['youtube', 'YouTube', '#f00', '\u25b6'], ['telegram', 'Telegram', '#229ed9', '\u2708']];
let ME = null, CAT = null, tab = 'home', co = 'somtel', cat = '', am = 'in', ai = 0, pe = false, delOpen = false, sel = null, TOP = [], ORD = [], busy = false;

async function api(p, o = {}) {
  const r = await fetch('/api' + p, {
    method: o.m || 'GET', credentials: 'same-origin',
    headers: o.b ? { 'Content-Type': 'application/json' } : {}, body: o.b ? JSON.stringify(o.b) : undefined,
  });
  let d = {}; try { d = await r.json(); } catch { /* ignore */ }
  if (!r.ok) throw new Error(d.error || 'Khalad ayaa dhacay');
  return d;
}
function toast(m) { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 3200); }
const val = (id) => ($(id) ? $(id).value.trim() : '');
const net = () => { const n = $('net'); n.textContent = navigator.onLine ? 'Online' : 'Offline'; n.style.background = navigator.onLine ? '' : '#555'; };

// ---------- shub offline (queue) ----------
const getQ = () => { try { return JSON.parse(localStorage.getItem('dk_q') || '[]'); } catch { return []; } };
const setQ = (q) => { try { localStorage.setItem('dk_q', JSON.stringify(q)); } catch { /* ignore */ } };
async function flushQ() {
  if (!navigator.onLine || !ME) return;
  let q = getQ(); if (!q.length) return;
  const left = [];
  for (const it of q) {
    try { await api('/topups', { m: 'POST', b: it }); }
    catch (e) { if (!navigator.onLine || /fetch|network/i.test(e.message)) left.push(it); else toast('Codsi shub ah waa la diiday: ' + e.message); }
  }
  setQ(left);
  if (left.length < q.length) { toast('Codsiyadii offline waa la gudbiyay, sug xaqiijinta'); if (tab === 'wallet') await loadTop(); render(); }
}

// ---------- views ----------
function authView() {
  $('nav').style.display = 'none'; $('hb').style.display = 'none';
  $('v').innerHTML = `<div class="card"><h2 style="margin:0 0 4px">Soo dhawaaw</h2><p class="mu">Gal akoonkaaga ama samee mid cusub si aad data u iibsato.</p>
  <div class="row"><button class="co ${am === 'in' ? 'on' : ''}" data-a="am" data-k="in">Gal</button><button class="co ${am === 'up' ? 'on' : ''}" data-a="am" data-k="up">Samee akoon</button></div>
  ${am === 'up' ? '<input id="an" placeholder="Magacaaga oo dhan" autocomplete="name"><input id="ap" inputmode="numeric" maxlength="9" placeholder="Telefoon (654246143)" autocomplete="tel">' : ''}
  <input id="ae" type="email" placeholder="Email" autocomplete="email"><input id="aw" type="password" placeholder="Password (ugu yaraan 8 xaraf)" autocomplete="${am === 'up' ? 'new-password' : 'current-password'}">
  <button class="btn" data-a="${am === 'up' ? 'signup' : 'login'}">${am === 'up' ? 'Samee akoon' : 'Gal'}</button></div>`;
}
const priceOf = (b) => (ME && ME.reseller ? Math.round((b.price * (100 - CAT.resellerDiscount)) / 100) : b.price);

function home() {
  const bs = CAT.bundles.filter((b) => b.company === co);
  const cats = [...new Set(bs.map((b) => b.category))];
  if (!cats.includes(cat)) cat = cats[0] || '';
  return `<div class="card hero"><small>Wallet-kaaga ${ME.reseller ? '(Reseller -' + CAT.resellerDiscount + '%)' : ''}</small><h2>${f(ME.wallet)}</h2><button class="btn alt" data-a="tab" data-t="wallet">Shub lacag</button></div>
  <h3>Dooro shirkadda</h3><div class="row">${Object.entries(CAT.companies).map(([k, n]) => `<button class="co ${k === co ? 'on' : ''}" data-a="co" data-k="${esc(k)}"><img src="/logos/${esc(k)}.jpg" alt="">${esc(n)}</button>`).join('')}</div>
  <div id="bn"></div>
  <h3>Adeegyada ${esc(CAT.companies[co])}</h3>
  ${cats.length ? `<div class="chips">${cats.map((c) => `<button class="co ${c === cat ? 'on' : ''}" data-a="cat" data-k="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : '<p class="mu">Baakado lama helin.</p>'}
  ${bs.filter((b) => b.category === cat).map((b) => `<div class="b"><div><b>${esc(b.name)}</b><small>Muddo: ${esc(b.validity)}</small></div><div style="text-align:right"><div class="p">${f(priceOf(b))}</div><button data-a="buy" data-id="${b.id}">Iibso</button></div></div>`).join('')}`;
}
function showB() {
  const e = $('bn'); if (!e) return;
  const ads = CAT.ads; if (!ads.length) { e.innerHTML = ''; return; }
  const a = ads[ai % ads.length];
  e.innerHTML = `<a class="bn" ${a.url ? `href="${esc(a.url)}" target="_blank" rel="noopener"` : ''} style="background-image:linear-gradient(135deg,#111,#e11d2e)"><span style="font-size:11px;opacity:.8">XAYEYSIIS</span><b style="font-size:20px;display:block;margin-top:4px">${esc(a.title)}</b><span>${esc(a.subtitle)}</span></a>
  <div class="dots">${ads.map((_, i) => `<i class="${i === ai % ads.length ? 'on' : ''}"></i>`).join('')}</div>`;
  if (a.image) { const el = e.firstElementChild; el.style.backgroundImage = 'url("' + a.image.replace(/["\\\n\r]/g, '') + '")'; }
}
function payInfo(m, forWallet) {
  if (m === 'Wallet') return `<p class="mu">Wallet: ${f(ME.wallet)}</p>`;
  return `<p class="mu">Lacagta u dir ${esc(m)}: <b>${esc(CAT.payments[m])}</b>. Kadib geli lambarka aad ka bixisay iyo Transaction ID ${forWallet ? '' : '(dalabka waxaa la xaqiijin doonaa)'}.</p>
  <input id="payer" inputmode="numeric" placeholder="Lambarka aad ka bixisay"><input id="txref" placeholder="Transaction ID">`;
}
function wallet() {
  const methods = Object.keys(CAT.payments), q = getQ();
  return `<div class="card hero"><small>Wallet</small><h2>${f(ME.wallet)}</h2></div>
  <div class="card"><b>Shub lacag</b><p class="mu">Haddii aad offline tahay, codsiga waa la kaydiyaa oo wuxuu gudbayaa markii internet-ku soo noqdo. Lacagta waxaa lagu daraa wallet-ka marka maamuluhu xaqiijiyo.</p>
  ${methods.length ? `<select id="tmeth">${methods.map((m) => `<option>${esc(m)}</option>`).join('')}</select><div id="tinfo">${payInfo(methods[0], true)}</div><input id="amt" type="number" inputmode="numeric" placeholder="Qadarka (Sh)"><button class="btn" data-a="dep">Dir codsiga</button>` : '<p class="wt">Habab lacag-bixin weli lama dhigin.</p>'}</div>
  ${q.length ? `<div class="card"><b class="wt">Sugaya internet (${q.length})</b>${q.map((x) => `<div class="mu">${esc(x.method)}: ${f(x.amount)}</div>`).join('')}</div>` : ''}
  ${TOP.length ? `<div class="card"><b>Codsiyadii shubka</b>${TOP.map((t) => `<div class="r"><span>${esc(t.method)} \u00b7 ${f(t.amount)}</span><b class="${t.status === 'approved' ? 'ok' : t.status === 'rejected' ? 'rd' : 'wt'}">${t.status === 'approved' ? 'La xaqiijiyay' : t.status === 'rejected' ? 'La diiday' : 'Sugaya'}</b></div>`).join('')}</div>` : ''}`;
}
const STL = { pending_payment: ['Sugaya xaqiijin lacag', 'wt'], paid: ['La bixiyay, waa la diraa', 'wt'], review: ['Waa la hubinayaa', 'wt'], delivered: ['La gaarsiiyay', 'ok'], failed: ['Fashilmay', 'rd'] };
const MONTHS = ['Janaayo', 'Febraayo', 'Maarso', 'Abriil', 'Maajo', 'Juun', 'Luuliyo', 'Ogosto', 'Sebteembar', 'Oktoobar', 'Nofeembar', 'Diseembar'];
const p2 = (n) => String(n).padStart(2, '0');
const fmt = (t) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} \u00b7 ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
function orders() {
  if (!ORD.length) return '<h3>Dalabyadayda</h3><p class="mu">Weli wax dalab ah ma jiro.</p>';
  const groups = {};
  for (const o of ORD) { const d = new Date(o.created); const k = d.getFullYear() * 12 + d.getMonth(); (groups[k] = groups[k] || { label: MONTHS[d.getMonth()] + ' ' + d.getFullYear(), list: [] }).list.push(o); }
  return '<h3>Dalabyadayda</h3>' + Object.keys(groups).sort((x, y) => y - x).map((k) => {
    const g = groups[k], tot = g.list.filter((o) => o.status !== 'failed').reduce((s, o) => s + o.price, 0);
    return `<div class="r" style="margin-top:14px"><b>${esc(g.label)}</b><span class="mu">${g.list.length} dalab \u00b7 ${f(tot)}</span></div>` + g.list.map((o) => {
      const s = STL[o.status] || [o.status, ''];
      return `<div class="b"><div>${esc(o.bundle_name)}<small>${esc(CAT.companies[o.company] || o.company)} \u2192 ${esc(o.target_phone)}</small><small>${fmt(o.created)}</small>${o.status === 'delivered' ? `<small class="ok">La gaarsiiyay: ${fmt(o.updated)}</small>` : ''}</div><div style="text-align:right"><b>${f(o.price)}</b><div class="${s[1]}">${s[0]}</div></div></div>`;
    }).join('');
  }).join('');
}
function about() {
  const soc = { ...CAT.social, whatsapp: CAT.whatsapp ? 'https://wa.me/' + CAT.whatsapp : '' };
  const links = SOCIALS.filter((s) => soc[s[0]]);
  return `<div class="card"><h2 style="margin:0 0 6px">Nagu saabsan</h2><p class="mu">Dankali waa goob aad ka iibsato data internet oo dhaqso ah oo qiimo jaban ah. Waxaan u shaqeynaa Somtel, Telesom iyo Soltelco.</p></div>
  ${links.length ? `<h3>Nala soco</h3><div class="row wrap">${links.map((s) => `<a class="soc" href="${esc(soc[s[0]])}" target="_blank" rel="noopener"><i style="background:${s[2]}">${s[3]}</i>${s[1]}</a>`).join('')}</div>` : ''}
  <button class="btn" style="margin-top:14px" data-a="share">La wadaag Dankali</button>`;
}
function profile() {
  const items = [['Wax ka bedel xogta', 'edit'], ['Nagu sabsan', 'about']];
  if (CAT.userOrders) items.push(['Dalabyadayda', 'orders']);
  if (ME.role === 'admin') items.push(['Maamul (Admin)', 'admin']);
  items.push(['Delete Account', 'del'], ['Ka bax', 'logout']);
  return `<div class="card" style="display:flex;gap:14px;align-items:center"><div class="av" style="width:64px;height:64px;font-size:28px;background:var(--red);color:#fff;margin:0">${esc(ME.name[0].toUpperCase())}</div><div><b>${esc(ME.name)}</b><div class="mu">+252${esc(ME.phone)}</div><div class="mu">${esc(ME.email)}</div></div></div>
  ${pe ? `<div class="card"><input id="en" value="${esc(ME.name)}"><input id="ep" value="${esc(ME.phone)}" maxlength="9" inputmode="numeric"><button class="btn" data-a="saveP">Kaydi</button>
  <h3>Beddel password</h3><input id="op" type="password" placeholder="Password-ka hadda"><input id="np" type="password" placeholder="Password cusub (8+ xaraf)"><button class="btn alt" data-a="chpw">Beddel password</button></div>` : ''}
  ${delOpen ? `<div class="card"><b class="rd">Tirtir akoonka</b><p class="mu">Tallaabadan dib looma celin karo. Geli password-kaaga si aad u xaqiijiso.</p><input id="dp" type="password" placeholder="Password"><button class="btn" data-a="delgo">Xaqiiji tirtirka</button></div>` : ''}
  <div class="card" style="padding:4px 14px">${items.map((x) => `<div class="b" style="border:0;border-bottom:1px solid var(--bd);border-radius:0;margin:0;cursor:pointer" data-a="pm" data-k="${x[1]}">${x[0]}<span>\u203a</span></div>`).join('')}</div>`;
}
function render() {
  net();
  if (!CAT) { $('v').innerHTML = '<p class="mu" style="text-align:center;margin-top:40px">Waa la furayaa...</p>'; return; }
  if (!ME) return authView();
  $('nav').style.display = 'flex'; $('hb').style.display = 'block';
  if (tab === 'orders' && !CAT.userOrders) tab = 'home';
  $('navo').style.display = CAT.userOrders ? '' : 'none';
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  $('v').innerHTML = { home, wallet, orders, about, profile }[tab]();
  if (tab === 'home') showB();
}
async function loadTop() { try { TOP = (await api('/topups')).topups; } catch { /* ignore */ } }
async function go(t) {
  tab = t; render(); window.scrollTo(0, 0);
  if (t === 'wallet') { await loadTop(); if (tab === 'wallet') render(); }
  if (t === 'orders') { try { ORD = (await api('/orders')).orders; } catch (e) { toast(e.message); } if (tab === 'orders') render(); }
}
async function refreshMe() { try { ME = (await api('/me')).user; } catch { ME = null; } }

// ---------- modal & drawer ----------
function closeM() { $('m').style.display = 'none'; $('m').innerHTML = ''; }
function openBuy(id) {
  const b = CAT.bundles.find((x) => x.id === Number(id)); if (!b) return;
  sel = b;
  const methods = [...Object.keys(CAT.payments), 'Wallet'];
  $('m').innerHTML = `<div class="mb"><div class="card"><b>${esc(CAT.companies[b.company])} - ${esc(b.name)}</b><div class="mu">${esc(b.category)} \u00b7 ${esc(b.validity)}</div>
  <h2 style="color:var(--red);margin:6px 0">${f(priceOf(b))}</h2>
  <div class="mu">Lambarka data-da la geynayo</div><input id="cn" inputmode="numeric" maxlength="9" placeholder="654246143" value="${esc(ME.phone)}">
  <div class="mu">Habka lacag-bixinta</div><select id="pmeth">${methods.map((m) => `<option>${esc(m)}</option>`).join('')}</select><div id="pd">${payInfo(methods[0])}</div>
  <button class="btn" data-a="pay">Bixi ${f(priceOf(b))}</button><button class="btn alt" style="margin-top:8px" data-a="closem">Jooji</button></div></div>`;
  $('m').style.display = 'block';
}
function done(title, msg) {
  const wa = CAT.whatsapp ? `<a class="btn" style="display:block;text-align:center;text-decoration:none;margin-top:8px" href="https://wa.me/${esc(CAT.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : '';
  $('m').innerHTML = `<div class="mb"><div class="card"><h2 class="ok" style="margin:0 0 6px">${esc(title)}</h2><p class="mu">${esc(msg)}</p><button class="btn" data-a="closem">Hagaag</button>${wa}</div></div>`;
  $('m').style.display = 'block';
}
function openDrawer() {
  const it = [['\ud83c\udfe0', 'Hoyga', 'home']];
  if (CAT.userOrders) it.push(['\ud83e\uddfe', 'Dalabyada', 'orders']);
  it.push(['\ud83c\udf81', 'Nagu sabsan', 'about']);
  it.push(['\ud83d\udc64', 'Profile', 'profile']);
  if (ME.role === 'admin') it.push(['\ud83d\udee0', 'Maamul (Admin)', 'admin']);
  it.push(['\ud83d\udeaa', 'ka Bax', 'logout']);
  $('dr').innerHTML = `<div class="dbg" data-a="closedr"></div><div class="dp"><div class="dh"><div class="av">${esc(ME.name[0].toUpperCase())}</div><b>${esc(ME.name.toUpperCase())}</b><div>${esc(ME.email)}</div><div>+252${esc(ME.phone)}</div></div>
  ${it.map((x) => `<div class="di" data-a="dnav" data-k="${x[2]}"><span>${x[0]}</span>${x[1]}</div>`).join('')}<div class="df">Dankali \u00b7 Version 1.0</div></div>`;
  $('dr').style.display = 'block';
}
const closeDr = () => { $('dr').style.display = 'none'; };
async function logout() { try { await api('/logout', { m: 'POST', b: {} }); } catch { /* ignore */ } ME = null; pe = false; delOpen = false; render(); }
function menu(k) {
  if (k === 'edit') { pe = !pe; render(); }
  else if (k === 'del') { delOpen = !delOpen; render(); }
  else if (k === 'logout') logout();
  else if (k === 'admin') location.href = '/admin/';
  else go(k);
}

// ---------- actions ----------
async function guard(btn, fn) {
  if (busy) return; busy = true; if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message); } finally { busy = false; if (btn) btn.disabled = false; }
}
const H = {
  tab: (t) => go(t.dataset.t), co: (t) => { co = t.dataset.k; cat = ''; render(); }, cat: (t) => { cat = t.dataset.k; render(); },
  am: (t) => { am = t.dataset.k; render(); }, buy: (t) => openBuy(t.dataset.id), closem: closeM, drawer: openDrawer, closedr: closeDr,
  dnav: (t) => { closeDr(); menu(t.dataset.k); }, pm: (t) => menu(t.dataset.k),
  login: (t) => guard(t, async () => { ME = (await api('/login', { m: 'POST', b: { email: val('ae'), password: $('aw').value } })).user; tab = 'home'; render(); flushQ(); }),
  signup: (t) => guard(t, async () => { ME = (await api('/register', { m: 'POST', b: { name: val('an'), phone: val('ap'), email: val('ae'), password: $('aw').value } })).user; tab = 'home'; toast('Soo dhawaaw, ' + ME.name); render(); }),
  pay: (t) => guard(t, async () => {
    const m = $('pmeth').value;
    const r = await api('/orders', { m: 'POST', b: { bundleId: sel.id, target: val('cn'), method: m, payer: val('payer'), txRef: val('txref') } });
    await refreshMe();
    if (r.status === 'paid') done('Waa la bixiyay', 'Dalabkaaga waa la helay, data-da waa lagu soo dirayaa dhawaan.');
    else if (r.status === 'review') done('Dalabkaaga waa la baarayaa', 'Lacagta ama xogta lama waafajin. Maamuluhu wuu hubinayaa, ama nala soo xiriir.');
    else done('Dalabkaaga waa la helay', 'Marka lacagta la xaqiijiyo, data-da waa lagu soo diri doonaa. Haddii ay dhawr daqiiqo dhaafto, nala soo xiriir.');
    render();
  }),
  dep: (t) => guard(t, async () => {
    const b = { amount: Number($('amt').value), method: $('tmeth').value, payer: val('payer'), txRef: val('txref') };
    if (!(b.amount >= 1000)) throw new Error('Ugu yaraan Sh1,000');
    if (!navigator.onLine) { const q = getQ(); q.push(b); setQ(q); toast('Offline: codsiga waa la kaydiyay, wuu gudbi doonaa marka internet yimaado'); render(); return; }
    const tr = await api('/topups', { m: 'POST', b });
    if (tr.status === 'approved') { await refreshMe(); toast('Wallet-kaaga waa la shubay'); } else toast('Codsiga waa la diray, sug xaqiijinta');
    await loadTop(); render();
  }),
  saveP: (t) => guard(t, async () => { ME = (await api('/me', { m: 'PUT', b: { name: val('en'), phone: val('ep') } })).user; pe = false; toast('Waa la kaydiyay'); render(); }),
  chpw: (t) => guard(t, async () => { await api('/me/password', { m: 'POST', b: { old: $('op').value, password: $('np').value } }); toast('Password waa la beddelay'); pe = false; render(); }),
  delgo: (t) => guard(t, async () => { await api('/me/delete', { m: 'POST', b: { password: $('dp').value } }); ME = null; delOpen = false; toast('Akoonka waa la tirtiray'); render(); }),
  share: async () => { try { if (navigator.share) await navigator.share({ title: 'Dankali', url: location.origin }); else { await navigator.clipboard.writeText(location.origin); toast('Link-ga waa la koobiyeeyay'); } } catch { /* ignore */ } },
};
document.addEventListener('click', (e) => { const t = e.target.closest('[data-a]'); if (!t) return; const h = H[t.dataset.a]; if (h) h(t, e); });
document.addEventListener('change', (e) => {
  if (e.target.id === 'pmeth') $('pd').innerHTML = payInfo(e.target.value);
  if (e.target.id === 'tmeth') $('tinfo').innerHTML = payInfo(e.target.value, true);
});
window.addEventListener('online', () => { net(); flushQ(); });
window.addEventListener('offline', net);
setInterval(() => { if (tab === 'home' && ME && CAT) { ai++; showB(); } }, 4000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

(async () => {
  render();
  try { CAT = await api('/catalog'); } catch { $('v').innerHTML = '<div class="card"><b>Internet ma jiro</b><p class="mu">Fadlan hubi xiriirkaaga oo dib u cusboonaysii.</p></div>'; return; }
  await refreshMe(); render(); flushQ();
})();
})();
