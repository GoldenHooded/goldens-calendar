/* Golden's Calendar — widget de escritorio. Vanilla JS: render por regiones, morphs con WAAPI, delegación de eventos. */
const api = window.temario;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SPRING = 'linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1)';
const SOFT = 'linear(0, 0.022, 0.087 4.3%, 0.335 9.4%, 0.704 16.2%, 0.858 20.4%, 0.968 25%, 1.017 29.1%, 1.04 33.6%, 1.044 37.9%, 1.035 43.2%, 1.005 56.9%, 0.996 66.4%, 1.001)';
const OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

// ---------- fechas ----------
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const cap1 = (t) => t[0].toUpperCase() + t.slice(1);
const fmtLong = (s) => cap1(parse(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
const fmtShort = (s) => parse(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
const rel = (n) => (n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : n === -1 ? 'Ayer' : n < 0 ? `Hace ${-n} días` : `En ${n} días`);
const KIND_ICON = { examen: 'cap', entrega: 'doc', hito: 'flag' };
const KIND_LABEL = { examen: 'Examen', entrega: 'Entrega', hito: 'Hito', asignatura: 'Asignatura', trabajo: 'Trabajo', personal: 'Proyecto propio' };
const ART = { examen: 'el examen', entrega: 'la entrega', hito: 'el hito' };
const PALETTE = [
  '#d97757', '#e0a458', '#c9a24a', '#9bb05e', '#7d9b76', '#4f9d7a', '#5e9e9a', '#4aa3c7',
  '#6a8caf', '#5b6fd6', '#8a6fd1', '#a07aa8', '#c76ba8', '#c97a8a', '#d0605e', '#b39a7c',
];

// ---------- estado ----------
let S = null;
const ui = {
  month: null,
  card: null, // { type, id, date, anchor }
  how: 'idle', // idle | near | open
  howView: 'summary',
  fresh: false,
  agentOpen: false,
  busy: false,
  reply: null, // { text, tools }
  closed: new Set(JSON.parse(localStorage.getItem('closed') || '[]')),
  holdUntil: 0,
  layer: localStorage.getItem('layer') || 'all',
  view: localStorage.getItem('view') === 'week' ? 'week' : 'month', // mes o semana
  weekStart: null,
  layerMenu: false,
};
// Capas: qué se ve en el calendario
// Capas elegidas: 'all', un id o varios ids separados por comas. Con varias, se ve lo de cualquiera de ellas.
const selLayers = () => (ui.layer === 'all' ? [] : ui.layer.split(',').filter((id) => byId(S?.db.layers || [], id)));
function activeLayer() {
  if (!S || ui.layer === 'all') return null;
  const ls = selLayers().map((id) => byId(S.db.layers, id));
  if (!ls.length) return null;
  if (ls.length === 1) return ls[0];
  const all = (k) => [...new Set(ls.flatMap((l) => l[k] || []))];
  return { id: ui.layer, name: ls.map((l) => l.name).join(' + '), projectIds: all('projectIds'), categoryIds: all('categoryIds'), subscriptionIds: all('subscriptionIds'), includeLoose: ls.some((l) => l.includeLoose), multi: ls.length };
}
function inLayer(kind, x) {
  const l = activeLayer();
  if (!l) return true;
  if (x.blocking || (kind === 'ext' && byId(S.db.subscriptions || [], x.subId)?.blocking)) return true; // el tiempo bloqueado se ve en todas las capas
  if (kind === 'ext') return l.subscriptionIds.includes(x.subId);
  if (kind === 'goal' && !x.projectId) return !!l.includeLoose;
  // Proyecto entero, o solo alguna de sus subcategorías
  return l.projectIds.includes(x.projectId) || (!!x.categoryId && (l.categoryIds || []).includes(x.categoryId));
}
const subColor = (id) => byId(S.db.subscriptions || [], id)?.color || '#8c8c84';
const byId = (list, id) => list.find((x) => x.id === id);
const proj = (id) => byId(S.db.projects, id) || { name: '—', color: '#999' };
const blockEnd = (b) => b.endDate || b.date;
// Subcategorías de un proyecto: «Termodinámica › Prácticas»
const catOf = (pid, cid) => (cid && (byId(S.db.projects, pid)?.categories || []).find((c) => c.id === cid)) || null;
const projLabel = (pid, cid) => esc(proj(pid).name) + (catOf(pid, cid) ? ` › ${esc(catOf(pid, cid).name)}` : '');
const catOptions = (pid, sel) => `<option value="">— Ninguna —</option>` + (byId(S.db.projects, pid)?.categories || []).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
const catField = (pid, sel) => `<label class="field" data-catfield ${(byId(S.db.projects, pid)?.categories || []).length ? '' : 'hidden'}><span>Subcategoría</span><select class="input" name="categoryId">${catOptions(pid, sel)}</select></label>`;
const ink = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.66 ? '#1f1e1d' : '#fff';
};

function gridRange() {
  if (ui.view === 'week' && ui.weekStart) return { from: ui.weekStart, to: addDays(ui.weekStart, 6) };
  const first = parse(ui.month);
  const from = addDays(ui.month, -((first.getDay() + 6) % 7));
  return { from, to: addDays(from, 41) };
}
async function refresh() {
  S = await api.state(gridRange());
  render();
}

// ---------- utilidades visuales ----------
const prev = new Map();
const prog = (key, pct, color) => `<div class="bar-p" style="--c:${color}"><i data-k="${key}" data-pct="${pct}"></i></div>`;
function ring(key, pct, color, size = 36, stroke = 4, label = true, cls = '') {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return `<div class="ring-wrap ${cls}" style="--c:${color};width:${size}px;height:${size}px">
    <svg class="ring" width="${size}" height="${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
    <circle class="val" data-k="${key}" data-pct="${pct}" data-c="${c}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg>
    ${label ? `<span class="lbl">${pct}${size > 50 ? '<small style="font-size:11px">%</small>' : ''}</span>` : ''}</div>`;
}
function animateValues(root = document) {
  const bars = $$('.bar-p > i[data-k]', root);
  const rings = $$('circle.val[data-k]', root);
  bars.forEach((el) => { el.style.transition = 'none'; el.style.width = (prev.get(el.dataset.k) ?? 0) + '%'; });
  rings.forEach((el) => { el.style.transition = 'none'; el.style.strokeDashoffset = el.dataset.c * (1 - (prev.get(el.dataset.k) ?? 0) / 100); });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bars.forEach((el) => { el.style.transition = ''; el.style.width = el.dataset.pct + '%'; prev.set(el.dataset.k, +el.dataset.pct); });
    rings.forEach((el) => { el.style.transition = ''; el.style.strokeDashoffset = el.dataset.c * (1 - el.dataset.pct / 100); prev.set(el.dataset.k, +el.dataset.pct); });
  }));
}
function burst(x, y, color) {
  if (S?.web) return; // en el móvil, sin confeti: basta con el check (animaciones más sobrias)
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('i');
    Object.assign(p.style, { left: x + 'px', top: y + 'px', background: i % 3 ? color : '#f2c46d' });
    $('#fx').appendChild(p);
    const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
    const d = 20 + Math.random() * 24;
    p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.2)`, opacity: 0 }], { duration: 600 + Math.random() * 250, easing: OUT }).onfinish = () => p.remove();
  }
}
function toast(html, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  $('#toast-root').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
}
async function run(name, input) {
  try {
    return await api.run(name, input);
  } catch (e) {
    const msg = String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    if (/hueco est\u00e1 bloqueado/.test(msg)) {
      ui.retry = { name, input };
      toast(`${icon('clock', 14)} ${esc(msg.replace(/ Si quieres.*$/, ''))} <button class="lnk" data-act="force-last">Ponerlo igualmente</button>`, 7000);
    } else toast(esc(msg));
    throw e;
  }
}
const relRect = (el) => {
  const w = $('#widget').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { left: r.left - w.left, top: r.top - w.top, width: r.width, height: r.height, right: r.right - w.left, bottom: r.bottom - w.top, W: w.width, H: w.height };
};


// ---------- Actualizar sin redibujar ----------
// Compara el HTML nuevo con el DOM actual y solo cambia lo distinto: lo que no cambia no se toca (no se
// reinician sus animaciones, ni el foco, ni el scroll), y lo que aparece nuevo entra con una animación.
const keyOf = (n) => (n.nodeType === 1 ? n.dataset?.key || n.id || null : null);
function sameNode(a, b) {
  return a && b && a.nodeType === b.nodeType && a.nodeName === b.nodeName && keyOf(a) === keyOf(b);
}
function patchNode(a, b, anim) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  const keep = a.classList.contains('morph-in') && !b.classList.contains('morph-in');
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  if (keep) a.classList.add('morph-in'); // no cortar una animación de entrada a medias
  if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') {
    if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked');
    else if (document.activeElement !== a) a.value = b.getAttribute('value') ?? b.textContent ?? '';
    return;
  }
  if (a.tagName === 'SELECT' && document.activeElement === a) return;
  patchChildren(a, b, anim);
}
function patchChildren(parent, next, anim) {
  // Emparejar: los que tienen clave por clave; el resto, en orden, con el siguiente del mismo tipo
  // (saltando los que sobran), para que quitar o añadir uno no "recree" todos los de detrás.
  const olds = [...parent.childNodes];
  const keyed = new Map();
  const loose = [];
  for (const n of olds) keyOf(n) ? keyed.set(keyOf(n), n) : loose.push(n);
  let li = 0;
  const used = new Set();
  const plan = [...next.childNodes].map((nn) => {
    let match = null;
    const k = keyOf(nn);
    if (k) match = keyed.get(k) || null;
    else
      for (let j = li; j < loose.length; j++)
        if (sameNode(loose[j], nn)) {
          match = loose[j];
          li = j + 1;
          break;
        }
    if (match) used.add(match);
    return [nn, match];
  });
  for (const n of olds) if (!used.has(n)) n.remove();
  let i = 0;
  for (const [nn, match] of plan) {
    const cur = parent.childNodes[i] || null;
    if (match) {
      if (match !== cur) parent.insertBefore(match, cur);
      patchNode(match, nn, anim);
    } else {
      parent.insertBefore(nn, cur);
      if (anim && nn.nodeType === 1) nn.classList.add('morph-in');
    }
    i++;
  }
}
function morph(el, html, anim = true) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  if (!el.firstChild) return (el.innerHTML = html); // primera vez: tal cual
  patchChildren(el, tpl.content, anim);
}

// ---------- render ----------
function render() {
  if (!S) return;
  document.body.classList.toggle('web', !!S.web);
  if (S.web && aur.on) setAurora(false); // en el móvil, fondo negro liso (más fluido)
  renderLogin();
  document.documentElement.style.setProperty('--alpha', S.db.settings.opacity ?? 0.55);
  renderHead();
  renderCal();
  if (ui.card) updateCard();
  renderHow(false);
  renderAgent();
}

function renderHead() {
  const m = parse(ui.month);
  morph($('#head'), `
    <div class="month"><span class="n" id="mname">${MONTHS[(ui.view === 'week' && ui.weekStart ? parse(ui.weekStart) : m).getMonth()]}</span><span class="y">${ui.view === 'week' && ui.weekStart ? `${parse(ui.weekStart).getDate()}–${parse(addDays(ui.weekStart, 6)).getDate()}` : m.getFullYear()}</span></div>
    <div class="nav">
      <button class="ibtn" data-act="month" data-d="-1" title="Mes anterior">${icon('chevL', 16)}</button>
      <button class="ibtn" data-act="month" data-d="1" title="Mes siguiente">${icon('chevR', 16)}</button>
      ${(ui.view === 'week' ? ui.weekStart !== mondayOf(S.today) : ui.month !== S.today.slice(0, 8) + '01') ? `<button class="ibtn" data-act="today" title="Volver a hoy">${icon('cal', 15)}</button>` : ''}
      <button class="ibtn view-btn" data-act="toggle-view" title="${ui.view === 'week' ? 'Ver el mes (W)' : 'Ver la semana (W)'}">${icon(ui.view === 'week' ? 'gridMonth' : 'columns', 15)}</button>
      ${S.web ? `<button class="ibtn add-btn" data-act="add-menu" title="Añadir" aria-label="Añadir">${icon('plus', 22)}</button>` : ''}
    </div>
    ${S.web ? '' : `${layerWheel()}
    <kbd class="esc-hint" title="Escape cierra">esc</kbd>
    <button class="ibtn rm-go" data-act="rm-go" title="Recordatorios (R)">${icon('checklist', 15)}${rmCount().today ? `<span class="badge">${rmCount().today}</span>` : ''}</button>
    ${ui.layerMenu ? layerMenu() : ''}`}`);
  $('#weekdays').innerHTML = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<div>${d}</div>`).join('');
  if (S.web) renderDock();
}
// Móvil: capa, «¿Cómo vas?», Claude y recordatorios abajo, al alcance del pulgar
function renderDock() {
  let el = $('#dock');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dock';
    ($('#stage') || $('#widget')).appendChild(el); // dentro del escenario: se encoge con él al abrir una hoja
  }
  const n = rmCount().today;
  morph(el, `<button class="layer-pill dock-btn dock-layer ${activeLayer() ? 'on' : ''}" data-act="layer-menu" data-key="dock-layer" title="Capas">${icon('layers', 20)}<span>${esc(activeLayer()?.name || 'Todo')}</span></button>
    <button class="dock-btn dock-how ${ui.fresh ? 'fresh' : ''}" data-act="how-open" data-key="dock-how">${ui.fresh ? '<span class="dot"></span>' : icon('sun', 20)}<span>¿Cómo vas?</span></button>
    <button class="dock-btn dock-ai" data-act="ai-open" data-key="dock-ai" title="Hablar con Claude" aria-label="Hablar con Claude">${icon('spark', 22)}</button>
    <button class="dock-btn dock-rm" data-act="rm-go" data-key="dock-rm" title="Recordatorios" aria-label="Recordatorios">${icon('checklist', 22)}${n ? `<span class="badge">${n}</span>` : ''}</button>
    ${ui.layerMenu ? layerMenu() : ''}`);
}

// Botón de capas: la rueda del ratón gira entre capas (el nombre rueda y el botón cambia de ancho sin saltos)
const layerOrder = () => ['all', ...(S.db.layers || []).map((l) => l.id)];
const layerName = (id) => {
  if (id === 'all') return 'Todo';
  const names = id.split(',').map((x) => byId(S.db.layers || [], x)?.name).filter(Boolean);
  return !names.length ? 'Todo' : names.length === 1 ? names[0] : names.join(' + ').length > 24 ? `${names.length} capas` : names.join(' + ');
};
function layerWheel() {
  return `<div class="layer-wheel" data-key="lwheel" title="Capas · gira la rueda del ratón para cambiar">
    <button class="layer-pill ${activeLayer() ? 'on' : ''}" data-act="layer-menu">${icon('layers', 13)} <span class="lp-name"><span class="lp-t">${esc(layerName(ui.layer))}</span></span></button></div>`;
}
const ROLL = 'cubic-bezier(0.22, 1, 0.36, 1)';
// Cambia de capa con animación: el nombre viejo sale por un lado, el nuevo entra por el otro y el ancho se ajusta suave
function rollLayer(id, d) {
  const box0 = $('.layer-wheel .lp-name');
  const w0 = box0?.getBoundingClientRect().width;
  const old = $('.lp-t', box0 || document)?.textContent;
  $$('.layer-wheel .lp-ghost').forEach((g) => g.remove());
  ui.layer = id;
  ui.layerMenu = false;
  localStorage.setItem('layer', ui.layer);
  renderHead();
  const box = $('.layer-wheel .lp-name');
  const t = box && $('.lp-t', box);
  if (!t || !w0 || old === t.textContent) return;
  const w1 = box.getBoundingClientRect().width;
  box.getAnimations().forEach((x) => x.cancel());
  box.animate([{ width: w0 + 'px' }, { width: w1 + 'px' }], { duration: 360, easing: ROLL });
  const ghost = document.createElement('span');
  ghost.className = 'lp-ghost';
  ghost.textContent = old;
  box.appendChild(ghost);
  ghost.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-d * 14}px)`, opacity: 0 }], { duration: 300, easing: ROLL, fill: 'forwards' }).onfinish = () => ghost.remove();
  t.animate([{ transform: `translateY(${d * 14}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: ROLL });
}
function stepLayer(d) {
  const ids = layerOrder();
  const j = Math.max(0, ids.indexOf(ui.layer)) + d;
  if (j < 0 || j >= ids.length) return $('.layer-wheel .layer-pill')?.animate([{ translate: '0 0' }, { translate: `0 ${d * 3}px` }, { translate: '0 0' }], { duration: 300, easing: ROLL }); // tope
  rollLayer(ids[j], d);
  clearTimeout(stepLayer.t);
  stepLayer.t = setTimeout(() => renderCal(), 90); // el calendario se actualiza al parar de girar
}
// Rueda (también con el panel táctil): se acumula el desplazamiento y cada «muesca» es una capa
let layerAcc = 0, wheelLast = 0;
$('#head').addEventListener('wheel', (e) => {
  if (!e.target.closest('.layer-wheel')) return;
  e.preventDefault();
  e.stopPropagation();
  const now = performance.now();
  if (now - wheelLast > 250) layerAcc = 0;
  wheelLast = now;
  layerAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
  if (Math.abs(layerAcc) < 50) return;
  const d = layerAcc > 0 ? 1 : -1;
  layerAcc = 0;
  stepLayer(d);
}, { passive: false });

const paletteRow = (id, current, kind) => `<div class="palette" data-key="pal-${id}">${PALETTE.map((c, i) => `<button class="${c === current ? 'on' : ''}" style="--c:${c};--n:${i}" data-act="set-color" data-kind="${kind}" data-id="${id}" data-c="${c}"></button>`).join('')}</div>`;

function layerMenu() {
  const count = (l) => l.projectIds.length + (l.categoryIds || []).length + l.subscriptionIds.length;
  const sel = selLayers();
  const tick = (on) => (S.web ? `<span class="tick ${on ? 'on' : ''}">${icon('check', 12)}</span>` : icon('layers', 14));
  return `<div class="layer-menu ${S.web ? 'ticks' : ''}" data-key="layer-menu">
    <button class="${!sel.length ? 'on' : ''}" data-act="set-layer" data-id="all" data-key="lm-all">${tick(!sel.length)} Todo</button>
    ${(S.db.layers || []).map((l) => `<button class="${sel.includes(l.id) ? 'on' : ''}" data-act="set-layer" data-id="${l.id}" data-key="lm-${l.id}">${tick(sel.includes(l.id))} ${esc(l.name)}<span class="n">${count(l)}</span></button>`).join('')}
    ${!S.web && (S.db.layers || []).length > 1 ? '<div class="lm-hint">Ctrl o Mayús + clic para ver varias a la vez</div>' : ''}
    <hr><button data-act="manage-layers">${icon('gear', 14)} Gestionar capas y calendarios…</button></div>`;
}

function renderDots() {
  let html = '';
  for (let r = 1; r < 6; r++) for (let c = 1; c < 7; c++) html += `<i style="left:${(c / 7) * 100}%;top:${(r / 6) * 100}%"></i>`;
  $('#dots').innerHTML = html;
  dotPos = null;
}

function weekItems(ws) {
  const we = addDays(ws, 6);
  const items = [];
  for (const m of S.db.milestones) if (m.date >= ws && m.date <= we && inLayer('ms', m)) items.push({ kind: 'ms', id: m.id, s: diffDays(ws, m.date), e: diffDays(ws, m.date), x: m });
  for (const g of S.db.goals || []) if (g.date >= ws && g.date <= we && inLayer('goal', g)) items.push({ kind: 'goal', id: g.id, s: diffDays(ws, g.date), e: diffDays(ws, g.date), x: g });
  for (const b of S.db.blocks) {
    if (blockEnd(b) < ws || b.date > we || !inLayer('blk', b)) continue;
    items.push({ kind: 'blk', id: b.id, s: Math.max(0, diffDays(ws, b.date)), e: Math.min(6, diffDays(ws, blockEnd(b))), x: b, cl: b.date < ws, cr: blockEnd(b) > we });
  }
  for (const e of S.db.extEvents || []) {
    const end = e.endDate || e.date;
    if (end < ws || e.date > we || !inLayer('ext', e)) continue;
    items.push({ kind: 'ext', id: e.id, s: Math.max(0, diffDays(ws, e.date)), e: Math.min(6, diffDays(ws, end)), x: e, cl: e.date < ws, cr: end > we });
  }
  const rank = { ms: 0, goal: 1, blk: 2, ext: 3 };
  items.sort((a, b) => rank[a.kind] - rank[b.kind] || a.s - b.s || b.e - b.s - (a.e - a.s) || (a.x.start || '').localeCompare(b.x.start || ''));
  const lanes = []; // columnas ocupadas por carril
  for (const it of items) {
    let l = lanes.findIndex((used) => !used.some((c) => c >= it.s && c <= it.e));
    if (l < 0) { l = lanes.length; lanes.push([]); }
    for (let c = it.s; c <= it.e; c++) lanes[l].push(c);
    it.lane = l;
  }
  return items;
}

function renderCal(dir = 0, slide = true) {
  const week = ui.view === 'week';
  if (week && !ui.weekStart) ui.weekStart = mondayOf(S.today);
  document.body.classList.toggle('view-week', week);
  const weeks = $('#weeks');
  if (weeks.classList.contains('wkview') !== week) (weeks.innerHTML = ''), weeks.classList.toggle('wkview', week);
  const html = week ? weekViewHTML() : weeksHTML();
  if (dir) weeks.innerHTML = html; // cambio de mes: entra entero deslizando
  else morph(weeks, html);
  if ((dir && slide) || !weeks.dataset.ready) {
    // las barras solo entran animadas al abrir o al cambiar de mes, no en cada actualización
    weeks.dataset.ready = '1';
    weeks.classList.add('anim');
    clearTimeout(renderCal.t);
    renderCal.t = setTimeout(() => weeks.classList.remove('anim'), 1200);
  }
  weeks.classList.remove('l', 'r');
  if (dir && slide) {
    void weeks.offsetWidth;
    weeks.classList.add(dir < 0 ? 'l' : 'r');
  }
}
// ---------- Vista semanal: los días grandes con su time blocking ----------
const WD_SHORT = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const minsOf = (h) => { const m = /^(\d{1,2})[:.h](\d{2})/.exec(String(h || '').trim()); return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : null; };
const hhmmOf = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const mondayOf = (d) => addDays(d, -((parse(d).getDay() + 6) % 7));
const subBlocking = (id) => !!byId(S.db.subscriptions || [], id)?.blocking;
// Días con un bloqueo de día entero (rayados en el mes)
function allDayBlocked(d) {
  return S.db.blocks.some((b) => b.blocking && !b.start && b.date <= d && blockEnd(b) >= d) || (S.db.goals || []).some((g) => g.blocking && !g.time && g.date === d) || S.db.milestones.some((m) => m.blocking && !m.time && m.date === d) || (S.db.extEvents || []).some((e) => !e.start && subBlocking(e.subId) && e.date <= d && (e.endDate || e.date) >= d);
}
const wkZoom = () => (ui.wkZoom ??= Math.min(4, Math.max(1, +localStorage.getItem('wkZoom') || 1)));
function weekViewHTML() {
  const ws = ui.weekStart;
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const timed = Object.fromEntries(days.map((d) => [d, []]));
  const allday = Object.fromEntries(days.map((d) => [d, []]));
  const put = (d, it) => (it.from == null ? allday[d] : timed[d])?.push(it);
  for (const b of S.db.blocks) {
    if (!(b.blocking || inLayer('blk', b))) continue;
    const st = S.stats.blocks[b.id];
    for (const d of days) if (b.date <= d && blockEnd(b) >= d) put(d, { type: 'block', id: b.id, title: b.title, color: proj(b.projectId).color, from: minsOf(b.start), to: b.end ? minsOf(b.end) : minsOf(b.start) + 60, blocking: b.blocking, done: st?.pct === 100, icon: b.pausedAt ? 'pause' : isFixedB(b) && !b.blocking ? 'pin' : '' });
  }
  for (const e of S.db.extEvents || []) {
    const blocking = subBlocking(e.subId);
    if (!(blocking || inLayer('ext', e))) continue;
    for (const d of days) if (e.date <= d && (e.endDate || e.date) >= d) put(d, { type: 'ext', id: e.id, title: e.title.trim(), color: subColor(e.subId), from: minsOf(e.start), to: e.end ? minsOf(e.end) : minsOf(e.start) + 60, blocking });
  }
  for (const m of S.db.milestones) if (timed[m.date] && inLayer('ms', m)) put(m.date, { type: 'ms', id: m.id, title: m.title, color: proj(m.projectId).color, from: minsOf(m.time), to: minsOf(m.time) + (m.blocking ? 120 : 60), icon: KIND_ICON[m.kind], blocking: m.blocking });
  for (const g of S.db.goals || []) if (timed[g.date] && inLayer('goal', g)) put(g.date, { type: 'goal', id: g.id, title: g.title, color: goalColor(g), from: minsOf(g.time), to: minsOf(g.time) + (g.blocking ? 60 : 30), icon: 'target', done: g.done, blocking: g.blocking });
  for (const t of rmAll()) if (timed[t.due] && !t.done) put(t.due, { type: 'todo', id: t.id, title: t.title, color: rmColor(t), from: minsOf(t.time), to: minsOf(t.time) + 30, icon: 'checklist' });
  // Horas visibles: de 8 a 21, ampliando si hay algo antes o después
  let h0 = 8 * 60, h1 = 21 * 60;
  for (const d of days) for (const it of timed[d]) (h0 = Math.min(h0, Math.floor(it.from / 60) * 60)), (h1 = Math.max(h1, Math.ceil(Math.min(1440, it.to) / 60) * 60));
  const adRows = Math.min(3, Math.max(0, ...days.map((d) => allday[d].length)));
  const H = $('#weeks').clientHeight || 520;
  const avail = H - 40 - (adRows ? adRows * 21 + 8 : 0);
  // Alto de una hora: lo justo para que quepa el día y, encima, el zoom (pellizcar en el móvil, Ctrl+rueda en el PC).
  // Las posiciones van en minutos × --ppm, así el zoom solo cambia una variable y no hay que volver a pintar
  const ppm = Math.max(0.62, avail / (h1 - h0)) * wkZoom();
  const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
  const itemHTML = (d, it, left, width) => {
    const len = Math.min(it.to, h1) - it.from;
    const act = it.type === 'todo' ? 'data-act="rm-goto"' : `data-act="open" data-type="${it.type}"`;
    return `<div class="wk-it ${it.type} ${it.blocking ? 'blocking' : ''} ${it.done ? 'done' : ''} ${len * ppm < 32 ? 'thin' : ''}" ${act} data-id="${esc(it.id)}" data-key="wi-${esc(it.id)}-${d}" style="top:calc(${it.from - h0}px * var(--ppm));height:max(16px, calc(${len}px * var(--ppm) - 2px));left:${left}%;width:${width}%;--c:${it.color};--ink:${ink(it.color)}" title="${esc(it.title)} · ${hhmmOf(it.from)}–${hhmmOf(it.to)}">
      <b>${hhmmOf(it.from)}</b><span>${it.icon ? icon(it.icon, 10) : ''}${esc(it.title)}</span></div>`;
  };
  const cols = days.map((d) => {
    // Carriles para lo que se solapa
    const list = timed[d].sort((a, b) => a.from - b.from || b.to - a.to);
    let html = '', group = [], end = -1;
    const flush = () => {
      const lanes = [];
      for (const it of group) {
        let l = lanes.findIndex((t) => t <= it.from);
        if (l < 0) (l = lanes.length), lanes.push(0);
        lanes[l] = it.to;
        it.lane = l;
      }
      for (const it of group) html += itemHTML(d, it, (it.lane / lanes.length) * 100, 100 / lanes.length);
      group = [];
    };
    for (const it of list) {
      if (it.from >= end && group.length) flush();
      group.push(it);
      end = Math.max(end, it.to);
    }
    flush();
    const blockedDay = allDayBlocked(d);
    return `<div class="wk-col ${d === S.today ? 'today' : ''} ${blockedDay ? 'blocked' : ''}" data-act="wk-slot" data-date="${d}" data-key="wc-${d}">${html}${d === S.today && nowM >= h0 && nowM <= h1 ? `<div class="wk-now" data-key="wk-now" style="top:calc(${nowM - h0}px * var(--ppm))"></div>` : ''}</div>`;
  });
  const hours = [];
  for (let m = h0; m <= h1; m += 60) hours.push(`<span style="top:calc(${m - h0}px * var(--ppm))">${m / 60}</span>`);
  return `<div class="wk" data-key="wk">
    <div class="wk-row wk-head" data-key="wkh"><div class="wk-gut"></div>${days.map((d, i) => `<button class="wk-dh ${d === S.today ? 'today' : ''} ${parse(d).getDay() % 6 === 0 ? 'we' : ''}" data-act="open-day" data-date="${d}" data-key="wdh-${d}"><span class="wd">${WD_SHORT[(parse(d).getDay() + 6) % 7]}</span><span class="dn">${parse(d).getDate()}</span></button>`).join('')}</div>
    ${adRows ? `<div class="wk-row wk-allday" data-key="wka"><div class="wk-gut"></div>${days.map((d) => `<div class="wk-ad" data-key="wad-${d}">${allday[d].slice(0, 3).map((it) => `<div class="wk-chip ${it.type} ${it.blocking ? 'blocking' : ''} ${it.done ? 'done' : ''}" ${it.type === 'todo' ? 'data-act="rm-goto"' : `data-act="open" data-type="${it.type}"`} data-id="${esc(it.id)}" data-key="wac-${esc(it.id)}-${d}" style="--c:${it.color};--ink:${ink(it.color)}" title="${esc(it.title)}">${it.icon ? icon(it.icon, 10) : ''}${esc(it.title)}</div>`).join('')}${allday[d].length > 3 ? `<span class="wk-more">+${allday[d].length - 3}</span>` : ''}</div>`).join('')}</div>` : ''}
    <div class="wk-body" data-key="wkb"><div class="wk-grid" data-key="wkg" data-h0="${h0}" data-ppm="${ppm}" style="height:calc(${h1 - h0}px * var(--ppm));--ppm:${ppm}">
      <div class="wk-hours" data-key="wkhr">${hours.join('')}</div>${cols.join('')}</div></div>
  </div>`;
}
// Cambio mes ↔ semana con transición continua: la fila de la semana elegida se abre hasta ocupar todo
// (el resto de semanas se apartan hacia arriba y hacia abajo) y al volver se cierra en su sitio.
let viewBusy = false;
async function setView(v) {
  if (ui.view === v || viewBusy) return;
  viewBusy = true;
  closeCard(true);
  const toWeek = v === 'week';
  if (toWeek) ui.weekStart = mondayOf(S.today.slice(0, 7) === ui.month.slice(0, 7) ? S.today : ui.month);
  else ui.month = ui.weekStart.slice(0, 8) + '01';
  ui.view = v;
  localStorage.setItem('view', v);
  const cal = $('#cal');
  const weeks = $('#weeks');
  const H = weeks.clientHeight;
  // Foto de lo que había, para animarla mientras entra lo nuevo
  const ghost = weeks.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.classList.add('view-ghost');
  ghost.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
  const seq = ++goSeq;
  const st = await api.state(gridRange());
  if (seq !== goSeq) return (viewBusy = false), ghost.remove();
  S = st;
  cal.appendChild(ghost);
  document.body.classList.toggle('view-week', toWeek);
  renderHead();
  renderCal(0);
  // Fila del mes en la que está la semana
  const monthFrom = addDays(ui.month, -((parse(ui.month).getDay() + 6) % 7));
  const row = Math.max(0, Math.min(5, Math.floor(diffDays(monthFrom, ui.weekStart) / 7)));
  const rowTop = (H / 6) * row, rowH = H / 6;
  const E = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const band = `inset(${rowTop}px 0 ${Math.max(0, H - rowTop - rowH)}px 0 round 14px)`;
  const anims = [];
  if (toWeek) {
    // Las otras semanas se apartan; la elegida se desvanece mientras la semana grande se abre desde ella
    [...ghost.children].forEach((w, i) => anims.push(w.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${i < row ? -36 : i > row ? 36 : 0}px)`, opacity: 0 }], { duration: i === row ? 380 : 340, easing: E, fill: 'forwards' })));
    anims.push(weeks.animate([{ clipPath: band, opacity: 0.35 }, { clipPath: 'inset(0px 0 0px 0 round 0px)', opacity: 1 }], { duration: 560, easing: E }));
    $$('.wk-it, .wk-chip', weeks).forEach((x, i) => x.animate([{ opacity: 0, transform: 'translateY(6px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 140 + Math.min(i, 14) * 18, easing: E, fill: 'backwards' }));
  } else {
    // La semana grande se cierra hasta su fila; las demás semanas vuelven a su sitio desde arriba y abajo
    anims.push(ghost.animate([{ clipPath: 'inset(0px 0 0px 0 round 0px)', opacity: 1 }, { clipPath: band, opacity: 0 }], { duration: 480, easing: E, fill: 'forwards' }));
    [...weeks.children].forEach((w, i) => w.animate([{ transform: `translateY(${i < row ? -36 : i > row ? 36 : 0}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: i === row ? 60 : 120 + Math.abs(i - row) * 25, easing: E, fill: 'backwards' }));
  }
  // La cabecera acompaña: el rango de fechas y el botón cambian con un fundido
  $('.month .y')?.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: E });
  $('.view-btn .ic')?.animate([{ transform: 'scale(0.6) rotate(-20deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: E });
  await Promise.all(anims.map((a) => a.finished.catch(() => {})));
  ghost.remove();
  viewBusy = false;
}
async function goWeekOrMonth(d) {
  closeCard(true);
  const seq = ++goSeq;
  const st = await api.state(gridRange());
  if (seq !== goSeq) return;
  S = st;
  renderHead();
  renderCal(d || 1, !!d);
}
// Semana en el PC: la rueda corre un día (no tiene por qué empezar en lunes). Las columnas que
// siguen se deslizan desde donde estaban (también a mitad de animación) y el día nuevo entra con un fundido
async function stepDays(d) {
  closeCard(true);
  ui.weekStart = addDays(ui.weekStart, d);
  ui.month = ui.weekStart.slice(0, 8) + '01';
  const seq = ++goSeq;
  const st = await api.state(gridRange());
  if (seq !== goSeq) return;
  const SEL = '#weeks .wk-col, #weeks .wk-dh, #weeks .wk-ad';
  const before = {};
  for (const el of $$(SEL)) before[el.dataset.key] = el.getBoundingClientRect().left;
  S = st;
  renderHead();
  renderCal(0);
  const E = 'cubic-bezier(0.22, 1, 0.36, 1)';
  for (const el of $$(SEL)) {
    el.getAnimations().forEach((a) => a.cancel());
    const x0 = before[el.dataset.key], dx = x0 == null ? 0 : x0 - el.getBoundingClientRect().left;
    if (x0 == null) el.animate([{ opacity: 0, transform: `translateX(${d * 16}px)` }, { opacity: 1, transform: 'none' }], { duration: 340, easing: E });
    else if (Math.abs(dx) > 0.5) el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 340, easing: E });
  }
}
function changeWeek(d) {
  if (S?.web && d) return carGo(addDays(ui.weekStart, d * 7), d); // en el móvil, la semana desliza como el mes
  ui.weekStart = addDays(ui.weekStart, d * 7);
  ui.month = ui.weekStart.slice(0, 8) + '01';
  goWeekOrMonth(d);
}
// La raya de «ahora» avanza sola
setInterval(() => ui.view === 'week' && S && !ui.card && renderCal(), 60000);

// Las semanas del mes de ui.month con los datos de S (el móvil también lo usa para pintar el mes vecino)
function weeksHTML() {
  const { from } = gridRange();
  const month = parse(ui.month).getMonth();
  const weekH = $('#weeks').clientHeight / 6 || 80;
  const G = S.web ? { top: 36, step: 23 } : { top: 33, step: 21 }; // en el móvil, barras algo más grandes
  const cap = Math.max(1, Math.floor((weekH - G.top - 1) / G.step));
  let html = '';
  let n = 0;
  for (let w = 0; w < 6; w++) {
    const ws = addDays(from, w * 7);
    const items = weekItems(ws);
    const hidden = Array(7).fill(0);
    let bars = '';
    for (const it of items) {
      if (it.lane >= cap) { for (let c = it.s; c <= it.e; c++) hidden[c]++; continue; }
      const p = it.kind === 'ext' ? { color: subColor(it.x.subId) } : it.x.projectId ? proj(it.x.projectId) : { color: '#d97757' };
      const key = `${it.kind}-${it.id}-${w}`;
      const style = `left:calc(${(it.s / 7) * 100}% + 3px);width:calc(${((it.e - it.s + 1) / 7) * 100}% - 6px);top:${G.top + it.lane * G.step}px;--c:${p.color};--ink:${ink(p.color)};--i:${n++}`;
      if (it.kind === 'ext') {
        bars += `<div class="bar ext ${subBlocking(it.x.subId) ? 'blocking' : ''} ${it.cl ? 'cl' : ''} ${it.cr ? 'cr' : ''}" data-act="open" data-type="ext" data-id="${esc(it.id)}" data-key="${esc(key)}" style="${style}" title="${esc(it.x.title)}">${it.x.start && !it.cl && !S.web ? it.x.start + ' ' : ''}${esc(it.x.title)}</div>`;
      } else if (it.kind === 'goal') {
        bars += `<div class="bar goal ${it.x.blocking ? 'blocking' : ''} ${it.x.done ? 'done' : ''}" data-act="open" data-type="goal" data-id="${it.id}" data-key="${key}" style="${style}" title="${esc(it.x.title)}">${icon(it.x.done ? 'check' : 'target', 11)}<span>${esc(it.x.title)}</span></div>`;
      } else if (it.kind === 'ms') {
        bars += `<div class="bar ms ${it.x.blocking ? 'blocking' : ''}" data-act="open" data-type="ms" data-id="${it.id}" data-key="${key}" style="${style}" title="${esc(it.x.title)} · ${projLabel(it.x.projectId, it.x.categoryId)}">${icon(KIND_ICON[it.x.kind] || 'flag', 11)}<span>${esc(it.x.title)}</span></div>`;
      } else {
        const st = S.stats.blocks[it.id];
        bars += `<div class="bar blk ${it.x.blocking ? 'blocking' : ''} ${st.pct === 100 ? 'done' : ''} ${it.cl ? 'cl' : ''} ${it.cr ? 'cr' : ''}" data-block="${it.id}" data-act="open" data-type="block" data-id="${it.id}" data-key="${key}" style="${style}" title="${esc(it.x.title)} · ${projLabel(it.x.projectId, it.x.categoryId)}">${esc(it.x.title)}</div>`;
      }
    }
    let cells = '';
    for (let c = 0; c < 7; c++) {
      const d = addDays(ws, c);
      const st = S.days[d];
      cells += `<div class="cell ${parse(d).getMonth() !== month ? 'out' : ''} ${d === S.today ? 'today' : ''} ${allDayBlocked(d) ? 'blocked' : ''}" data-act="open-day" data-date="${d}" data-key="day-${d}" data-drop="${d}" style="left:${(c / 7) * 100}%;width:${100 / 7}%">
        <span class="num">${parse(d).getDate()}</span>${['ok', 'late', 'carried'].includes(st) && d < S.today ? `<span class="st ${st}"></span>` : ''}${hidden[c] ? `<span class="more">+${hidden[c]}</span>` : ''}</div>`;
    }
    html += `<div class="week">${cells}${bars}</div>`;
  }
  if (!S.db.projects.length) {
    html += `<div class="empty"><div><h2>Tu temario, a la vista</h2><p>Crea una asignatura o proyecto, o pídeselo al agente con el botón de la esquina.</p>
      <div style="display:flex;gap:8px;justify-content:center"><button class="btn primary" data-act="new" data-type="new-project">${icon('plus', 14)} Crear proyecto</button><button class="btn" data-act="demo">Ver ejemplo</button></div></div></div>`;
  }
  return html;
}

// ---------- tarjeta (morph desde una barra o un día) ----------
// ---------- Dependencias de progreso (un tema o subapartado se completa con tareas concretas) ----------
const REF_ICON = { block: 'layers', goal: 'target', todo: 'checklist', task: 'check' };
function refOf(r) {
  const list = { task: S.db.tasks, block: S.db.blocks, goal: S.db.goals || [], todo: S.db.todos || [] }[r.type];
  return list && byId(list, r.id);
}
function refIsDone(r) {
  const x = refOf(r);
  if (!x) return false;
  if (r.type === 'block') return S.stats.blocks[x.id]?.pct === 100;
  if (r.type === 'task') return S.stats.autoDone[x.id] ?? !!x.done;
  return !!x.done;
}
function refText(r) {
  const x = refOf(r);
  if (!x) return '';
  const when = r.type === 'block' ? ` · ${fmtShort(x.date)}${x.start ? ' ' + x.start : ''}` : r.type === 'goal' ? ` · ${fmtShort(x.date)}` : r.type === 'todo' && x.due ? ` · ${fmtShort(x.due)}` : '';
  return esc(x.title) + when;
}
// Chips de lo que hace falta para completar un tema o un subapartado
const depChips = (target, kind) => (target.requires || []).filter(refOf).map((r) => `<span class="dep ${refIsDone(r) ? 'done' : ''}" data-key="dep-${r.id}">${icon(refIsDone(r) ? 'check' : REF_ICON[r.type], 11)}<span>${refText(r)}</span><button data-act="unlink" data-kind="${kind}" data-target="${target.id}" data-id="${r.id}" title="Quitar">${icon('x', 10)}</button></span>`).join('');
function formLink({ topicId, taskId }) {
  const target = topicId ? byId(S.db.topics, topicId) : byId(S.db.tasks, taskId);
  if (!target) return null;
  const pid = topicId ? target.projectId : byId(S.db.topics, target.topicId)?.projectId;
  const cur = new Set((target.requires || []).map((r) => r.type + ':' + r.id));
  const row = (type, x, text) => `<label><input type="checkbox" name="ref" value="${type}:${x.id}" ${cur.has(type + ':' + x.id) ? 'checked' : ''}> ${icon(REF_ICON[type], 12)} ${text}</label>`;
  const blocks = S.db.blocks.filter((b) => b.projectId === pid).sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));
  const goals = (S.db.goals || []).filter((g) => g.projectId === pid);
  const todos = (S.db.todos || []).filter((t) => t.projectId === pid);
  const tasks = S.db.tasks.filter((t) => t.id !== taskId && t.topicId !== topicId && byId(S.db.topics, t.topicId)?.projectId === pid);
  const grp = (title, html) => (html ? `<div class="grp">${title}</div>${html}` : '');
  const list = grp('Bloques (time blocking)', blocks.map((b) => row('block', b, `${esc(b.title)} <span style="color:var(--faint)">· ${fmtShort(b.date)}${b.start ? ' ' + b.start : ''}</span>`)).join(''))
    + grp('Objetivos', goals.map((g) => row('goal', g, `${esc(g.title)} <span style="color:var(--faint)">· ${fmtShort(g.date)}</span>`)).join(''))
    + grp('Recordatorios', todos.map((t) => row('todo', t, esc(t.title))).join(''))
    + grp('Subapartados de otros temas', tasks.map((t) => row('task', t, `${esc(t.title)} <span style="color:var(--faint)">· ${esc(byId(S.db.topics, t.topicId)?.title || '')}</span>`)).join(''));
  return `<form data-form="link" data-topic="${topicId || ''}" data-task="${taskId || ''}"><div class="c-title">¿Con qué se completa «${esc(target.title)}»?</div>
    <div class="c-meta" style="margin-top:6px">${topicId ? 'Lo que marques suma al % del tema (y del examen o seminario).' : 'Este subapartado se marcará solo cuando completes todo lo que marques.'}</div>
    <div class="field"><div class="picklist" style="max-height:260px">${list || '<div class="hint" style="padding:6px 8px">Aún no hay bloques, objetivos ni recordatorios de este proyecto.</div>'}</div></div>
    ${formFoot('Guardar')}</form>`;
}
const taskRow = (t, color, from = '') => `
  <div class="task ${(S.stats.autoDone?.[t.id] ?? t.done) ? 'done' : ''} ${t.requires?.length ? 'auto' : ''}" style="--c:${color}" data-act="toggle-task" data-id="${t.id}">
    <span class="check">${icon('check', 12)}</span>
    <span class="tt"><span class="tx">${esc(t.title)}</span>${from ? `<span class="from">${esc(from)}</span>` : ''}${t.requires?.length ? `<span class="deps">${depChips(t, 'task')}</span>` : ''}</span>
    <button class="ibtn x" data-act="link-open" data-id="task:${t.id}" title="Depende de…">${icon('layers', 12)}</button>
    ${t.carried ? `<span class="carry" title="Arrastrada de días anteriores">${icon('redo', 10)}${t.carried}</span>` : ''}
    <button class="ibtn x" data-act="del-task" data-id="${t.id}" title="Quitar">${icon('x', 12)}</button>
  </div>`;

// Fijo: no se mueve al reorganizar (por defecto, los eventos y lo bloqueante)
const isFixedB = (b) => b.fixed ?? ((b.event ?? !!b.blocking) || !!b.blocking);
// ¿Se puede pausar ahora? El bloque de hoy que está en marcha (o el que ya está en pausa)
function pausable(b) {
  if (b.pausedAt) return true;
  if (!b.start || b.date > S.today || blockEnd(b) < S.today || (b.event ?? !!b.blocking)) return false;
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  const from = minsOf(b.start), to = b.end ? minsOf(b.end) : from + 60;
  return from <= nm && nm < to && S.stats.blocks[b.id]?.pct !== 100;
}
const pauseBtn = (b) => (pausable(b) ? `<div class="c-actions"><button class="btn ${b.pausedAt ? 'primary' : ''}" data-act="pause-block" data-id="${b.id}" ${b.pausedAt ? 'data-resume="1"' : ''}>${b.pausedAt ? `${icon('play', 13)} Reanudar · en pausa desde las ${hhmmOf(new Date(b.pausedAt).getHours() * 60 + new Date(b.pausedAt).getMinutes())}` : `${icon('pause', 13)} Pausar`}</button></div>` : '');
function cardBlock(id) {
  const b = byId(S.db.blocks, id);
  if (!b) return null;
  const p = proj(b.projectId);
  const st = S.stats.blocks[id];
  const tasks = S.db.tasks.filter((t) => t.blockId === id);
  const m = b.milestoneId && byId(S.db.milestones, b.milestoneId);
  const past = blockEnd(b) < S.today;
  return `
    <div class="c-head"><div class="t"><div class="c-title">${esc(b.title)}</div>
      <div class="c-meta"><span class="tag" style="--c:${p.color}">${projLabel(b.projectId, b.categoryId)}</span>${b.blocking ? `<span class="tag blocking-tag">${icon('clock', 11)} Bloqueado</span>` : ''}${isFixedB(b) ? `<span class="tag blocking-tag" title="No se mueve al reorganizar">${icon('pin', 11)} Fijo</span>` : ''}${b.endDate ? `${fmtShort(b.date)} → ${fmtShort(b.endDate)}` : fmtLong(b.date)}${b.start ? ` · ${b.start}${b.end ? '–' + b.end : ''}` : ''}</div></div>
      <button class="ibtn" data-act="close-card">${icon('x', 15)}</button></div>
    <div class="c-hero" style="--c:${p.color}">${ring('cb-' + id, st.pct, p.color, 48, 5)}
      <div><div style="font-weight:600">${st.carried ? 'Pendientes movidos' : st.manual ? (b.done ? 'Hecho' : 'Sin tareas') : `${st.done} de ${st.total} hechas`}</div>
      ${m ? `<div class="lbl"><a class="lnk" data-act="open" data-type="ms" data-id="${m.id}">${esc(m.title)}</a> · ${rel(diffDays(S.today, m.date)).toLowerCase()}</div>` : ''}</div></div>
    ${(() => { const sums = [...S.db.topics.filter((tp) => (tp.requires || []).some((r) => r.id === id)).map((tp) => tp.title), ...S.db.tasks.filter((t) => (t.requires || []).some((r) => r.id === id)).map((t) => t.title), ...(b.milestoneId && !tasks.length && m ? [m.title] : []), ...(b.categoryId && !tasks.length && catOf(b.projectId, b.categoryId) ? [catOf(b.projectId, b.categoryId).name] : [])]; return sums.length ? `<div class="c-meta sums">${icon('layers', 12)} Suma a: ${sums.map(esc).join(' · ')}</div>` : ''; })()}
    <div class="tasks">${tasks.map((t) => taskRow(t, p.color, byId(S.db.topics, t.topicId)?.title)).join('')}
      ${!tasks.length && !st.carried && (b.event ?? !!b.blocking) ? `<div class="c-meta" style="margin-top:8px">${icon('cal', 12)} Evento: no hace falta marcarlo como hecho</div>` : ''}
      ${!tasks.length && !st.carried && !(b.event ?? !!b.blocking) ? `<div class="task ${b.done ? 'done' : ''}" style="--c:${p.color}" data-act="toggle-block" data-id="${id}"><span class="check">${icon('check', 12)}</span><span class="tt"><span class="tx">Bloque completado</span></span></div>` : ''}
      <input class="inline-add" data-key="addb-${id}" data-add="block-task" data-id="${id}" placeholder="Añadir tarea a este bloque  ↵" />
    </div>
    ${pauseBtn(b)}
    ${past && st.pct < 100 ? `<div class="c-actions"><button class="btn" data-act="rollover">${icon('redo', 13)} Pasar lo pendiente al siguiente bloque</button></div>` : ''}
    <div class="c-foot"><button class="btn plain" data-act="swap" data-type="edit-block" data-id="${id}">${icon('edit', 13)} Editar</button><button class="btn danger" data-act="del-block" data-id="${id}">${icon('trash', 13)}</button></div>`;
}

function cardMilestone(id) {
  const m = byId(S.db.milestones, id);
  if (!m) return null;
  const p = proj(m.projectId);
  const st = S.stats.milestones[id];
  const n = diffDays(S.today, m.date);
  const pending = st.total - st.done;
  const topics = S.db.topics.filter((t) => t.milestoneId === id).sort((a, c) => (a.order ?? 0) - (c.order ?? 0));
  const planned = S.db.blocks.some((b) => b.milestoneId === id && blockEnd(b) >= S.today);
  return `
    <div class="c-head"><div class="t"><div class="c-title">${esc(m.title)}</div>
      <div class="c-meta"><span class="tag" style="--c:${p.color}">${icon(KIND_ICON[m.kind], 11)} ${projLabel(m.projectId, m.categoryId)}</span>${fmtLong(m.date)}${m.time ? ' · ' + m.time : ''}</div></div>
      <button class="ibtn" data-act="close-card">${icon('x', 15)}</button></div>
    <div class="c-hero" style="--c:${p.color}"><div style="flex:1"><div class="big">${n < 0 ? '✓' : n}</div>
      <div class="lbl">${n < 0 ? 'Ya pasó' : n === 0 ? '¡Es hoy!' : `${n === 1 ? 'día' : 'días'} para ${ART[m.kind]}`}${n > 0 && pending ? ` · ~${(pending / n).toFixed(pending / n < 10 ? 1 : 0)} tareas/día` : ''}</div></div>
      ${ring('cm-' + id, st.pct, p.color, 64, 6, true, 'big')}</div>
    ${topics.map((tp) => {
      const tasks = S.db.tasks.filter((t) => t.topicId === tp.id).sort((a, c) => (a.order ?? 0) - (c.order ?? 0));
      const ts = S.stats.topics[tp.id];
      return `<div class="topic ${ui.closed.has(tp.id) ? 'closed' : ''}"><div class="topic-h" data-act="fold" data-id="${tp.id}"><span class="chev">${icon('chevD', 14)}</span><span class="name">${esc(tp.title)}</span><span class="meta">${ts.done}/${ts.total}</span>
        <button class="ibtn sm" data-act="del-topic" data-id="${tp.id}" title="Eliminar tema">${icon('trash', 12)}</button></div>
        ${prog('tp-' + tp.id, ts.pct, p.color)}
        <div class="deps topic-deps">${depChips(tp, 'topic')}<button class="dep add" data-act="swap" data-type="link" data-id="topic:${tp.id}">${icon('plus', 11)} Depende de…</button></div>
        <div class="tasks">${tasks.map((t) => taskRow(t, p.color)).join('')}<input class="inline-add" data-key="addt-${tp.id}" data-add="task" data-topic="${tp.id}" placeholder="Añadir subapartado  ↵" /></div></div>`;
    }).join('')}
    <input class="inline-add" style="margin-top:12px" data-key="addtp-${id}" data-add="topic" data-project="${p.id}" data-ms="${id}" placeholder="Nuevo tema  ↵" />
    <div class="c-actions"><button class="btn primary" data-act="swap" data-type="plan" data-id="${id}">${icon('wand', 13)} ${planned ? 'Replanificar' : 'Planificar estudio'}</button></div>
    <div class="c-foot"><button class="btn plain" data-act="swap" data-type="edit-ms" data-id="${id}">${icon('edit', 13)} Editar</button><button class="btn danger" data-act="del-ms" data-id="${id}">${icon('trash', 13)}</button></div>`;
}

const goalColor = (g) => (g.projectId ? proj(g.projectId).color : '#d97757');
function cardGoal(id) {
  const g = byId(S.db.goals || [], id);
  if (!g) return null;
  const c = goalColor(g);
  const n = diffDays(S.today, g.date);
  return `
    <div class="c-head"><div class="t"><div class="c-title">${esc(g.title)}</div>
      <div class="c-meta"><span class="tag" style="--c:${c}">${icon('target', 11)} Objetivo${g.projectId ? ' · ' + projLabel(g.projectId, g.categoryId) : ''}</span>${fmtLong(g.date)}${g.time ? ' · ' + g.time : ''}</div></div>
      <button class="ibtn" data-act="close-card">${icon('x', 15)}</button></div>
    <div class="goal-check ${g.done ? 'done' : ''}" style="--c:${c}" data-act="toggle-goal" data-id="${id}">
      <span class="check">${icon('check', 15)}</span>
      <div><b>${g.done ? '¡Conseguido!' : 'Marcar como conseguido'}</b><div class="c-meta" style="margin:0">${g.done ? (g.doneAt ? 'El ' + fmtShort(g.doneAt) : '') : n < 0 ? `Era para ${rel(n).toLowerCase()}` : rel(n)}</div></div></div>
    ${g.notes ? `<div class="c-meta" style="margin-top:12px;font-size:12.5px">${esc(g.notes)}</div>` : ''}
    <div class="c-foot"><button class="btn plain" data-act="swap" data-type="edit-goal" data-id="${id}">${icon('edit', 13)} Editar</button><button class="btn danger" data-act="del-goal" data-id="${id}">${icon('trash', 13)}</button></div>`;
}
const goalRow = (g) => `
  <div class="task ${g.done ? 'done' : ''}" style="--c:${goalColor(g)}" data-act="toggle-goal" data-id="${g.id}">
    <span class="check" style="border-radius:50%">${icon('check', 12)}</span>
    <span class="tt"><span class="tx">${esc(g.title)}</span><span class="from">Objetivo${g.date !== S.today ? ' · ' + rel(diffDays(S.today, g.date)).toLowerCase() : ''}${g.time ? ' · ' + g.time : ''}</span></span>
  </div>`;
function formGoal({ id, date }) {
  const g = id && byId(S.db.goals || [], id);
  const opts = `<option value="">— Sin proyecto —</option>` + S.db.projects.map((p) => `<option value="${p.id}" ${p.id === g?.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  return `<form data-form="goal" data-id="${id || ''}"><div class="c-title">${g ? 'Editar objetivo' : 'Nuevo objetivo'}</div>
    <div class="c-meta" style="margin-top:4px">Una marca en un día concreto: algo que quieres tener conseguido ese día.</div>
    <label class="field"><span>Objetivo</span><input class="input" name="title" required autofocus value="${esc(g?.title || '')}" placeholder="Terminar el resumen del tema 3…"></label>
    <div class="row2"><label class="field"><span>Día</span><input class="input" type="date" name="date" required value="${g?.date || date || S.today}"></label>
      <label class="field"><span>Hora</span><input class="input" type="time" name="time" value="${g?.time || ''}"></label></div>
    <label class="field"><span>Proyecto</span><select class="input" name="goalProject">${opts}</select></label>
    ${catField(g?.projectId, g?.categoryId)}
    <label class="field"><span>Notas</span><textarea class="input" name="notes" rows="2">${esc(g?.notes || '')}</textarea></label>
    <label class="toggle"><div>Tiempo bloqueado<small>Con hora ocupa 1 h; sin hora, el día entero. Se ve en todas las capas</small></div><input type="checkbox" name="blocking" ${g?.blocking ? 'checked' : ''}><span class="switch"></span></label>
    ${formFoot(g ? 'Guardar' : 'Crear objetivo')}</form>`;
}

function cardExt(id) {
  const e = (S.db.extEvents || []).find((x) => x.id === id);
  if (!e) return null;
  const sub = byId(S.db.subscriptions || [], e.subId);
  const c = subColor(e.subId);
  return `
    <div class="c-head"><div class="t"><div class="c-title">${esc(e.title)}</div>
      <div class="c-meta"><span class="tag" style="--c:${c}">${icon('cal', 11)} ${esc(sub?.name || 'Calendario')}</span>${e.endDate ? `${fmtShort(e.date)} → ${fmtShort(e.endDate)}` : fmtLong(e.date)}${e.start ? ` · ${e.start}${e.end ? '–' + e.end : ''}` : ' · todo el día'}</div></div>
      <button class="ibtn" data-act="close-card">${icon('x', 15)}</button></div>
    ${e.location ? `<div class="c-meta" style="margin-top:12px">📍 ${esc(e.location)}</div>` : ''}
    ${e.notes ? `<div class="c-meta" style="margin-top:8px;white-space:pre-wrap;font-size:12.5px">${esc(e.notes)}</div>` : ''}
    <div class="c-meta" style="margin-top:14px;font-size:11.5px">Calendario suscrito · solo lectura</div>`;
}

function cardDay(d) {
  const ms = S.db.milestones.filter((m) => m.date === d && inLayer('ms', m));
  const blocks = S.db.blocks.filter((b) => b.date <= d && blockEnd(b) >= d && inLayer('blk', b));
  const goals = (S.db.goals || []).filter((g) => g.date === d && inLayer('goal', g));
  const exts = (S.db.extEvents || []).filter((e) => e.date <= d && (e.endDate || e.date) >= d && inLayer('ext', e)).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const manual = S.db.days[d]?.status || '';
  const st = S.days[d];
  const row = (type, id, color, title, meta) => `<div class="list-row" data-act="swap" data-type="${type}" data-id="${id}"><span class="dotc" style="--c:${color}"></span><div class="grow"><div class="ttl">${esc(title)}</div><div class="meta">${meta}</div></div>${icon('chevR', 14)}</div>`;
  return `
    <div class="c-head"><div class="t"><div class="c-title">${fmtLong(d)}</div><div class="c-meta">${rel(diffDays(S.today, d))}</div></div>
      <button class="ibtn" data-act="close-card">${icon('x', 15)}</button></div>
    <div style="margin-top:10px">
      ${ms.map((m) => row('ms', m.id, proj(m.projectId).color, m.title, `${KIND_LABEL[m.kind]}${catOf(m.projectId, m.categoryId) ? ' · ' + esc(catOf(m.projectId, m.categoryId).name) : ''} · ${S.stats.milestones[m.id].pct}%`)).join('')}
      ${blocks.map((b) => { const s = S.stats.blocks[b.id]; return row('block', b.id, proj(b.projectId).color, b.title, `${projLabel(b.projectId, b.categoryId)}${b.start ? ' · ' + b.start : ''} · ${s.manual ? (b.done ? 'hecho' : 'pendiente') : `${s.done}/${s.total}`}`); }).join('')}
      ${goals.map(goalRow).join('')}
      ${rmAll().filter((t) => t.due === d && (!t.done || rmRecent.has(t.id))).map(todoRow).join('')}
      ${exts.map((e) => row('ext', e.id, subColor(e.subId), e.title, `${esc(byId(S.db.subscriptions || [], e.subId)?.name || '')}${e.start ? ' · ' + e.start : ' · todo el día'}`)).join('')}
      ${!ms.length && !blocks.length && !goals.length && !exts.length && !rmAll().some((t) => t.due === d && !t.done) ? '<div class="hint">Día libre.</div>' : ''}
    </div>
    ${d <= S.today ? `<div style="margin-top:10px" class="seg">
      <button class="${manual === 'ok' || (!manual && st === 'ok') ? 'on ok' : ''}" data-act="day-status" data-date="${d}" data-s="ok">${icon('check', 13)} Voy al día</button>
      <button class="${manual === 'late' || (!manual && st === 'late') ? 'on late' : ''}" data-act="day-status" data-date="${d}" data-s="late">${icon('clock', 13)} Voy atrasado</button></div>` : ''}
    <div class="c-actions"><button class="btn" data-act="swap" data-type="new-block" data-date="${d}">${icon('layers', 13)} Bloque</button><button class="btn" data-act="swap" data-type="new-goal" data-date="${d}">${icon('target', 13)} Objetivo</button><button class="btn" data-act="swap" data-type="new-ms" data-date="${d}">${icon('cap', 13)} Examen</button></div>`;
}

// --- formularios ---
const projectOptions = (sel) => S.db.projects.filter((p) => !p.archived).map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('') + `<option value="__new" ${sel ? '' : 'selected'}>+ Nuevo proyecto…</option>`;
const segField = (name, opts, sel) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" class="${v === sel ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}<input type="hidden" name="${name}" value="${sel}"></div>`;
const newProjectField = (show) => `<label class="field" data-newproj ${show ? '' : 'hidden'}><span>Nombre del proyecto nuevo</span><input class="input" name="newProject" placeholder="Física II, TFG…"></label>`;
const formFoot = (label) => `<div class="c-foot" style="margin-top:14px"><button type="button" class="btn plain" data-act="card-back">Cancelar</button><button class="btn primary" type="submit">${label}</button></div>`;

function formProject() {
  return `<form data-form="project"><div class="c-title">Nuevo proyecto</div>
    <label class="field"><span>Nombre</span><input class="input" name="name" required autofocus placeholder="Física II, TFG, Mi app…"></label>
    <div class="field"><span>Tipo</span>${segField('kind', [['asignatura', 'Asignatura'], ['trabajo', 'Trabajo'], ['personal', 'Propio']], 'asignatura')}</div>
    <div class="field"><span>Color</span><div class="swatches">${PALETTE.map((c, i) => `<label style="--c:${c}"><input type="radio" name="color" value="${c}" ${i === S.db.projects.length % PALETTE.length ? 'checked' : ''}></label>`).join('')}</div></div>
    ${formFoot('Crear')}</form>`;
}
function formMilestone({ id, date }) {
  const m = id && byId(S.db.milestones, id);
  const pid = m?.projectId || S.db.projects[0]?.id;
  return `<form data-form="ms" data-id="${id || ''}"><div class="c-title">${m ? 'Editar' : 'Nueva fecha importante'}</div>
    <div class="field"><span>Tipo</span>${segField('kind', [['examen', 'Examen'], ['entrega', 'Entrega'], ['hito', 'Hito']], m?.kind || 'examen')}</div>
    ${m ? '' : `<label class="field"><span>Proyecto</span><select class="input" name="projectId">${projectOptions(pid)}</select></label>${newProjectField(!pid)}`}
    ${catField(pid, m?.categoryId)}
    <label class="field"><span>Título</span><input class="input" name="title" required autofocus value="${esc(m?.title || '')}" placeholder="Parcial 1, Entrega práctica…"></label>
    <div class="row2"><label class="field"><span>Fecha</span><input class="input" type="date" name="date" required value="${m?.date || date || addDays(S.today, 14)}"></label>
      <label class="field"><span>Hora</span><input class="input" type="time" name="time" value="${m?.time || ''}"></label></div>
    <label class="toggle"><div>Tiempo bloqueado<small>Con hora ocupa 2 h; sin hora, el día entero. Se ve en todas las capas</small></div><input type="checkbox" name="blocking" ${m?.blocking ? 'checked' : ''}><span class="switch"></span></label>
    ${m ? '' : `<label class="field"><span>Temas (uno por línea, opcional)</span><textarea class="input" name="topics" rows="3" placeholder="Tema 1 · Cinemática&#10;Tema 2 · Dinámica"></textarea></label>`}
    ${formFoot(m ? 'Guardar' : 'Crear')}</form>`;
}
function pickTasks(pid, mid, checked, blockId) {
  const topics = S.db.topics.filter((t) => t.projectId === pid && (!mid || t.milestoneId === mid));
  const html = topics.map((tp) => {
    const tasks = S.db.tasks.filter((t) => t.topicId === tp.id && (!t.done || checked.includes(t.id)));
    if (!tasks.length) return '';
    return `<div class="grp">${esc(tp.title)}</div>` + tasks.map((t) => {
      const cur = t.blockId && t.blockId !== blockId && byId(S.db.blocks, t.blockId);
      return `<label><input type="checkbox" name="taskIds" value="${t.id}" ${checked.includes(t.id) ? 'checked' : ''}> ${esc(t.title)}${cur ? ` <span style="color:var(--faint)">· ${fmtShort(cur.date)}</span>` : ''}</label>`;
    }).join('');
  }).join('');
  return html || '<div class="hint" style="padding:6px 8px">Sin tareas pendientes</div>';
}
const msOptions = (pid, sel) => `<option value="">— Ninguno —</option>` + S.db.milestones.filter((m) => m.projectId === pid && m.date >= S.today).map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.title)} · ${fmtShort(m.date)}</option>`).join('');
function formBlock({ id, date, ms, start }) {
  const b = id && byId(S.db.blocks, id);
  const m0 = ms && byId(S.db.milestones, ms);
  const pid = b?.projectId || m0?.projectId || S.db.projects[0]?.id;
  const mid = b?.milestoneId || ms || '';
  const assigned = b ? S.db.tasks.filter((t) => t.blockId === b.id).map((t) => t.id) : [];
  return `<form data-form="block" data-id="${id || ''}"><div class="c-title">${b ? 'Editar bloque' : 'Bloque de estudio'}</div>
    ${b ? '' : `<div class="row2"><label class="field"><span>Proyecto</span><select class="input" name="projectId">${projectOptions(pid)}</select></label>
      <label class="field"><span>Para</span><select class="input" name="milestoneId">${pid ? msOptions(pid, mid) : ''}</select></label></div>${newProjectField(!pid)}`}
    ${catField(pid, b ? b.categoryId : m0?.categoryId)}
    <label class="field"><span>Qué vas a hacer</span><input class="input" name="title" required autofocus value="${esc(b?.title || (m0 ? 'Estudiar · ' + m0.title : ''))}" placeholder="Repasar tema 2…"></label>
    <div class="row2"><label class="field"><span>Desde</span><input class="input" type="date" name="date" required value="${b?.date || date || S.today}"></label>
      <label class="field"><span>Hasta</span><input class="input" type="date" name="endDate" value="${b?.endDate || ''}"></label></div>
    <div class="row2"><label class="field"><span>Inicio</span><input class="input" type="time" name="start" value="${b?.start || start || ''}"></label>
      <label class="field"><span>Fin</span><input class="input" type="time" name="end" value="${b?.end || (start ? hhmmOf(Math.min(1439, minsOf(start) + 60)) : '')}"></label></div>
    <label class="toggle"><div>Es un evento<small>Un viaje, una cita, una clase…: no es una tarea, no se pregunta si lo has terminado ni suma al progreso</small></div><input type="checkbox" name="event" ${b && (b.event ?? !!b.blocking) ? 'checked' : ''}><span class="switch"></span></label>
    <label class="toggle"><div>Tiempo bloqueado<small>Ocupa su hueco en todas las capas: no se podrá poner nada encima</small></div><input type="checkbox" name="blocking" ${b?.blocking ? 'checked' : ''}><span class="switch"></span></label>
    <label class="toggle"><div>Fijo<small>No se mueve al reorganizar ni al retrasar por una pausa (una clase, una cita…). Si no, es flexible</small></div><input type="checkbox" name="fixed" ${b && isFixedB(b) ? 'checked' : ''}><span class="switch"></span></label>
    <div class="field"><span>Tareas</span><div class="picklist" data-pick>${pid ? pickTasks(pid, mid, assigned, id) : ''}</div></div>
    ${formFoot(b ? 'Guardar' : 'Crear bloque')}</form>`;
}
function formPlan({ id }) {
  const m = byId(S.db.milestones, id);
  const days = Math.max(0, diffDays(S.today, m.date));
  return `<form data-form="plan" data-id="${id}"><div class="c-title">Planificar ${esc(m.title)}</div>
    <div class="c-meta" style="margin-top:6px">Reparto lo pendiente en bloques diarios hasta la víspera y dejo días de repaso. Rehace el plan automático anterior.</div>
    <div class="row2"><label class="field"><span>Empezar el</span><input class="input" type="date" name="from" value="${S.today}"></label>
      <label class="field"><span>Días de repaso</span><input class="input" type="number" min="0" max="7" name="reviewDays" value="${days > 6 ? 1 : 0}"></label></div>
    <div class="row2"><label class="field"><span>Inicio</span><input class="input" type="time" name="start"></label><label class="field"><span>Fin</span><input class="input" type="time" name="end"></label></div>
    <label class="toggle" style="margin-top:6px"><div>Saltar fines de semana</div><input type="checkbox" name="skipWeekends"><span class="switch"></span></label>
    ${formFoot('Planificar')}</form>`;
}

const CARD_W = { ext: 300, goal: 310, 'new-goal': 320, 'edit-goal': 320, block: 320, ms: 340, day: 300, 'new-project': 320, 'new-ms': 330, 'edit-ms': 330, 'new-block': 350, 'edit-block': 350, plan: 330, link: 350 };
function cardHTML(v) {
  switch (v.type) {
    case 'goal': return cardGoal(v.id);
    case 'ext': return cardExt(v.id);
    case 'new-goal': return formGoal({ date: v.date });
    case 'edit-goal': return formGoal({ id: v.id });
    case 'block': return cardBlock(v.id);
    case 'ms': return cardMilestone(v.id);
    case 'day': return cardDay(v.date);
    case 'new-project': return formProject();
    case 'new-ms': return formMilestone({ date: v.date });
    case 'edit-ms': return formMilestone({ id: v.id });
    case 'new-block': return formBlock({ date: v.date, ms: v.ms, start: v.start });
    case 'edit-block': return formBlock({ id: v.id });
    case 'plan': return formPlan({ id: v.id });
    case 'link': { const [k, id] = String(v.id || '').split(':'); return formLink(k === 'topic' ? { topicId: id } : { taskId: id }); }
  }
}
function measure(html, width) {
  const probe = document.createElement('div');
  probe.className = 'card-in';
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', width: width + 'px', height: 'auto', inset: 'auto', left: '-9999px', top: '0' });
  probe.innerHTML = html;
  $('#widget').appendChild(probe);
  const h = probe.scrollHeight + 2;
  probe.remove();
  return h;
}
function place(a, w, h) {
  const m = 12;
  w = Math.min(w, a.W - 2 * m);
  const H = Math.min(h, a.H - 2 * m);
  let left = a.right + 10;
  if (left + w > a.W - m) left = a.left - 10 - w;
  if (left < m) left = Math.max(m, Math.min(a.W - w - m, a.left + a.width / 2 - w / 2));
  const top = Math.max(m, Math.min(a.H - H - m, a.top - 10));
  return { left, top, width: w, height: H };
}
const px = (r) => ({ left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });

function openCard(v, anchorEl) {
  if (S.web) return navTo({ k: 'card', v: pageOf(v) }); // en el móvil, una pantalla nueva del historial
  const card = $('#card');
  const a = relRect(anchorEl);
  const html = cardHTML(v);
  if (!html) return;
  const w = CARD_W[v.type] || 330;
  const target = place(a, w, measure(html, w));
  ui.card = { ...v, anchor: anchorEl.dataset.key || null };
  fixCardSize(target);
  card.innerHTML = `<div class="card-in">${html}</div>`;
  card.classList.add('show');
  Object.assign(card.style, px(target));
  const isBar = anchorEl.classList.contains('bar');
  const from = isBar ? getComputedStyle(anchorEl).backgroundColor : getComputedStyle(card).backgroundColor;
  const bg = getComputedStyle(card).backgroundColor;
  card.animate(
    [{ ...px(a), borderRadius: isBar ? '6px' : '12px', backgroundColor: from, opacity: 0.6 }, { ...px(target), borderRadius: '20px', backgroundColor: bg, opacity: 1 }],
    { duration: 640, easing: SPRING }
  );
  $('.card-in', card).animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 0, offset: 0.25 }, { opacity: 1, transform: 'none' }], { duration: 520, easing: OUT });
  afterCard();
}
// El contenido se maqueta ya con el tamaño final: el morph solo lo desvela, sin que el texto cambie de línea
function fixCardSize(r) {
  const card = $('#card');
  card.style.setProperty('--cw', r.width + 'px');
  card.style.setProperty('--ch', r.height + 'px');
}
function afterCard() {
  const card = $('#card');
  animateValues(card);
  setTimeout(() => $('[autofocus]', card)?.focus(), S.web ? 450 : 250); // en el móvil, cuando la pantalla ya ha entrado (el teclado no la empuja a medias)
}
function swapCard(v) {
  if (S.web) return navTo({ k: 'card', v: pageOf(v) }, { replace: true }); // formulario → resultado: misma entrada
  const card = $('#card');
  const html = cardHTML(v);
  if (!html) return closeCard();
  const from = { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
  const w = CARD_W[v.type] || 330;
  const anchor = ui.card?.anchor && $(`[data-key="${ui.card.anchor}"]`);
  const W = $('#widget');
  const a = anchor ? relRect(anchor) : { ...from, right: from.left + from.width, bottom: from.top + from.height, W: W.clientWidth, H: W.clientHeight };
  const target = place(a, w, measure(html, w));
  ui.card = { ...v, anchor: ui.card?.anchor };
  fixCardSize(target);
  card.innerHTML = `<div class="card-in fade">${html}</div>`;
  card.classList.add('show');
  Object.assign(card.style, px(target));
  card.animate([px(from), px(target)], { duration: 560, easing: SPRING });
  afterCard();
}
function updateCard() {
  const card = $('#card');
  const html = S.web ? sheetInner(ui.card) : cardHTML(ui.card);
  if (S.web && ui.card?.type === 'day' && !dcar) {
    const strip = $('.df-strip', card);
    if (strip) morph(strip, dayStrip(ui.card.date), false);
    $$('.card-in.nb', card).forEach((el) => delete el.dataset.date); // los días vecinos se repintan con los datos nuevos
    prepDays();
  }
  if (!html) return closeCard(true);
  const inner = $('.card-in', card);
  if (!inner || $('form', inner)) return; // no pisar un formulario a medio rellenar
  const scroll = inner.scrollTop;
  const focus = document.activeElement?.dataset?.key;
  morph(inner, html);
  inner.classList.remove('fade');
  inner.scrollTop = scroll;
  if (focus) $(`[data-key="${focus}"]`, inner)?.focus();
  if (S.web) return animateValues(card); // la página crece sola con su contenido
  const H = $('#widget').clientHeight;
  const h = Math.min(measure(html, card.offsetWidth), H - 24);
  const oldH = card.offsetHeight;
  card.style.setProperty('--ch', h + 'px');
  if (Math.abs(h - oldH) > 2) {
    card.style.height = h + 'px';
    card.style.top = Math.max(12, Math.min(H - h - 12, card.offsetTop)) + 'px';
    card.animate([{ height: oldH + 'px' }, { height: h + 'px' }], { duration: 450, easing: SOFT });
  }
  animateValues(card);
}
function closeCard(instant) {
  const card = $('#card');
  if (!ui.card) return;
  if (S.web) return navBack(); // en el móvil, cerrar es volver atrás
  const anchor = ui.card.anchor && $(`[data-key="${ui.card.anchor}"]`);
  ui.card = null;
  if (instant || !card.classList.contains('show')) return card.classList.remove('show');
  const from = { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
  const kf = anchor
    ? [{ ...px(from), opacity: 1 }, { ...px(relRect(anchor)), opacity: 0, borderRadius: '8px' }]
    : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.92)' }];
  $('.card-in', card)?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
  card.animate(kf, { duration: 340, easing: OUT }).onfinish = () => { if (!ui.card) card.classList.remove('show'); };
}


// ================= Móvil =================
// Lo de un día, en filas (vista de un día a pantalla completa)
function mItems(d) {
  const out = [];
  for (const m of S.db.milestones) if (m.date === d && inLayer('ms', m)) out.push({ type: 'ms', id: m.id, color: proj(m.projectId).color, title: m.title, sub: `${KIND_LABEL[m.kind]} · ${projLabel(m.projectId, m.categoryId)} · ${S.stats.milestones[m.id].pct}%`, time: m.time || '', icon: KIND_ICON[m.kind] });
  for (const g of S.db.goals || []) if (g.date === d && inLayer('goal', g)) out.push({ type: 'goal', id: g.id, color: goalColor(g), title: g.title, sub: `Objetivo${g.projectId ? ' · ' + projLabel(g.projectId, g.categoryId) : ''}`, time: g.time || '', done: g.done, icon: 'target' });
  for (const b of S.db.blocks) if (b.date <= d && blockEnd(b) >= d && inLayer('blk', b)) {
    const st = S.stats.blocks[b.id];
    out.push({ type: 'block', id: b.id, color: proj(b.projectId).color, title: b.title, sub: `${projLabel(b.projectId, b.categoryId)} · ${b.pausedAt ? 'en pausa' : (b.event ?? !!b.blocking) ? 'evento' : st.manual ? (b.done ? 'hecho' : 'pendiente') : `${st.done}/${st.total} tareas`}${isFixedB(b) ? ' · fijo' : ''}`, time: b.start ? `${b.start}${b.end ? '–' + b.end : ''}` : '', done: st.pct === 100, icon: b.pausedAt ? 'pause' : isFixedB(b) ? 'pin' : '' });
  }
  for (const t of rmAll()) if (t.due === d && (!t.done || rmRecent.has(t.id))) out.push({ type: 'todo', id: t.id, color: rmColor(t), title: t.title, sub: esc(rmListOf(t.listId).name) + (t.tags?.length ? ' · ' + t.tags.map((g) => '#' + esc(g)).join(' ') : ''), time: t.time || '', done: t.done, icon: t.flagged ? 'flag' : '' });
  for (const e of S.db.extEvents || []) if (e.date <= d && (e.endDate || e.date) >= d && inLayer('ext', e)) out.push({ type: 'ext', id: e.id, color: subColor(e.subId), title: e.title, sub: esc(byId(S.db.subscriptions || [], e.subId)?.name || ''), time: e.start ? `${e.start}${e.end ? '–' + e.end : ''}` : '' });
  // Primero lo de todo el día, luego por hora
  return out.sort((a, b) => (a.time ? 1 : 0) - (b.time ? 1 : 0) || a.time.localeCompare(b.time));
}

// --- Un día a pantalla completa ---
function dayFull(d) {
  const items = mItems(d);
  const dt = parse(d);
  const manual = S.db.days[d]?.status || '';
  const st = S.days[d];
  const check = (it) => (it.type === 'goal' || it.type === 'todo' ? `<button class="acheck ${it.done ? 'on' : ''}" data-act="${it.type === 'todo' ? 'rm-toggle' : 'toggle-goal'}" data-id="${it.id}" aria-label="Hecho">${icon('check', 14)}</button>` : '');
  const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
  // Fila como en el Calendario de iOS: hora de inicio y fin a la izquierda, raya de color y título en hasta dos líneas
  const row = (it) => {
    const [a, b] = it.time ? it.time.split('–') : [];
    const live = d === S.today && !it.done && a && minsOf(a) <= nowM && nowM < (b ? minsOf(b) : minsOf(a) + 60);
    return `<div class="arow ${it.done ? 'done' : ''} ${live ? 'now' : ''}" style="--c:${it.color}" data-act="${it.type === 'todo' ? 'rm-goto' : 'swap'}" data-type="${it.type}" data-id="${esc(it.id)}" data-key="df-${esc(it.id)}">
      ${a ? `<div class="atime"><b>${a}</b>${b ? `<span>${b}</span>` : ''}</div>` : ''}<span class="abar"></span>
      <div class="agrow"><div class="at">${it.icon ? icon(it.icon, 14) : ''}<span>${esc(it.title)}</span></div><div class="as">${it.sub}</div></div>${check(it)}</div>`;
  };
  const allDay = items.filter((it) => !it.time), timed = items.filter((it) => it.time);
  return `
    <div class="df-head" data-key="dfh">
      <div class="df-title">${cap1(dt.toLocaleDateString('es-ES', { weekday: 'long' }))}</div>
      <div class="df-mo">${dt.getDate()} de ${MONTHS[dt.getMonth()].toLowerCase()} de ${dt.getFullYear()} · ${rel(diffDays(S.today, d))}</div>
    </div>
    ${allDay.length ? `<div class="df-sec" data-key="dfs1">Todo el día</div><div class="df-list" data-key="dfl1">${allDay.map(row).join('')}</div>` : ''}
    ${timed.length ? `<div class="df-sec" data-key="dfs2">Con hora</div><div class="df-list" data-key="dfl2">${timed.map(row).join('')}</div>` : ''}
    ${items.length ? '' : '<div class="df-empty" data-key="dfe">Día libre 🌿<span>Toca + para añadir algo</span></div>'}
    ${d <= S.today ? `<div class="seg df-st" data-key="dfst">
      <button class="${manual === 'ok' || (!manual && st === 'ok') ? 'on ok' : ''}" data-act="day-status" data-date="${d}" data-s="ok">${icon('check', 15)} Voy al día</button>
      <button class="${manual === 'late' || (!manual && st === 'late') ? 'on late' : ''}" data-act="day-status" data-date="${d}" data-s="late">${icon('clock', 15)} Voy atrasado</button></div>` : ''}`;
}
// Tira de la semana sobre la vista del día (como en el Calendario de iOS): el día elegido va en un círculo
function dayStrip(d) {
  const ws = mondayOf(d);
  return `<div class="ds-week" data-ws="${ws}">${[...Array(7)].map((_, i) => {
    const x = addDays(ws, i);
    return `<button class="ds-d ${x === d ? 'on' : ''} ${x === S.today ? 'today' : ''}" data-act="day-jump" data-date="${x}"><span class="wd">${'LMXJVSD'[i]}</span><span class="dn">${parse(x).getDate()}</span><i class="${mItems(x).length ? 'has' : ''}"></i></button>`;
  }).join('')}</div>`;
}
// Mueve el círculo al día d; si es de otra semana, la tira entera desliza hacia ese lado
function stripTo(d) {
  const box = $('#card .df-strip');
  if (!box) return;
  const cur = $('.ds-week', box);
  if (cur?.dataset.ws === mondayOf(d)) return $$('.ds-d', cur).forEach((b) => b.classList.toggle('on', b.dataset.date === d));
  const dir = cur && cur.dataset.ws < mondayOf(d) ? 1 : -1;
  box.innerHTML = dayStrip(d);
  if (!reduceMotion()) $('.ds-week', box).animate([{ transform: `translate3d(${dir * 40}px,0,0)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: EASE_IOS });
}

// --- Páginas: en el móvil cada vista es una pantalla del historial del navegador ---
// «Atrás» es el del sistema (gesto de Safari, botón o gesto de Android) y el cambio de pantalla lo anima el propio
// navegador con View Transitions: la nueva entra desde la derecha, como en iOS. Ver MOBILE-QUALITY.md.
const EASE_IOS = 'cubic-bezier(0.32, 0.72, 0, 1)';
const ROOT = { k: 'root' };
const nav = { pending: false, depth: 0, n: 0 };
const navCur = () => (history.state?.scr ? history.state : { scr: ROOT, depth: 0 });
const pageOf = (v) => ({ type: v.type, id: v.id, date: v.date, ms: v.ms });
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pageEl = () => $('#card.page.show') || $('#how.open');
const sheetInner = (v) => (v.type === 'day' ? dayFull(v.date) : cardHTML(v));
// Cambio de pantalla. dir: 1 adelante, -1 atrás, 0 sustituir (fundido), null sin animación (p. ej. si el gesto
// de atrás de Safari ya la ha animado)
function transition(dir, update) {
  if (dir === null || reduceMotion() || document.hidden) return update();
  if (!document.startViewTransition) {
    // Sin View Transitions (iOS < 18): la pantalla nueva entra deslizando; al volver, cambio directo
    update();
    if (dir > 0) pageEl()?.animate([{ transform: 'translate3d(100%,0,0)' }, { transform: 'none' }], { duration: 420, easing: EASE_IOS });
    return;
  }
  const root = document.documentElement;
  const n = ++nav.n;
  root.dataset.nav = dir > 0 ? 'push' : dir < 0 ? 'pop' : 'fade';
  document.startViewTransition(update).finished.finally(() => n === nav.n && delete root.dataset.nav);
}
// sync: cambia ya (sin esperar a la transición) para poder enfocar un campo y que iOS abra el teclado
function navTo(scr, { replace = false, sync = false, after } = {}) {
  const cur = navCur();
  history[replace ? 'replaceState' : 'pushState'](replace ? { ...cur, scr } : { scr, depth: cur.depth + 1, prev: cur.scr }, '');
  const update = () => { applyScreen(scr); after?.(); };
  if (!sync) return transition(replace ? 0 : 1, update);
  update();
  if (!replace && !reduceMotion()) pageEl()?.animate([{ transform: 'translate3d(100%,0,0)' }, { transform: 'none' }], { duration: 420, easing: EASE_IOS });
}
function navBack() {
  if (nav.pending) return;
  if (navCur().depth > 0) (nav.pending = true), history.back();
  else transition(-1, () => applyScreen(ROOT));
}
function navRoot() {
  if (nav.pending) return;
  const d = navCur().depth;
  if (d > 0) (nav.pending = true), history.go(-d);
  else transition(-1, () => applyScreen(ROOT));
}
window.addEventListener('popstate', (e) => {
  if (!S?.web) return;
  nav.pending = false;
  const st = navCur();
  transition(e.hasUAVisualTransition ? null : st.depth < nav.depth ? -1 : 1, () => applyScreen(st.scr));
});
// Al arrancar (o recargar con una pantalla abierta) se vuelve a la pantalla del historial
function navInit() {
  if (history.state?.scr && history.state.scr.k !== 'root') applyScreen(history.state.scr);
  else history.replaceState({ scr: ROOT, depth: 0 }, '');
  nav.depth = navCur().depth;
}
// Pinta la pantalla s sin animar (la animación la pone transition)
function applyScreen(s) {
  nav.depth = navCur().depth;
  const card = $('#card');
  const html = s.k === 'card' && sheetInner(s.v);
  if (s.k === 'card' && !html) s = ROOT; // lo que había en esa pantalla ya no existe
  if (s.k === 'card') {
    ui.card = { ...s.v, anchor: null };
    card.removeAttribute('style');
    const day = s.v.type === 'day';
    card.className = 'card show page' + (day ? ' day' : '');
    card.innerHTML = day
      ? `<div class="page-bar">${backBtn()}<button class="ibtn page-add" data-act="day-add" title="Añadir" aria-label="Añadir">${icon('plus', 22)}</button></div><div class="df-strip">${dayStrip(s.v.date)}</div><div class="card-in">${html}</div>`
      : `<div class="page-bar">${backBtn()}</div><div class="card-in">${html}</div>`;
    if (day) prepDays();
    afterCard();
  } else if (ui.card || card.classList.contains('show')) {
    ui.card = null;
    card.className = 'card';
    card.innerHTML = '';
  }
  if (s.k === 'how') {
    const same = ui.how === 'open' && ui.howView === s.view && (s.view !== 'todo' || (ui.rm.list || null) === (s.list || null));
    if (!same && s.view === 'todo') (Object.assign(ui.rm, { list: s.list || null, detail: s.detail || null, draft: null, q: '' }), (ui.colorFor = null));
    howShow(s.view);
    if (!same) $('.how-body').scrollTop = 0;
  } else if (ui.how === 'open') {
    ui.how = 'idle';
    renderHow();
  }
  document.body.classList.toggle('paged', s.k !== 'root');
}
// Botón «‹ Atrás» con el nombre de la pantalla anterior, como en iOS
const rmListLabel = (l) => RM_SMART[l]?.name || (l.startsWith('tag:') ? '#' + l.slice(4) : l.startsWith('proj:') ? proj(l.slice(5)).name : rmListOf(l).name);
function scrLabel(s) {
  if (!s || s.k === 'root') return 'Calendario';
  if (s.k === 'card') return s.v.type === 'day' ? cap1(parse(s.v.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })) : 'Atrás';
  if (s.view === 'todo') return s.list ? rmListLabel(s.list) : 'Recordatorios';
  return { summary: '¿Cómo vas?', organize: 'Organizar', settings: 'Ajustes', ai: 'Claude' }[s.view] || 'Atrás';
}
const backBtn = () => `<button class="page-back" data-back title="Atrás">${icon('chevL', 24)}<span>${esc(scrLabel(navCur().prev))}</span></button>`;
// En la app instalada de iOS no hay gesto de atrás del navegador: deslizar desde el borde izquierdo vuelve atrás
if (navigator.standalone) {
  let eg = null;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    eg = navCur().depth > 0 && e.touches.length === 1 && t.clientX < 18 ? { x: t.clientX, y: t.clientY, dx: 0, dy: 0, tr: tracker(t.clientX, t.clientY) } : null;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!eg) return;
    const t = e.touches[0];
    eg.tr.add(t.clientX, t.clientY);
    [eg.dx, eg.dy] = [t.clientX - eg.x, t.clientY - eg.y];
  }, { passive: true });
  document.addEventListener('touchend', () => {
    const s = eg;
    eg = null;
    if (s && s.dx > 50 && Math.abs(s.dy) < s.dx && (s.dx > 110 || s.tr.v()[0] > 0.3)) (quietClick(), navBack());
  }, { passive: true });
}

// --- Gestos que siguen al dedo ---
// Velocidad (px/ms) de las últimas posiciones
function tracker(x, y) {
  const pts = [[x, y, performance.now()]];
  return {
    add(x, y) { pts.push([x, y, performance.now()]); if (pts.length > 6) pts.shift(); },
    // Solo cuenta el último instante: si el dedo se paró antes de soltar, no hay lanzamiento
    v() {
      const now = performance.now();
      const r = pts.filter((p) => now - p[2] < 100);
      if (r.length < 2) return [0, 0];
      const a = r[0], b = r[r.length - 1], dt = Math.max(1, b[2] - a[2]);
      return [(b[0] - a[0]) / dt, (b[1] - a[1]) / dt];
    },
  };
}
const quietClick = (ms = 80) => { ui.suppressClick = true; setTimeout(() => (ui.suppressClick = false), ms); };
// Inercia: muelle críticamente amortiguado (frena sin rebotar) que arranca con la velocidad del dedo (px/ms).
// Se convierte en fotogramas para WAAPI: corre en el compositor, sin JS por frame.
function springFrames(from, to, v0 = 0, response = 0.42) {
  const w = (2 * Math.PI) / response;
  const A = from - to, B = v0 * 1000 + w * A;
  const out = [];
  for (let t = 0; t < 1.5; t += 1 / 60) {
    const e = Math.exp(-w * t);
    let x = (A + B * t) * e;
    if (A && Math.sign(x) !== Math.sign(A)) x = 0; // nunca se pasa del destino
    out.push(to + x);
    if (t > 0.05 && Math.abs(x) < 0.4 && Math.abs((B - w * (A + B * t)) * e) < 15) break;
  }
  out.push(to);
  return { frames: out, duration: (out.length - 1) * (1000 / 60) };
}
// Mueve varios elementos a la vez (cada uno con su desfase) con el mismo muelle
function glide(els, from, to, v0) {
  const { frames, duration } = springFrames(from, to, v0);
  const anims = els.map(([el, off]) => el.animate(frames.map((x) => ({ transform: `translate3d(${x + off}px,0,0)` })), { duration, easing: 'linear', fill: 'forwards' }));
  els.forEach(([el]) => (el.style.transform = '')); // a partir de aquí manda la animación
  return anims;
}
// ¿Pasar a la siguiente página? Lanzamiento en el mismo sentido, o pasada la tercera parte
function pageDir(dx, vx, w) {
  const dir = dx < 0 ? 1 : -1;
  const fling = Math.abs(vx) > 0.35;
  return (fling ? Math.sign(-vx) === dir : Math.abs(dx) > w * 0.3) ? dir : 0;
}
const PAGE_GAP = 16;
const tx = (x) => `translate3d(${x}px,0,0)`;

// --- El mes, como un carrusel: los meses vecinos ya están al lado mientras arrastras y, al soltar,
// todo sigue con la velocidad del dedo hasta encajar ---
const addMonths = (month, n) => { const m = parse(month); m.setMonth(m.getMonth() + n); return iso(m); };
function withMonth(st, month, fn) {
  const keep = [S, ui.month];
  S = st;
  ui.month = month;
  try { return fn(); } finally { [S, ui.month] = keep; }
}
let car = null; // { dx, w, week, side: { 1, -1: { key, st, el, ready } }, busy }
// Una «página» del carrusel es un mes o, en la vista semanal, una semana (su lunes)
const carKey = (d, week = ui.view === 'week') => (week ? addDays(ui.weekStart, 7 * d) : addMonths(ui.month, d));
function withPage(st, key, week, fn) {
  if (!week) return withMonth(st, key, fn);
  const keep = [S, ui.weekStart, ui.month];
  S = st;
  ui.weekStart = key;
  ui.month = key.slice(0, 8) + '01';
  try { return fn(); } finally { [S, ui.weekStart, ui.month] = keep; }
}
// Hora que se ve arriba de la semana (para que la vecina entre a la misma altura)
function wkTopMin(root) {
  const g = $('.wk-grid', root), b = $('.wk-body', root);
  return g && b ? +g.dataset.h0 + b.scrollTop / +g.dataset.ppm : null;
}
function wkScrollTo(root, min) {
  const g = $('.wk-grid', root), b = $('.wk-body', root);
  if (g && b && min != null) b.scrollTop = (min - +g.dataset.h0) * +g.dataset.ppm;
}
function carSide(c, d, key = carKey(d, c.week)) {
  if (c.side[d]?.key === key) return c.side[d].ready;
  const s = (c.side[d] = { key });
  s.ready = api.state(withPage(S, key, c.week, gridRange)).then((st) => {
    if (c.side[d] !== s || c.done) return null;
    s.st = st;
    s.el = document.createElement('div');
    s.el.className = 'weeks nb' + (c.week ? ' wkview' : '');
    s.el.setAttribute('aria-hidden', 'true');
    s.el.innerHTML = withPage(st, key, c.week, c.week ? weekViewHTML : weeksHTML);
    s.el.style.transform = tx(c.dx + d * (c.w + PAGE_GAP));
    $('#cal').appendChild(s.el);
    if (c.week) wkScrollTo(s.el, wkTopMin($('#weeks')));
    return s;
  });
  return s.ready;
}
function carMove(c) {
  $('#weeks').style.transform = tx(c.dx);
  for (const d of [1, -1]) if (c.side[d]?.el) c.side[d].el.style.transform = tx(c.dx + d * (c.w + PAGE_GAP));
}
async function carRelease(c, go, vx) {
  c.busy = true;
  const side = go ? await carSide(c, go, c.side[go]?.key) : null;
  if (c.grabbed) return;
  if (!side?.el) go = 0;
  const w = c.w + PAGE_GAP;
  const els = [[$('#weeks'), 0], ...[1, -1].filter((d) => c.side[d]?.el).map((d) => [c.side[d].el, d * w])];
  const anims = glide(els, c.dx, go ? -go * w : 0, vx);
  const top = c.week && go ? wkTopMin(side.el) : null;
  Object.assign(c, { anims, go, top, prev: { key: c.week ? ui.weekStart : ui.month, st: S } });
  if (go) {
    if (c.week) (ui.weekStart = side.key), (ui.month = side.key.slice(0, 8) + '01');
    else ui.month = side.key;
    S = side.st;
    renderHead();
    $('#head .month')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }
  try { await anims[0].finished; } catch { return; } // el dedo lo ha vuelto a coger (carGrab sigue desde ahí)
  if (c.grabbed) return;
  if (go) {
    renderCal(go, false); // mismo contenido que el vecino y ya en su sitio: el relevo no se ve
    if (c.week) wkScrollTo($('#weeks'), top);
  }
  anims.forEach((a) => a.cancel());
  c.done = true;
  for (const d of [1, -1]) c.side[d]?.el?.remove();
  if (car === c) car = null;
}
// Coger el carrusel mientras aún se mueve (para encadenar deslizamientos sin esperar): se para donde está
// y, si iba hacia otro mes o semana, ese pasa ya a ser el actual. Devuelve el carrusel nuevo, listo para arrastrar
function carGrab() {
  const c = car;
  if (!c?.anims || c.grabbed) return null; // aún cargando el vecino: no se interrumpe
  const weeks = $('#weeks');
  const x = new DOMMatrix(getComputedStyle(weeks).transform).m41;
  c.grabbed = c.done = true;
  c.anims.forEach((a) => a.cancel());
  const w = c.w + PAGE_GAP;
  const n = { dx: x, w: c.w, week: c.week, side: {} };
  if (c.go) {
    // La página que se iba queda como vecina del otro lado (copia tal cual, sin pedir datos)
    const old = weeks.cloneNode(true);
    old.removeAttribute('id');
    old.className = 'weeks nb' + (c.week ? ' wkview' : '');
    old.setAttribute('aria-hidden', 'true');
    old.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    const oldTop = c.week ? wkTopMin(weeks) : null;
    for (const d of [1, -1]) c.side[d]?.el?.remove();
    $('#cal').appendChild(old);
    if (c.week) wkScrollTo(old, oldTop);
    const s = { key: c.prev.key, st: c.prev.st, el: old };
    s.ready = Promise.resolve(s);
    n.side[-c.go] = s;
    renderCal(c.go, false);
    if (c.week) wkScrollTo(weeks, c.top);
    n.dx = x + c.go * w;
    carSide(n, c.go);
  } else n.side = c.side;
  car = n;
  carMove(n);
  return n;
}
// Flechas y «Hoy»: el mismo carrusel, con un empujón inicial como si lo lanzaras
async function carGo(key, d) {
  if (car) { // encadenar flechas: sigue hacia el siguiente sin esperar a que pare
    const n = carGrab();
    if (n) carRelease(n, key === carKey(d, n.week) ? d : 0, -d * 1.4);
    return;
  }
  const c = (car = { dx: 0, w: $('#cal').clientWidth, week: ui.view === 'week', side: {} });
  await carSide(c, d, key);
  return carRelease(c, d, -d * 1.4);
}
function monthSwipeInit() {
  const cal = $('#cal');
  let g = null;
  cal.addEventListener('touchstart', (e) => {
    if (!S?.web || ui.card || ui.how === 'open' || e.touches.length > 1) return;
    const t = e.touches[0];
    if (car) {
      // Aún se está moviendo: el dedo lo coge donde esté y sigue arrastrando desde ahí
      const n = carGrab();
      if (!n) return;
      clearTimeout(press);
      g = { x: t.clientX - n.dx, y: t.clientY, on: true, c: n, tr: tracker(t.clientX, t.clientY) };
      return;
    }
    g = { x: t.clientX, y: t.clientY, on: false, tr: tracker(t.clientX, t.clientY) };
  }, { passive: true });
  // Pasivo: el mes tiene touch-action: none y la semana pan-y (el scroll vertical de las horas es del navegador)
  cal.addEventListener('touchmove', (e) => {
    if (!g) return;
    if (pdrag) return (g = null); // arrastrando una barra
    if (e.touches.length > 1) { // segundo dedo: es un pellizco, el carrusel vuelve a su sitio
      const s = g;
      g = null;
      if (s.on) carRelease(s.c, 0, 0);
      return;
    }
    const t = e.touches[0];
    const dx = t.clientX - g.x, dy = t.clientY - g.y;
    g.tr.add(t.clientX, t.clientY);
    if (!g.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) { if (Math.abs(dy) > 12) g = null; return; }
      g.on = true;
      g.x = t.clientX; // arranca desde donde está el dedo, sin salto
      clearTimeout(press);
      clearTimeout(holdT);
      g.c = car = { dx: 0, w: cal.clientWidth, week: ui.view === 'week', side: {} };
      carSide(g.c, 1);
      carSide(g.c, -1);
    }
    g.c.dx = t.clientX - g.x;
    carMove(g.c);
  }, { passive: true });
  const end = () => {
    const s = g;
    g = null;
    if (!s?.on) return;
    quietClick();
    carRelease(s.c, pageDir(s.c.dx, s.tr.v()[0], s.c.w), s.tr.v()[0]);
  };
  cal.addEventListener('touchend', end, { passive: true });
  cal.addEventListener('touchcancel', end, { passive: true });
  wkPinchInit(cal);
}
// Semana: pellizcar cambia el alto de las horas; lo que queda entre los dedos se queda bajo los dedos
function wkPinchInit(cal) {
  let p = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const midY = (t) => (t[0].clientY + t[1].clientY) / 2;
  cal.addEventListener('touchstart', (e) => {
    if (ui.view !== 'week' || e.touches.length !== 2 || ui.card) return;
    const grid = $('#weeks .wk-grid'), body = $('#weeks .wk-body');
    if (!grid || !body) return;
    clearTimeout(press);
    const ppm = +grid.dataset.ppm, top = body.getBoundingClientRect().top;
    p = { d0: dist(e.touches), z0: wkZoom(), z: wkZoom(), fit: ppm / wkZoom(), grid, body, top, at: (body.scrollTop + midY(e.touches) - top) / ppm };
  }, { passive: true });
  // No pasivo solo aquí, y solo actúa con dos dedos: que el navegador no desplace mientras pellizcas
  cal.addEventListener('touchmove', (e) => {
    if (!p || e.touches.length !== 2) return;
    e.preventDefault();
    wkZoomTo(p, (p.z0 * dist(e.touches)) / p.d0, midY(e.touches));
  }, { passive: false });
  const end = (e) => {
    if (!p || e.touches.length >= 2) return;
    const z = p.z;
    p = null;
    quietClick(250);
    wkZoomSave(z);
  };
  cal.addEventListener('touchend', end, { passive: true });
  cal.addEventListener('touchcancel', end, { passive: true });
  cal.addEventListener('gesturestart', (e) => e.preventDefault()); // Safari: que no amplíe la página
  // En el PC: Ctrl + rueda (o pellizcar en el touchpad) sobre las horas
  let wz = null, wzT;
  cal.addEventListener('wheel', (e) => {
    if (ui.view !== 'week' || !e.ctrlKey || !e.target.closest('.wk-body')) return;
    e.preventDefault();
    const grid = $('#weeks .wk-grid'), body = $('#weeks .wk-body');
    if (!wz) {
      const ppm = +grid.dataset.ppm, top = body.getBoundingClientRect().top;
      wz = { z: wkZoom(), fit: ppm / wkZoom(), grid, body, top, at: (body.scrollTop + e.clientY - top) / ppm };
    }
    wkZoomTo(wz, wz.z * Math.exp(-e.deltaY * 0.004), e.clientY);
    clearTimeout(wzT);
    wzT = setTimeout(() => { const z = wz.z; wz = null; wkZoomSave(z); }, 220);
  }, { passive: false });
}
function wkZoomTo(p, z, y) {
  p.z = Math.min(4, Math.max(1, z));
  const ppm = p.fit * p.z;
  p.grid.style.setProperty('--ppm', ppm);
  p.grid.dataset.ppm = ppm;
  p.body.scrollTop = p.at * ppm - (y - p.top);
}
function wkZoomSave(z) {
  if (Math.abs(z - wkZoom()) < 0.001) return;
  ui.wkZoom = z;
  try { localStorage.setItem('wkZoom', z.toFixed(3)); } catch {}
  const body = $('#weeks .wk-body'), keep = body?.scrollTop;
  renderCal(); // recoloca lo fino (una línea) o lo alto según el nuevo tamaño
  if (body) body.scrollTop = keep;
}

// --- Vista de un día: a los lados, el día anterior y el siguiente (mismo carrusel) ---
// Los días vecinos se pintan de antemano (fuera de la pantalla), así el arrastre empieza sin esperar a nada
let dcar = null;
const dayMain = () => $('#card .card-in:not(.nb)');
function dayNeighbor(c, d, date = addDays(ui.card.date, d)) {
  const inner = dayMain();
  let el = $(`#card .card-in.nb[data-side="${d}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'card-in nb';
    el.dataset.side = d;
    el.setAttribute('aria-hidden', 'true');
    $('#card').appendChild(el);
  }
  Object.assign(el.style, { position: 'absolute', left: '0', top: inner.offsetTop + 'px', width: inner.offsetWidth + 'px', height: inner.offsetHeight + 'px', overflow: 'hidden', transform: tx(c.dx + d * (c.w + PAGE_GAP)) });
  if (el.dataset.date !== date) {
    el.innerHTML = dayFull(date);
    el.dataset.date = date;
    el.scrollTop = 0;
  }
  c.side[d] = el;
}
function prepDays() {
  clearTimeout(prepDays.t);
  prepDays.t = setTimeout(() => {
    if (!S?.web || ui.card?.type !== 'day' || dcar || !dayMain()) return;
    const c = { dx: 0, w: $('#card').clientWidth, side: {} };
    dayNeighbor(c, 1);
    dayNeighbor(c, -1);
  }, 450); // cuando la pantalla ya ha entrado
}
async function dayRelease(c, go, vx, date) {
  c.busy = true;
  const inner = dayMain();
  const w = c.w + PAGE_GAP;
  const to = go && (date || addDays(ui.card.date, go));
  if (go) stripTo(to); // el círculo de la tira se mueve ya, mientras desliza el día
  const anims = glide([[inner, 0], [c.side[1], w], [c.side[-1], -w]], c.dx, go ? -go * w : 0, vx);
  Object.assign(c, { anims, go, to });
  try { await anims[0].finished; } catch { return; } // el dedo lo ha vuelto a coger (dayGrab sigue desde ahí)
  if (c.grabbed) return;
  dayCommit(c, go, to);
  for (const d of [1, -1]) c.side[d].style.transform = tx(d * w);
  inner.style.transform = '';
  anims.forEach((a) => a.cancel());
  if (dcar === c) dcar = null;
  prepDays();
}
// El día al que se iba pasa a ser el de pantalla. Los nodos se mueven tal cual (sin volver a pintar): el vecino
// que ha entrado pasa a ser el día en pantalla y el que estaba queda al otro lado (prepDays repinta lo que no encaje)
function dayCommit(c, go, to) {
  if (!go || ui.card?.type !== 'day') return;
  const inner = dayMain();
  const from = ui.card.date;
  ui.card = { ...ui.card, date: to };
  history.replaceState({ ...navCur(), scr: { k: 'card', v: pageOf(ui.card) } }, '');
  const inc = c.side[go], back = c.side[-go];
  const old = [...inner.childNodes];
  inner.replaceChildren(...inc.childNodes);
  back.replaceChildren(...old);
  back.dataset.date = from;
  inc.dataset.date = '';
  inner.scrollTop = 0;
}
// Coger el día mientras aún se desliza (para encadenar sin esperar): se para donde está y, si iba hacia otro día,
// ese pasa ya a ser el de pantalla. Devuelve el carrusel nuevo, listo para arrastrar
function dayGrab() {
  const c = dcar;
  if (!c?.anims || c.grabbed) return null;
  const x = new DOMMatrix(getComputedStyle(dayMain()).transform).m41;
  c.grabbed = true;
  c.anims.forEach((a) => a.cancel());
  const n = (dcar = { dx: x, w: c.w, side: {} });
  if (c.go) {
    dayCommit(c, c.go, c.to);
    n.dx = x + c.go * (c.w + PAGE_GAP);
  }
  dayNeighbor(n, 1);
  dayNeighbor(n, -1);
  dayMain().style.transform = tx(n.dx);
  return n;
}
// Cambiar de día con botones, con el teclado o tocando la tira (n puede ser más de un día)
function stepDay(n, date) {
  if (ui.card?.type !== 'day' || !n) return;
  const go = Math.sign(n);
  if (dcar) {
    const c = dayGrab(); // encadenar: sigue sin esperar a que pare el anterior
    if (!c) return;
    if (date) dayNeighbor(c, go, date);
    return dayRelease(c, go, -go * 1.4, date);
  }
  const c = (dcar = { dx: 0, w: $('#card').clientWidth, side: {} });
  dayNeighbor(c, 1, go === 1 ? date || addDays(ui.card.date, 1) : undefined);
  dayNeighbor(c, -1, go === -1 ? date || addDays(ui.card.date, -1) : undefined);
  dayRelease(c, go, -go * 1.4, date);
}
(() => {
  const card = $('#card');
  let g = null;
  card.addEventListener('touchstart', (e) => {
    if (!S?.web || ui.card?.type !== 'day' || e.touches.length > 1 || e.target.closest('input, textarea, select')) return;
    const t = e.touches[0];
    if (navigator.standalone && t.clientX < 18) return; // es el gesto de atrás
    if (dcar) {
      // Aún se está deslizando: el dedo lo coge donde esté y sigue arrastrando desde ahí
      const n = !e.target.closest('.df-strip') && dayGrab();
      if (!n) return;
      clearTimeout(press);
      g = { x: t.clientX - n.dx, y: t.clientY, on: true, c: n, tr: tracker(t.clientX, t.clientY) };
      return;
    }
    g = { x: t.clientX, y: t.clientY, on: false, tr: tracker(t.clientX, t.clientY), strip: !!e.target.closest('.df-strip') };
  }, { passive: true });
  // Pasivo: el contenido tiene touch-action: pan-y (el scroll vertical es nativo y el horizontal es nuestro)
  card.addEventListener('touchmove', (e) => {
    if (!g) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x, dy = t.clientY - g.y;
    g.tr.add(t.clientX, t.clientY);
    if (g.strip) return void (g.dx = dx, g.dy = dy); // la tira cambia de semana al soltar
    if (!g.on) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) { if (Math.abs(dy) > 12) g = null; return; }
      g.on = true;
      g.x = t.clientX; // sin salto al engancharse: arranca desde donde está el dedo
      clearTimeout(press);
      clearTimeout(prepDays.t);
      g.c = dcar = { dx: 0, w: card.clientWidth, side: {} };
      dayNeighbor(g.c, 1);
      dayNeighbor(g.c, -1);
    }
    const c = g.c;
    c.dx = t.clientX - g.x;
    dayMain().style.transform = tx(c.dx);
    c.side[1].style.transform = tx(c.dx + c.w + PAGE_GAP);
    c.side[-1].style.transform = tx(c.dx - c.w - PAGE_GAP);
  }, { passive: true });
  const end = () => {
    const s = g;
    g = null;
    if (s?.strip) {
      if (Math.abs(s.dx || 0) > 40 && Math.abs(s.dx) > Math.abs(s.dy) * 1.5) (quietClick(), stepDay(-Math.sign(s.dx) * 7, addDays(ui.card.date, -Math.sign(s.dx) * 7)));
      return;
    }
    if (!s?.on) return;
    quietClick();
    const [vx] = s.tr.v();
    dayRelease(s.c, pageDir(s.c.dx, vx, s.c.w), vx);
  };
  card.addEventListener('touchend', end, { passive: true });
  card.addEventListener('touchcancel', end, { passive: true });
})();

// ================= Recordatorios: el //TODO general, estilo iPhone, con sangría sin límite =================
const RM_SMART = {
  today: { name: 'Hoy', color: '#0a84ff', icon: 'cal' },
  scheduled: { name: 'Programados', color: '#ff453a', icon: 'clock' },
  all: { name: 'Todos', color: '#8e8e93', icon: 'tray' },
  flagged: { name: 'Con bandera', color: '#ff9f0a', icon: 'flag' },
  done: { name: 'Completados', color: '#8e8e93', icon: 'check' },
};
const INBOX = { id: 'inbox', name: 'Recordatorios', color: '#d97757' };
ui.rm = { list: null, showDone: false, detail: null, draft: null, q: '', lock: false };
const rmRecent = new Set(); // recién marcados: se quedan un momento antes de esconderse
const rmAll = () => S.db.todos || [];
const rmKids = (pid, listId) => rmAll().filter((t) => (t.parentId || null) === (pid || null) && (pid ? true : (t.listId || null) === (listId || null))).sort((a, b) => a.order - b.order);
const rmDesc = (id) => rmAll().filter((t) => t.parentId === id).flatMap((t) => [t, ...rmDesc(t.id)]);
const rmListOf = (id) => (!id || id === 'inbox' ? INBOX : byId(S.db.todoLists || [], id) || INBOX);
const rmColor = (t) => rmListOf(t.listId).color;
const rmCount = () => S.todo || { today: 0, scheduled: 0, all: 0, flagged: 0, done: 0, lists: {}, tags: {} };
const rmCurList = () => (ui.rm.list && !RM_SMART[ui.rm.list] && !ui.rm.list.startsWith('tag:') ? ui.rm.list : null);

function rmDue(t) {
  if (!t.due) return '';
  const n = diffDays(S.today, t.due);
  const day = n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : n === -1 ? 'Ayer' : n > 1 && n < 7 ? cap1(parse(t.due).toLocaleDateString('es-ES', { weekday: 'long' })) : fmtShort(t.due);
  return `<span class="${n < 0 && !t.done ? 'late' : ''}">${day}${t.time ? ', ' + t.time : ''}</span>`;
}
function rmRow(t, depth, flat = false) {
  const kids = rmAll().some((k) => k.parentId === t.id);
  const desc = kids ? rmDesc(t.id) : [];
  const meta = [
    rmDue(t),
    flat ? esc(rmListOf(t.listId).name) + (t.parentId ? ' › ' + esc(byId(rmAll(), t.parentId)?.title || '') : '') : '',
    (t.tags || []).map((g) => `<span class="tag">#${esc(g)}</span>`).join(' '),
    t.projectId ? `<span class="rm-proj" style="--p:${proj(t.projectId).color}">${projLabel(t.projectId, t.categoryId)}</span>` : '',
    desc.length && (flat || t.collapsed) ? `${desc.filter((k) => k.done).length}/${desc.length} subapartados` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="rm-row ${t.done ? 'done' : ''} ${ui.rm.detail === t.id ? 'open' : ''}" data-key="td-${t.id}" data-id="${t.id}" data-depth="${depth}" style="--d:${depth};--c:${rmColor(t)}">
    ${kids && !flat ? `<button class="rm-fold ${t.collapsed ? '' : 'on'}" data-act="rm-fold" data-id="${t.id}" title="${t.collapsed ? 'Desplegar' : 'Plegar'}">${icon('chevR', 13)}</button>` : '<span class="rm-fold"></span>'}
    <button class="rm-check" data-act="rm-check" data-id="${t.id}" aria-label="Hecho"><i></i></button>
    <div class="rm-main">
      <div class="rm-line">${t.priority ? `<span class="rm-pri">${'!'.repeat(t.priority)}</span>` : ''}<textarea class="rm-t" data-id="${t.id}" rows="1" spellcheck="false" enterkeyhint="next">${esc(t.title)}</textarea></div>
      ${t.notes ? `<div class="rm-notes">${esc(t.notes)}</div>` : ''}
      ${meta ? `<div class="rm-meta">${meta}</div>` : ''}
    </div>
    ${t.flagged ? `<span class="rm-flag">${icon('flag', 14)}</span>` : ''}
    <button class="rm-info" data-act="rm-detail" data-id="${t.id}" title="Detalles">${icon('info', 18)}</button>
    <button class="rm-swdel" data-act="rm-del" data-id="${t.id}">Borrar</button>
  </div>${ui.rm.detail === t.id ? rmDetail(t, depth) : ''}`;
}
const rmDraftRow = (depth, color) => `<div class="rm-row draft" data-key="td-draft" style="--d:${depth};--c:${color}"><span class="rm-fold"></span><span class="rm-check"><i></i></span>
  <div class="rm-main"><div class="rm-line"><textarea class="rm-t" data-draft="1" rows="1" spellcheck="false" enterkeyhint="next"></textarea></div></div></div>`;

function rmDetail(t, depth) {
  const lists = [INBOX, ...(S.db.todoLists || [])];
  const opt = (v, l, sel) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
  return `<div class="rm-detail" data-key="tdd-${t.id}" style="--d:${depth}">
    <textarea class="input rm-notes-in" data-rm-field="notes" data-id="${t.id}" rows="2" placeholder="Notas">${esc(t.notes || '')}</textarea>
    <div class="rm-drow">${icon('cal', 15)}<input type="date" class="input" data-rm-field="due" data-id="${t.id}" value="${t.due || ''}"><input type="time" class="input" data-rm-field="time" data-id="${t.id}" value="${t.time || ''}" style="flex:0 0 96px"></div>
    <div class="rm-quick">${[['0', 'Hoy'], ['1', 'Mañana'], ['7', 'En una semana'], ['', 'Sin fecha']].map(([v, l]) => `<button data-act="rm-due" data-id="${t.id}" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="rm-drow"><span>Prioridad</span><div class="seg">${['Ninguna', '!', '!!', '!!!'].map((l, i) => `<button type="button" class="${(t.priority || 0) === i ? 'on' : ''}" data-act="rm-pri" data-id="${t.id}" data-v="${i}">${l}</button>`).join('')}</div>
      <button class="btn ${t.flagged ? 'flag-on' : ''}" data-act="rm-flag" data-id="${t.id}" style="margin-left:auto">${icon('flag', 13)} Bandera</button></div>
    <label class="rm-drow"><span>Lista</span><select class="input" data-rm-field="listId" data-id="${t.id}">${lists.map((l) => opt(l.id, l.name, t.listId || 'inbox')).join('')}</select></label>
    <label class="rm-drow"><span>Proyecto</span><select class="input" data-rm-field="projectId" data-id="${t.id}">${opt('', '—', t.projectId || '')}${S.db.projects.filter((p) => !p.archived).map((p) => opt(p.id, p.name, t.projectId)).join('')}</select></label>
    ${t.projectId && (byId(S.db.projects, t.projectId)?.categories || []).length ? `<label class="rm-drow"><span>Subcategoría</span><select class="input" data-rm-field="categoryId" data-id="${t.id}">${catOptions(t.projectId, t.categoryId)}</select></label>` : ''}
    <label class="rm-drow"><span>Etiquetas</span><input class="input" data-rm-field="tags" data-id="${t.id}" value="${esc((t.tags || []).join(', '))}" placeholder="casa, urgente (o #etiqueta en el título)"></label>
    <div class="rm-dfoot"><button class="btn" data-act="rm-indent" data-id="${t.id}" data-out="1" title="Quitar sangría (Mayús+Tab)">${icon('outdent', 14)}</button><button class="btn" data-act="rm-indent" data-id="${t.id}" title="Sangrar (Tab)">${icon('indent', 14)}</button>
      <button class="btn danger" data-act="rm-del" data-id="${t.id}">${icon('trash', 13)} Borrar</button><button class="btn primary" data-act="rm-detail" data-id="${t.id}" style="margin-left:auto">Hecho</button></div>
  </div>`;
}

// Árbol de una lista, aplanado en filas con su profundidad (con el borrador donde toque)
function rmFlat(listId, withDraft = true) {
  const out = [];
  const d = withDraft ? ui.rm.draft : null;
  const vis = (t) => ui.rm.showDone || !t.done || rmRecent.has(t.id);
  const walk = (pid, depth) => {
    if (d && (d.parentId || null) === (pid || null) && d.afterId === null) out.push({ draft: true, depth });
    for (const t of rmKids(pid, listId)) {
      if (vis(t)) {
        out.push({ t, depth });
        if (!t.collapsed) walk(t.id, depth + 1);
      }
      if (d && d.afterId === t.id) out.push({ draft: true, depth });
    }
    if (d && (d.parentId || null) === (pid || null) && d.afterId === 'end') out.push({ draft: true, depth });
  };
  walk(null, 0);
  return out;
}
function rmSmartItems(view) {
  const open = rmAll().filter((t) => !t.done || rmRecent.has(t.id));
  const q = ui.rm.q.trim().toLowerCase();
  if (q) return rmAll().filter((t) => (ui.rm.showDone || !t.done) && [t.title, t.notes, ...(t.tags || [])].join(' ').toLowerCase().includes(q));
  if (view === 'done') return rmAll().filter((t) => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const f = view === 'today' ? (t) => t.due && t.due <= S.today : view === 'scheduled' ? (t) => t.due : view === 'flagged' ? (t) => t.flagged : view.startsWith('tag:') ? (t) => (t.tags || []).includes(view.slice(4)) : () => true;
  return open.filter(f).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || a.order - b.order);
}

function rmHome() {
  const c = rmCount();
  const lists = [INBOX, ...(S.db.todoLists || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))];
  const tags = Object.keys(c.tags || {}).sort();
  const projs = S.db.projects.filter((p) => rmAll().some((t) => t.projectId === p.id && !t.done));
  return `
    <div class="rm-top" data-key="rmtop">${S.web ? backBtn() : `<button class="rm-back" data-act="how-view" data-v="summary">${icon('chevL', 18)}<span>¿Cómo vas?</span></button>`}<button class="ibtn" data-act="how-close" title="Cerrar">${icon('x', 16)}</button></div>
    <div class="rm-big" data-key="rmbig">Recordatorios</div>
    <label class="rm-search" data-key="rmsearch">${icon('search', 15)}<input data-rm-search placeholder="Buscar" value="${esc(ui.rm.q)}" enterkeyhint="search"></label>
    ${ui.rm.q.trim() ? `<div class="rm-rows" data-key="rmres">${rmSmartItems('all').map((t) => rmRow(t, 0, true)).join('') || '<div class="hint" style="padding:10px 4px">Nada coincide.</div>'}</div>` : `
    <div class="rm-tiles" data-key="rmtiles">${Object.entries(RM_SMART).map(([k, v]) => `<button class="rm-tile ${k === 'done' ? 'wide' : ''}" data-act="rm-open" data-l="${k}" style="--c:${v.color}"><span class="rm-ic">${icon(v.icon, 16)}</span>${k === 'done' ? '' : `<b>${c[k] || 0}</b>`}<span class="l">${v.name}</span></button>`).join('')}</div>
    <div class="rm-h" data-key="rmh-lists">Mis listas</div>
    <div class="rm-group" data-key="rmlists">${lists.map((l) => `<button class="rm-lrow" data-act="rm-open" data-l="${l.id}" data-key="rml-${l.id}" style="--c:${l.color}"><span class="rm-ic">${icon('list', 15)}</span><span class="grow">${esc(l.name)}</span><span class="n">${(c.lists || {})[l.id] || 0}</span>${icon('chevR', 15)}</button>`).join('')}
      <input class="inline-add rm-addlist" data-add="todo-list" data-key="addtdl" placeholder="Añadir lista  ↵"></div>
    ${projs.length ? `<div class="rm-h" data-key="rmh-proj">Por proyecto</div><div class="rm-group" data-key="rmprojs">${projs.map((p) => `<button class="rm-lrow" data-act="rm-open" data-l="proj:${p.id}" data-key="rmp-${p.id}" style="--c:${p.color}"><span class="rm-ic">${icon('folder', 14)}</span><span class="grow">${esc(p.name)}</span><span class="n">${rmAll().filter((t) => t.projectId === p.id && !t.done).length}</span>${icon('chevR', 15)}</button>`).join('')}</div>` : ''}
    ${tags.length ? `<div class="rm-h" data-key="rmh-tags">Etiquetas</div><div class="rm-tags" data-key="rmtags">${tags.map((g) => `<button class="rm-tag" data-act="rm-open" data-l="tag:${esc(g)}">#${esc(g)}</button>`).join('')}</div>` : ''}`}`;
}

function rmListView() {
  const id = ui.rm.list;
  const smart = RM_SMART[id];
  const isTag = id.startsWith('tag:');
  const isProj = id.startsWith('proj:');
  const list = smart ? { name: smart.name, color: smart.color } : isTag ? { name: '#' + id.slice(4), color: '#8e8e93' } : isProj ? { name: proj(id.slice(5)).name, color: proj(id.slice(5)).color } : rmListOf(id);
  const real = !smart && !isTag && !isProj;
  let rows = '';
  let count = 0;
  if (real) {
    const flat = rmFlat(id === 'inbox' ? null : id);
    count = rmAll().filter((t) => (t.listId || 'inbox') === id && !t.done).length;
    rows = flat.map((r) => (r.draft ? rmDraftRow(r.depth, list.color) : rmRow(r.t, r.depth))).join('');
  } else if (id === 'all') {
    const lists = [INBOX, ...(S.db.todoLists || [])];
    count = rmCount().all;
    rows = lists.map((l) => {
      const flat = rmFlat(l.id === 'inbox' ? null : l.id, false);
      return flat.length ? `<div class="rm-group-h" data-key="rgh-${l.id}" style="--c:${l.color}">${esc(l.name)}</div>${flat.map((r) => rmRow(r.t, r.depth)).join('')}` : '';
    }).join('');
    if (ui.rm.draft) rows += rmDraftRow(0, INBOX.color);
  } else {
    const items = isProj ? rmAll().filter((t) => t.projectId === id.slice(5) && (!t.done || rmRecent.has(t.id) || ui.rm.showDone)) : rmSmartItems(id);
    count = items.filter((t) => !t.done).length;
    if (id === 'scheduled' || id === 'today') {
      let last = null;
      for (const t of items) {
        const g = id === 'today' ? (t.due < S.today ? 'Atrasados' : 'Hoy') : t.due < S.today ? 'Atrasados' : rel(diffDays(S.today, t.due)) === 'Mañana' || t.due === S.today ? rel(diffDays(S.today, t.due)) : fmtLong(t.due);
        if (g !== last) rows += `<div class="rm-group-h ${g === 'Atrasados' ? 'late' : ''}" data-key="rgh-${esc(g)}">${g}</div>`;
        last = g;
        rows += rmRow(t, 0, true);
      }
    } else rows = items.map((t) => rmRow(t, 0, true)).join('');
    if (ui.rm.draft) rows += rmDraftRow(0, list.color);
  }
  const doneN = real ? rmAll().filter((t) => (t.listId || 'inbox') === id && t.done).length : 0;
  return `
    <div class="rm-top" data-key="rmtop">${S.web ? backBtn() : `<button class="rm-back" data-act="rm-open" data-l="">${icon('chevL', 18)}<span>Listas</span></button>`}
      <div style="display:flex;gap:2px">${real && id !== 'inbox' ? `<button class="ibtn" data-act="rm-list-menu" data-id="${id}" title="Lista">${icon('more', 16)}</button>` : ''}<button class="ibtn" data-act="how-close" title="Cerrar">${icon('x', 16)}</button></div></div>
    <div class="rm-title" data-key="rmtitle" style="--c:${list.color}">${real && id !== 'inbox' ? `<input class="rm-title-in" data-rm-listname="${id}" value="${esc(list.name)}">` : `<span>${esc(list.name)}</span>`}<span class="n">${count || ''}</span></div>
    ${real && ui.colorFor === id ? paletteRow(id, list.color, 'todoList') : ''}
    ${real && doneN ? `<div class="rm-sub" data-key="rmsub"><span>${doneN} completado${doneN > 1 ? 's' : ''}</span><button class="lnk" data-act="rm-showdone">${ui.rm.showDone ? 'Ocultar' : 'Mostrar'}</button></div>` : ''}
    <div class="rm-rows" data-key="rmrows" style="--c:${list.color}">${rows || (id === 'done' ? '<div class="hint" style="padding:14px 4px">Aún no has completado nada.</div>' : '')}</div>
    ${id === 'done' ? '' : `<button class="rm-new" data-act="rm-new" data-key="rmnew" style="--c:${list.color}"><span class="pl">${icon('plus', 14)}</span>Nuevo recordatorio</button>`}
    ${!rows && id !== 'done' && !ui.rm.draft ? `<div class="rm-empty" data-key="rmempty">${real ? 'Sin recordatorios. Pulsa «Nuevo recordatorio» y ve escribiendo: Intro crea otro, Tab lo mete dentro del de arriba.' : 'Nada por aquí.'}</div>` : ''}`;
}
function howTodo() {
  return `<div class="rm">${ui.rm.list ? rmListView() : rmHome()}</div>`;
}
// Fila del resumen / tarjeta del día (sin editar)
const todoRow = (t) => `
  <div class="task ${t.done ? 'done' : ''}" style="--c:${rmColor(t)}" data-act="rm-toggle" data-id="${t.id}">
    <span class="check" style="border-radius:50%">${icon('check', 12)}</span>
    <span class="tt"><span class="tx">${esc(t.title)}</span><span class="from">${esc(rmListOf(t.listId).name)}${t.due && t.due !== S.today ? ' · ' + rel(diffDays(S.today, t.due)).toLowerCase() : ''}${t.time ? ' · ' + t.time : ''}</span></span>
  </div>`;

// --- edición en línea ---
function rmFit(root = document) {
  if (CSS.supports?.('field-sizing', 'content')) return;
  $$('.rm-t', root).forEach((el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; });
}
function rmFocus(el, atEnd = true) {
  if (!el) return;
  el.focus({ preventScroll: false });
  const n = atEnd ? el.value.length : 0;
  el.setSelectionRange?.(n, n);
  el.scrollIntoView({ block: 'nearest' });
}
function rmRender(focus) {
  ui.rm.lock = true;
  renderHow(true);
  if (focus) rmFocus(typeof focus === 'string' ? $(focus) : focus);
  ui.rm.lock = false;
}
async function rmReload(focus) {
  S = await api.state(gridRange());
  render();
  rmRender(focus);
}
const draftListId = () => { const l = rmCurList(); return l && l !== 'inbox' ? l : null; };
function draftPreset() {
  const l = ui.rm.list;
  if (l === 'today' || l === 'scheduled') return { due: S.today };
  if (l === 'flagged') return { flagged: true };
  if (l?.startsWith('tag:')) return { tags: [l.slice(4)] };
  if (l?.startsWith('proj:')) return { projectId: l.slice(5) };
  return {};
}
// Guarda lo escrito en una fila (o crea el recordatorio si era el borrador). Devuelve el id creado.
async function rmCommit(el) {
  const v = el.value.replace(/\s*\n\s*/g, ' ').trim();
  if (el.dataset.draft) {
    const d = ui.rm.draft;
    if (!v || !d) return null;
    el.value = '';
    const out = await run('add_todos', { listId: d.listId ?? draftListId(), parentId: d.parentId || undefined, afterId: d.afterId === 'end' ? undefined : d.afterId, items: [{ title: v, ...draftPreset(), ...(d.preset || {}) }] });
    const id = out.created[0]?.id;
    if (ui.rm.draft === d && id) ui.rm.draft = { ...d, afterId: id };
    return id;
  }
  const t = byId(rmAll(), el.dataset.id);
  if (!t) return null;
  if (!v) {
    if (!rmAll().some((k) => k.parentId === t.id)) await run('delete_item', { type: 'todo', id: t.id });
    else el.value = t.title;
    return null;
  }
  if (v !== t.title) await run('update_todo', { id: t.id, title: v });
  return null;
}
const rowOf = (el) => el.closest('.rm-row');
const prevSibId = (t) => { const s = rmKids(t.parentId, t.listId); return s[s.findIndex((x) => x.id === t.id) - 1]?.id; };
async function rmIndent(el, out) {
  if (el.dataset.draft) {
    const d = ui.rm.draft;
    if (!d) return;
    if (out) {
      if (!d.parentId) return;
      const p = byId(rmAll(), d.parentId);
      ui.rm.draft = { ...d, parentId: p?.parentId || null, afterId: d.parentId };
    } else {
      const sibs = rmKids(d.parentId, d.listId ?? draftListId());
      const above = d.afterId === 'end' ? sibs[sibs.length - 1]?.id : d.afterId;
      if (!above) return;
      ui.rm.draft = { ...d, parentId: above, afterId: 'end' };
      const a = byId(rmAll(), above);
      if (a?.collapsed) await run('update_todo', { id: above, collapsed: false });
    }
    navigator.vibrate?.(8);
    return rmReload(el);
  }
  const t = byId(rmAll(), el.dataset.id);
  if (!t) return;
  await rmCommit(el);
  try {
    await run('indent_todo', { id: t.id, outdent: !!out });
    navigator.vibrate?.(8);
  } catch {}
  await rmReload(`.rm-t[data-id="${t.id}"]`);
}
// El borrador se pone justo debajo de la fila (o al final de la lista)
function rmStartDraft(afterRow) {
  const t = afterRow && byId(rmAll(), afterRow.dataset.id);
  const listId = t ? t.listId || null : draftListId();
  ui.rm.draft = t ? { parentId: t.parentId || null, afterId: t.id, listId } : { parentId: null, afterId: 'end', listId };
  rmRender('[data-key="td-draft"] .rm-t');
}

document.addEventListener('keydown', async (e) => {
  const el = e.target;
  if (!el.matches?.('.rm-t')) {
    if (e.target.matches?.('[data-rm-search]') && e.key === 'Escape') { el.value = ''; ui.rm.q = ''; renderHow(true); }
    return;
  }
  const row = rowOf(el);
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (el.dataset.draft) {
      if (!el.value.trim()) return el.blur(); // Intro en una línea vacía: terminar
      await rmCommit(el);
      return rmReload(el);
    }
    const commit = rmCommit(el);
    rmStartDraft(row); // sin esperar: el teclado del móvil no se cierra
    await commit;
    return rmReload();
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    return rmIndent(el, e.shiftKey);
  }
  if (e.key === 'Escape') {
    e.stopPropagation();
    return el.blur();
  }
  if (e.key === 'Backspace' && !el.value && el.selectionStart === 0) {
    e.preventDefault();
    const rows = $$('.how-body .rm-t');
    const prev = rows[rows.indexOf(el) - 1];
    if (el.dataset.draft) {
      ui.rm.draft = null;
      return rmRender(prev);
    }
    const t = byId(rmAll(), el.dataset.id);
    if (t && !rmAll().some((k) => k.parentId === t.id)) {
      ui.rm.lock = true;
      rmFocus(prev);
      ui.rm.lock = false;
      await run('delete_item', { type: 'todo', id: t.id });
      return rmReload();
    }
  }
  if ((e.key === 'ArrowUp' && el.selectionStart === 0) || (e.key === 'ArrowDown' && el.selectionEnd === el.value.length)) {
    const rows = $$('.how-body .rm-t');
    const next = rows[rows.indexOf(el) + (e.key === 'ArrowUp' ? -1 : 1)];
    if (next) { e.preventDefault(); rmFocus(next, e.key === 'ArrowDown' ? false : true); }
  }
}, true);
document.addEventListener('input', (e) => {
  if (e.target.matches?.('.rm-t')) rmFit(e.target.parentNode);
  if (e.target.matches?.('[data-rm-search]')) {
    ui.rm.q = e.target.value;
    renderHow(true);
  }
  if (e.target.matches?.('[data-ai-text]')) ui.aiDraft = e.target.value;
});
document.addEventListener('focusin', (e) => {
  if (e.target.matches?.('.rm-t')) $('#how').classList.add('rm-editing');
});
document.addEventListener('focusout', (e) => {
  const el = e.target;
  if (!el.matches?.('.rm-t') || ui.rm.lock) return;
  setTimeout(async () => {
    if (document.activeElement === el || ui.rm.lock) return;
    if (!document.activeElement?.matches?.('.rm-t')) $('#how').classList.remove('rm-editing');
    const wasDraft = !!el.dataset.draft;
    await rmCommit(el);
    if (wasDraft) ui.rm.draft = null;
    if (!document.activeElement?.matches?.('.rm-t')) rmReload();
  }, 0);
});
// Campos del detalle
document.addEventListener('change', async (e) => {
  const f = e.target.dataset?.rmField;
  if (e.target.dataset?.rmListname && e.target.value.trim()) return run('update_todo_list', { id: e.target.dataset.rmListname, name: e.target.value.trim() });
  if (!f) return;
  const id = e.target.dataset.id;
  let v = e.target.value;
  if (f === 'tags') v = v.split(/[\s,]+/).map((x) => x.replace(/^#/, '')).filter(Boolean);
  await run('update_todo', { id, [f]: v });
  rmReload();
});

// Barra sobre el teclado / al pie del panel mientras escribes
function rmBar() {
  let bar = $('.rm-bar');
  if (bar) return bar;
  bar = document.createElement('div');
  bar.className = 'rm-bar';
  bar.innerHTML = `<button data-rmb="out" title="Quitar sangría (Mayús+Tab)">${icon('outdent', 18)}</button><button data-rmb="in" title="Sangrar (Tab)">${icon('indent', 18)}</button>
    <button data-rmb="today" title="Para hoy">${icon('cal', 17)}</button><button data-rmb="flag" title="Bandera">${icon('flag', 17)}</button><button data-rmb="info" title="Detalles">${icon('info', 18)}</button><span class="sp"></span><button data-rmb="ok">OK</button>`;
  bar.addEventListener('pointerdown', (e) => e.preventDefault()); // no quitar el foco (ni cerrar el teclado)
  bar.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rmb]');
    const el = document.activeElement;
    if (!b || !el?.matches?.('.rm-t')) return;
    const k = b.dataset.rmb;
    if (k === 'ok') return el.blur();
    if (k === 'in' || k === 'out') return rmIndent(el, k === 'out');
    let id = el.dataset.id;
    if (el.dataset.draft) id = await rmCommit(el);
    if (!id) return;
    const t = byId(rmAll(), id) || {};
    if (k === 'today') await run('update_todo', { id, due: t.due === S.today ? '' : S.today });
    if (k === 'flag') await run('update_todo', { id, flagged: !t.flagged });
    if (k === 'info') { ui.rm.detail = id; el.blur(); }
    rmReload(k === 'info' ? null : el.dataset.draft ? el : `.rm-t[data-id="${id}"]`);
  });
  $('#how').appendChild(bar);
  return bar;
}
if (window.visualViewport) {
  const vv = window.visualViewport;
  const kb = () => document.documentElement.style.setProperty('--kb', Math.max(0, innerHeight - vv.height - vv.offsetTop) + 'px');
  vv.addEventListener('resize', kb);
  vv.addEventListener('scroll', kb);
}

// Deslizar una fila: derecha = sangrar, izquierda = quitar sangría (o mostrar «Borrar» si ya está arriba del todo).
// La fila sigue al dedo sin saltos (con resistencia progresiva al final) y, al soltar, sale desde donde está:
// si cambia la sangría, las filas viajan a su sitio nuevo (FLIP) en vez de recolocarse de golpe
let rsw = null;
const RM_ARM = 64, RM_DEL = -90;
const rmResist = (x) => Math.sign(x) * 130 * Math.tanh(Math.abs(x) / 150); // cada vez cuesta más, sin tope seco
const rmUnresist = (x) => Math.sign(x) * 150 * Math.atanh(Math.min(0.98, Math.abs(x) / 130));
const rmX = (el) => new DOMMatrix(getComputedStyle(el).transform).m41;
document.addEventListener('touchstart', (e) => {
  const row = e.target.closest('.rm-row:not(.draft)');
  $$('.rm-row.swiped').forEach((r) => r !== row && rmSettle(r, 0));
  if (!row || e.target.closest('.rm-detail, .rm-swdel') || e.touches.length > 1) return;
  rsw = { row, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, on: false, tr: tracker(e.touches[0].clientX, e.touches[0].clientY) };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!rsw) return;
  const t = e.touches[0];
  const dx = t.clientX - rsw.x, dy = t.clientY - rsw.y;
  rsw.tr.add(t.clientX, t.clientY);
  if (!rsw.on) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return (rsw = null);
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    rsw.on = true;
    clearTimeout(press);
    // Arranca desde donde está la fila (también si estaba abierta enseñando «Borrar»), sin saltar
    const row = rsw.row;
    const from = rmX(row);
    row.getAnimations().forEach((an) => an.cancel());
    row.classList.remove('swiped');
    row.style.transition = 'none';
    rsw.x = t.clientX - rmUnresist(from) / 0.9;
  }
  rsw.dx = t.clientX - rsw.x;
  const x = rmResist(rsw.dx * 0.9);
  rsw.row.style.transform = `translate3d(${x}px,0,0)`;
  const arm = x > RM_ARM ? 'in' : x < -RM_ARM ? 'out' : '';
  if (arm !== (rsw.row.dataset.arm || '')) { rsw.row.dataset.arm = arm; if (arm) navigator.vibrate?.(6); }
}, { passive: true });
// Lleva la fila a x con un muelle que arranca a la velocidad del dedo (sin rebote)
function rmSettle(row, x, v = 0) {
  const from = rmX(row);
  row.classList.toggle('swiped', x === RM_DEL);
  row.style.transition = 'none';
  row.style.transform = x ? `translate3d(${x}px,0,0)` : '';
  if (Math.abs(from - x) < 0.5) return void (row.style.transition = '');
  const { frames, duration } = springFrames(from, x, v, 0.36);
  row.animate(frames.map((f) => ({ transform: `translate3d(${f}px,0,0)` })), { duration, easing: 'linear' }).onfinish = () => (row.style.transition = '');
}
// Cambia algo que mueve filas y las anima desde donde estaban hasta su sitio nuevo
async function rmFlip(change) {
  const pos = (r) => ($('.rm-check', r) || r).getBoundingClientRect();
  const before = new Map($$('.rm-row[data-id]').map((r) => [r.dataset.id, pos(r)]));
  await change();
  for (const r of $$('.rm-row[data-id]')) {
    r.getAnimations().forEach((an) => an.cancel());
    r.style.transition = 'none';
    r.style.transform = '';
    delete r.dataset.arm;
    const b = before.get(r.dataset.id);
    if (!b) continue;
    const a = pos(r);
    const dx = b.left - a.left, dy = b.top - a.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) { r.style.transition = ''; continue; }
    r.animate([{ transform: `translate3d(${dx}px,${dy}px,0)` }, { transform: 'none' }], { duration: 380, easing: EASE_IOS }).onfinish = () => (r.style.transition = '');
  }
}
document.addEventListener('touchend', async (e) => {
  if (e.touches.length) return;
  const s = rsw;
  rsw = null;
  if (!s?.on) return;
  quietClick(60);
  const { row } = s;
  const x = rmX(row), [v] = s.tr.v();
  delete row.dataset.arm;
  const t = byId(rmAll(), row.dataset.id);
  if (!t) return rmSettle(row, 0, v);
  const flat = !!row.closest('.rm-flatlist');
  if (x > RM_ARM && !flat) return rmFlip(async () => { try { await run('indent_todo', { id: t.id }); } catch {} await rmReload(); });
  if (x < -RM_ARM && t.parentId && !flat) return rmFlip(async () => { try { await run('indent_todo', { id: t.id, outdent: true }); } catch {} await rmReload(); });
  // Sin cambio de sangría: se queda abierta enseñando «Borrar» si se ha deslizado (o lanzado) a la izquierda
  rmSettle(row, x < -RM_ARM || (x < -24 && v < -0.3) ? RM_DEL : 0, v);
}, { passive: true });
document.addEventListener('touchcancel', () => { if (rsw?.on) rmSettle(rsw.row, 0); rsw = null; }, { passive: true });

// Al marcar uno se queda un momento a la vista antes de irse; si lo vuelves a tocar en ese rato, se recupera
const rmLeaving = new Map(); // id → temporizador de salida
async function rmToggle(el, id) {
  const t = byId(rmAll(), id);
  if (!t) return;
  const done = !t.done;
  const fam = [id, ...rmDesc(id).map((k) => k.id)];
  if (el.classList.contains('task')) popCheck(el, done);
  else {
    const row = el.closest('.rm-row') || el;
    row.classList.toggle('done', done);
    row.classList.remove('pop', 'rm-out');
    void row.offsetWidth;
    row.classList.add('pop');
    if (done) { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, rmColor(t)); }
  }
  ui.holdUntil = Date.now() + 600;
  clearTimeout(rmLeaving.get(id));
  rmLeaving.delete(id);
  if (done) {
    fam.forEach((k) => rmRecent.add(k));
    rmLeaving.set(id, setTimeout(() => {
      if (!rmLeaving.has(id)) return;
      if (ui.rm.showDone) return void (rmLeaving.delete(id), fam.forEach((k) => rmRecent.delete(k)));
      const rows = fam.map((k) => $(`.rm-row[data-id="${k}"]`)).filter(Boolean);
      rows.forEach((r) => r.classList.add('rm-out'));
      // Aún se puede recuperar mientras se desvanece; solo al terminar desaparece de verdad
      rmLeaving.set(id, setTimeout(() => {
        rmLeaving.delete(id);
        fam.forEach((k) => rmRecent.delete(k));
        rmReload();
      }, rows.length ? 320 : 0));
    }, 1400));
  } else fam.forEach((k) => rmRecent.delete(k)); // recuperado: se queda donde estaba
  await run('update_todo', { id, done });
}

// ---------- "¿Cómo vas?" ----------
function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}
let aiLoading = false;
function howSummary() {
  const b = S.briefing;
  const text = S.db.meta.briefingDate === S.today ? S.db.meta.briefingText : null;
  const late = b.overdue;
  const all = b.totals;
  const verdict = late ? `Llevas ${late} tarea${late > 1 ? 's' : ''} atrasada${late > 1 ? 's' : ''}` : all.total && all.done === all.total ? 'Hoy ya está hecho' : 'Vas al día';
  return `
    <div class="how-top"><div><div class="greet">${greeting()}</div><div class="sub">${fmtLong(S.today)}</div></div>
      <div style="display:flex;gap:2px">${S.web ? backBtn() : ''}<button class="ibtn" data-act="rm-go" title="Recordatorios">${icon('checklist', 16)}</button><button class="ibtn" data-act="how-view" data-v="organize" title="Organizar: proyectos, capas y calendarios">${icon('folder', 16)}</button><button class="ibtn" data-act="how-view" data-v="settings" title="Ajustes">${icon('gear', 16)}</button><button class="ibtn" data-act="how-close" title="Cerrar">${icon('x', 16)}</button></div></div>
    ${text ? `<div class="ai-line">${icon('spark', 15)}<span>${esc(text)}</span></div>` : aiLoading ? `<div class="ai-line loading">${icon('spark', 15)}<span>Pensando en tu día…</span></div>` : ''}
    ${b.moved.length ? `<div class="sub" style="margin-top:12px">↻ ${b.moved.length} tarea${b.moved.length > 1 ? 's' : ''} de días anteriores ${b.moved.length > 1 ? 'pasaron' : 'pasó'} a tus próximos bloques.</div>` : ''}
    <div class="how-cols">
      <div>
        <div class="verdict">${ring('how-today', all.pct, late ? 'var(--late)' : 'var(--accent)', 62, 6, true, 'big')}
          <div><b>${verdict}</b><div class="sub">${all.total ? `${all.done} de ${all.total} tareas de hoy` : 'Nada programado hoy'}${late ? ` · <a class="lnk" data-act="rollover">pasarlas al siguiente bloque</a>` : ''}</div></div></div>
        <div class="h3">Hoy</div>
        ${b.goals.filter((g) => g.date <= S.today).map((g) => goalRow(byId(S.db.goals, g.id))).join('')}
        ${(b.todos || []).map((x) => byId(rmAll(), x.id)).filter(Boolean).map(todoRow).join('')}
        ${b.blocks.flatMap((bl) => bl.tasks.map((t) => taskRow(t, bl.color, bl.title))).join('') || (b.goals.some((g) => g.date <= S.today) || (b.todos || []).length ? '' : '<div class="hint">Día libre 🌿</div>')}
      </div>
      <div>
        ${b.goals.some((g) => g.date > S.today) ? `<div class="h3" style="margin-top:4px">Objetivos de la semana</div>${b.goals.filter((g) => g.date > S.today).map((g) => goalRow(byId(S.db.goals, g.id))).join('')}` : ''}
        <div class="h3" style="margin-top:14px">Cuenta atrás</div>
        ${b.upcoming.slice(0, 4).map((m) => `<div class="list-row" data-act="how-open-ms" data-id="${m.id}"><div class="count" style="--c:${m.color}"><b>${m.daysLeft}</b><span>días</span></div>
          <div class="grow"><div class="ttl">${esc(m.title)}</div><div class="meta">${esc(m.project)} · ${m.pct}%</div>${prog('hu-' + m.id, m.pct, m.color)}</div></div>`).join('') || '<div class="hint">Sin exámenes a la vista</div>'}
      </div>
    </div>`;
}
let memCache = null;
// Cabecera común de las pantallas del panel: volver, título y pestañas Organizar / Ajustes
function howHead(title) {
  return `<div class="how-top hh"><div style="display:flex;align-items:center;gap:6px">${S.web ? backBtn() : `<button class="ibtn" data-act="how-view" data-v="summary" title="Volver">${icon('chevL', 17)}</button>`}<div class="greet" style="font-size:24px">${title}</div></div>
      <div style="display:flex;align-items:center;gap:8px"><div class="seg" data-seg="howtab">${[['organize', 'Organizar'], ['settings', 'Ajustes']].map(([v, l]) => `<button type="button" class="${ui.howView === v ? 'on' : ''}" data-act="how-view" data-v="${v}">${l}</button>`).join('')}</div>
      <button class="ibtn" data-act="how-close" title="Cerrar">${icon('x', 16)}</button></div></div>`;
}
// Sección con icono, título y una línea que explica para qué sirve
const sec = (id, ic, title, desc, body, cls = '') => `<section class="sec ${cls}" id="${id}" data-key="${id}">
  <div class="sec-h"><span class="sec-ic">${icon(ic, 16)}</span><div><div class="sec-t">${title}</div>${desc ? `<div class="sec-d">${desc}</div>` : ''}</div></div>
  <div class="sec-b">${body}</div></section>`;

function howSettings() {
  const s = S.db.settings;
  const segOf = (name, opts, cur) => `<div class="seg" data-seg="${name}" data-live="${name}">${opts.map(([v, l]) => `<button type="button" class="${cur === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const mode = s.mode || 'tray';
  return `${howHead('Ajustes')}
    <div class="how-cols">
      <div>
        ${sec('sec-look', 'sun', 'Apariencia', 'Tema, fondo y transparencia del panel.', `
          <div class="field"><span>Tema</span>${segOf('theme', [['auto', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']], s.theme)}</div>
          <div class="field"><span>Fondo</span>${segOf('glass', [['aurora', 'Aurora'], ['wallpaper', 'Fondo de escritorio']], s.glass === 'wallpaper' ? 'wallpaper' : 'aurora')}
            <small class="sub">${s.glass === 'wallpaper' ? 'Tu fondo de escritorio, difuminado.' : 'Toques de color muy suaves que siguen al ratón y laten al pulsar.'}</small></div>
          <label class="field desk-only"><span>Opacidad del fondo</span><input class="range" type="range" min="0" max="1" step="0.05" value="${s.opacity ?? 0.55}" data-opacity></label>`)}
        ${sec('sec-window', 'pin', 'Ventana', 'Dónde vive el calendario en tu escritorio.', `
          <div class="field">${segOf('mode', [['tray', 'Bandeja'], ['desk', 'Escritorio'], ['top', 'Siempre visible'], ['win', 'Ventana']], mode)}
            <small class="sub">${{ tray: 'Escondido en un icono junto al reloj: púlsalo para desplegarlo y se esconde solo al dejar de usarlo.', desk: 'Detrás de tus apps, como parte del escritorio: se ve al mostrar el escritorio (Win+D).', top: 'Se queda encima de todas las ventanas.', win: 'Se comporta como una ventana más.' }[mode]}</small></div>
          <label class="toggle"><div>Ajustar a la cuadrícula de iconos<small>Al moverlo o redimensionarlo, encaja con las celdas del escritorio</small></div><input type="checkbox" data-setting="snap" ${s.snap !== false ? 'checked' : ''}><span class="switch"></span></label>
          <label class="toggle"><div>Iniciar con Windows<small>Con el «¿Cómo vas?» de cada mañana</small></div><input type="checkbox" data-setting="autostart" ${s.autostart ? 'checked' : ''}><span class="switch"></span></label>`, 'desk-only')}
        ${sec('sec-study', 'redo', 'Estudio', 'Qué hace la app con lo que se queda sin hacer.', `
          <label class="toggle"><div>Arrastrar lo pendiente<small>Cada mañana, lo no hecho pasa al siguiente bloque</small></div><input type="checkbox" data-setting="autoRollover" ${s.autoRollover ? 'checked' : ''}><span class="switch"></span></label>`, 'desk-only')}
      </div>
      <div>
        ${sec('sec-cloud', 'layers', 'Nube y móvil', 'Tu calendario sincronizado entre este PC, el móvil y otros ordenadores.', cloudSection())}
        ${sec('sec-remote', 'spark', 'Claude desde cualquier sitio', 'Tu calendario y tus recordatorios dentro de Claude: en la web, en el móvil o en otro ordenador.', mcpSection())}
        ${sec('sec-agent', 'spark', 'Agente', 'Usa tu cuenta de Claude. Recuerda lo importante de lo que haces y le pides.', `
          <div class="list-row" style="cursor:default;padding-left:0"><span class="dotc" style="--c:${S.account.ok ? 'var(--ok)' : 'var(--late)'};border-radius:50%"></span>
            <div class="grow"><div class="ttl">${S.account.ok ? 'Cuenta de Claude conectada' : 'Sin sesión de Claude'}</div>
            <div class="meta">${S.account.ok ? [S.account.email, S.account.plan && 'plan ' + cap1(S.account.plan)].filter(Boolean).map(esc).join(' · ') || 'Usa la sesión de Claude Code de este PC' : 'Pulsa «Iniciar sesión» y entra con tu cuenta de Claude en el navegador'}</div></div>
            ${S.account.ok ? '' : `<button class="btn primary" data-act="login" style="flex:none">Iniciar sesión</button>`}<button class="ibtn" data-act="check-account" title="Comprobar">${icon('redo', 13)}</button></div>
          <label class="field"><span>Modelo</span><input class="input" data-setting-text="model" value="${esc(s.model)}"></label>
          <div class="field"><span>Memoria${memCache ? ` · ${memCache.memories.length} recuerdos` : ''}</span>
          ${memCache ? memCache.memories.slice(0, 16).map((m) => `<div class="mem ${m.core ? 'core' : ''}" data-key="mem-${m.id}"><div class="grow">${m.kind === 'norma' ? '<span class="mem-k">Norma</span>' : ''}${esc(m.text)}</div>${m.core ? '' : `<div class="str">${prog('mem-' + m.id, m.strength, 'var(--accent)')}</div>`}${m.kind === 'norma' ? '' : `<button class="ibtn ${m.pinned ? 'on' : ''}" data-act="pin-mem" data-id="${m.id}" data-on="${m.pinned ? '' : '1'}" title="${m.pinned ? 'Dejar de fijar' : 'Fijar: lo recordará siempre, con máxima fuerza'}" style="width:22px;height:22px">${icon('pin', 12)}</button>`}<button class="ibtn" data-act="forget" data-id="${m.id}" title="Olvidar" style="width:22px;height:22px">${icon('x', 12)}</button></div>`).join('') || '<div class="hint">Todavía no recuerda nada. Irá aprendiendo de lo que haces y le pides.</div>' : '<div class="hint">Cargando…</div>'}</div>`, 'desk-only')}
        ${sec('sec-mcp', 'copy', 'Conectar con Claude', 'Para que Claude (la app) pueda leer y organizar tu calendario.', `
          <div class="c-actions" style="margin-top:0"><button class="btn" data-act="copy-mcp">${icon('copy', 13)} Copiar config MCP</button><button class="btn" data-act="install-skill">${icon('spark', 13)} Instalar skill</button></div>
          <div class="sub" style="font-size:11px;margin-top:12px;overflow-wrap:anywhere">Datos: ${esc(S.dataFile)}</div>`, 'desk-only')}
      </div>
    </div>`;
}

function howOrganize() {
  return `${howHead('Organizar')}
    <div class="how-cols">
      <div>
        ${sec('sec-projects', 'folder', 'Proyectos', 'Asignaturas, trabajos y proyectos propios, con sus subcategorías (p. ej. seminarios, prácticas, exámenes). Toca el color para cambiarlo.', `
          ${S.db.projects.map((p) => `<div class="list-row" data-key="pr-${p.id}" style="cursor:default"><button class="color-btn ${ui.colorFor === p.id ? 'open' : ''}" style="--c:${p.color}" data-act="pick-color" data-id="${p.id}" title="Cambiar color"></button><div class="grow"><div class="ttl">${esc(p.name)}</div><div class="meta">${KIND_LABEL[p.kind] || ''} · ${S.stats.projects[p.id].pct}%</div></div><button class="ibtn" data-act="del-project" data-id="${p.id}" title="Eliminar">${icon('trash', 13)}</button></div>${ui.colorFor === p.id ? paletteRow(p.id, p.color, 'project') : ''}
            <div class="cat-row" data-key="pc-${p.id}" style="--c:${p.color}">${(p.categories || []).map((c) => `<span class="cat-chip" data-key="cc-${c.id}"><input class="cat-name" data-cat-name="${c.id}" data-project="${p.id}" value="${esc(c.name)}" size="${Math.max(3, c.name.length)}" title="Renombrar">${S.stats.categories?.[c.id]?.total ? `<span class="cat-pct">${S.stats.categories[c.id].pct}%</span>` : ''}<button data-act="del-cat" data-project="${p.id}" data-id="${c.id}" title="Quitar subcategoría">${icon('x', 11)}</button></span>`).join('')}<input class="cat-add" data-add="category" data-project="${p.id}" data-key="catadd-${p.id}" placeholder="+ Subcategoría"></div>`).join('') || '<div class="hint">Aún no hay proyectos.</div>'}
          <input class="inline-add" data-add="project" data-key="addproj" placeholder="Nuevo proyecto  ↵" />`)}
        ${sec('sec-subs', 'cal', 'Calendarios suscritos', 'Calendarios externos (Google, Outlook, iCloud). Sus eventos son de solo lectura y se actualizan solos.', `
          ${(S.db.subscriptions || []).map((s) => `<div class="list-row" data-key="sb-${s.id}" style="cursor:default"><button class="color-btn ${ui.colorFor === s.id ? 'open' : ''}" style="--c:${s.color}" data-act="pick-color" data-id="${s.id}" title="Cambiar color"></button>
            <div class="grow"><div class="ttl">${esc(s.name)}</div><div class="meta">${s.error ? `<span style="color:var(--late)">No se pudo descargar: ${esc(s.error)}</span>` : s.lastSync ? `${s.count || 0} eventos · actualizado ${new Date(s.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Descargando…'}</div></div>
            <button class="pchip ${s.blocking ? 'on' : ''}" style="--c:${s.color}" data-act="sub-blocking" data-id="${s.id}" title="Sus eventos bloquean su hueco en todas las capas">${icon('clock', 11)} Bloqueante</button><button class="ibtn" data-act="refresh-sub" data-id="${s.id}" title="Actualizar ahora">${icon('redo', 13)}</button><button class="ibtn" data-act="del-sub" data-id="${s.id}" title="Quitar">${icon('trash', 13)}</button></div>
            ${ui.colorFor === s.id ? paletteRow(s.id, s.color, 'sub') : ''}`).join('')}
          <div class="sub-form"><input class="input" data-sub-name placeholder="Nombre (p. ej. «Horario de clases»)"><input class="input" data-sub-url placeholder="https://…/basic.ics o webcal://…"><button class="btn primary" data-act="add-sub" style="justify-self:start">Suscribirme</button></div>
          <div class="sec-d" style="margin-top:10px">En Google Calendar: Configuración → tu calendario → «Dirección secreta en formato iCal».</div>`)}
      </div>
      <div>
        ${sec('sec-layers', 'layers', 'Capas', 'Cada capa es una vista del calendario. Marca qué proyectos, subcategorías y calendarios entran en cada una; pueden estar en varias.', `
          ${(S.db.layers || []).map((l) => `<div class="layer-box" data-key="ly-${l.id}">
            <div class="layer-head">${icon('layers', 14)}<input class="layer-name" data-layer-name="${l.id}" value="${esc(l.name)}"><button class="ibtn" data-act="del-layer" data-id="${l.id}" title="Eliminar capa">${icon('trash', 13)}</button></div>
            <div class="chips-row">
              ${S.db.projects.map((p) => `<span class="pgroup"><button class="pchip ${l.projectIds.includes(p.id) ? 'on' : (p.categories || []).some((c) => (l.categoryIds || []).includes(c.id)) ? 'part' : ''}" style="--c:${p.color}" data-act="layer-toggle" data-layer="${l.id}" data-kind="project" data-id="${p.id}">${esc(p.name)}</button>${(p.categories || []).map((c) => `<button class="pchip cat ${l.projectIds.includes(p.id) || (l.categoryIds || []).includes(c.id) ? 'on' : ''}" style="--c:${p.color}" data-act="layer-toggle" data-layer="${l.id}" data-kind="category" data-project="${p.id}" data-id="${c.id}" title="${esc(p.name)} › ${esc(c.name)}">${esc(c.name)}</button>`).join('')}</span>`).join('')}
              ${(S.db.subscriptions || []).map((s) => `<button class="pchip sub ${l.subscriptionIds.includes(s.id) ? 'on' : ''}" style="--c:${s.color}" data-act="layer-toggle" data-layer="${l.id}" data-kind="sub" data-id="${s.id}">${esc(s.name)}</button>`).join('')}
              <button class="pchip ${l.includeLoose ? 'on' : ''}" data-act="layer-toggle" data-layer="${l.id}" data-kind="loose">Objetivos sin proyecto</button>
            </div></div>`).join('') || '<div class="hint">Aún no hay capas. Sin capas, el calendario muestra todo.</div>'}
          <input class="inline-add" data-add="layer" data-key="addlayer" placeholder="Nueva capa (p. ej. «Universidad»)  ↵" />`)}
      </div>
    </div>`;
}


// ---------- Claude en el móvil: se escribe aquí y se abre Claude, que usa el conector del calendario ----------
const AI_SUGGEST = ['¿Qué tengo hoy?', '¿Cómo voy con mis exámenes?', 'Apúntame para mañana: ', 'Planifícame el estudio del próximo examen'];
function howAI() {
  const ok = mcpCache && !mcpCache.error;
  return `<div class="how-top hh"><div style="display:flex;align-items:center;gap:6px">${backBtn()}<div class="greet" style="font-size:24px">Claude</div></div><div></div></div>
    <div class="sub ai-intro">Escribe lo que necesites y se abre Claude con tu mensaje. Claude ve y cambia tu calendario y tus recordatorios con el conector «Golden&#39;s Calendar», aunque el PC esté apagado.</div>
    <div class="ai-box" data-key="ai-box"><textarea class="input" data-ai-text rows="4" enterkeyhint="send" placeholder="«¿Qué me queda de Física?», «muéveme el bloque de hoy a mañana»…">${esc(ui.aiDraft || '')}</textarea>
      <button class="btn primary" data-act="ai-send">${icon('send', 15)} Abrir en Claude</button></div>
    <div class="chips-row ai-chips" data-key="ai-chips">${AI_SUGGEST.map((q) => `<button class="pchip" data-act="ai-suggest" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    ${sec('sec-remote', 'spark', ok ? 'Conector activo' : 'Conecta Claude (una vez)', ok ? 'Claude ya puede usar tu calendario.' : 'Crea el enlace y añádelo en Claude como conector. Después, todo lo que escribas aquí lo podrá hacer Claude.', mcpSection())}`;
}

// ---------- Claude desde cualquier sitio (MCP remoto) ----------
let mcpCache;
function mcpSection() {
  const c = S.cloud || {};
  if (!c.email) return '<div class="hint">Entra primero en «Nube y móvil»: el enlace va unido a tu cuenta.</div>';
  if (mcpCache === undefined) return '<div class="hint">Cargando…</div>';
  if (mcpCache?.error) return `<div class="cloud-msg err">${esc(mcpCache.error)}</div><div class="c-actions"><button class="btn" data-act="mcp-reload">${icon('redo', 13)} Reintentar</button></div>`;
  const when = (t) => new Date(t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const steps = `<ol class="mcp-steps"><li>Copia el enlace.</li><li>En Claude (claude.ai): <b>Ajustes → Conectores → Añadir conector personalizado</b>. Ponle de nombre «Golden&#39;s Calendar» y pega el enlace.</li><li>Ya está también en Claude del móvil. Pídele cosas como «¿qué tengo hoy?» o «apúntame la compra para el sábado».</li></ol>`;
  if (!mcpCache) return `<div class="sec-d" style="margin:0 0 10px">Crea un enlace secreto y añádelo en Claude como conector: podrá ver y organizar tu calendario y tus recordatorios desde la web o el móvil, aunque este dispositivo esté apagado.</div>
    <button class="btn primary" data-act="mcp-create">${icon('spark', 13)} Crear enlace</button>`;
  return `${mcpCache.url ? `<div class="mcp-url" data-key="mcp-url"><code>${esc(mcpCache.url.replace(/^https:\/\//, '').replace(/(\/mcp\/.{6}).+/, '$1…'))}</code><button class="btn primary" data-act="mcp-copy">${icon('copy', 13)} Copiar</button></div>${steps}`
    : `<div class="sec-d" style="margin:0 0 8px">Tienes un enlace activo creado en otro dispositivo. Cópialo desde allí o crea uno nuevo aquí (el anterior dejará de funcionar).</div>`}
    <div class="c-meta" style="margin-top:8px">Creado ${when(mcpCache.created_at)}${mcpCache.last_used ? ` · último uso ${when(mcpCache.last_used)}` : ' · aún sin usar'}</div>
    <div class="c-actions"><button class="btn" data-act="mcp-create">${icon('redo', 13)} ${mcpCache.url ? 'Cambiar enlace' : 'Crear uno nuevo'}</button><button class="btn danger" data-act="mcp-revoke">Desactivar</button></div>
    <div class="sec-d" style="margin-top:8px">Quien tenga el enlace puede usar tu calendario: no lo compartas. Si se filtra, cámbialo.</div>`;
}
async function loadMcp() {
  try { mcpCache = await api.mcpLink(); } catch (e) { mcpCache = { error: cleanErr(e) }; }
  renderHow(true);
}

// ---------- Nube y móvil ----------
function cloudForm() {
  return `<div class="c-meta" style="margin:2px 0 8px">Entra para tener tu calendario en el móvil y en otros PCs.</div>
    <input class="input" data-cloud-email type="email" autocomplete="email" placeholder="tu@email.com" value="${esc(ui.cloudEmail || '')}">
    <input class="input" data-cloud-pw type="password" autocomplete="current-password" placeholder="Contraseña" style="margin-top:6px">
    <div class="cloud-msg ${ui.cloudMsg?.kind || ''}" data-key="cloud-msg">${ui.cloudMsg ? esc(ui.cloudMsg.text) : ''}</div>
    <div class="c-actions"><button class="btn primary" data-act="cloud-signin" ${ui.cloudBusy ? 'disabled' : ''}>${ui.cloudBusy === 'in' ? 'Entrando…' : 'Entrar'}</button><button class="btn plain" data-act="cloud-signup" ${ui.cloudBusy ? 'disabled' : ''}>${ui.cloudBusy === 'up' ? 'Creando…' : 'Crear cuenta'}</button></div>`;
}
function cloudSection() {
  const c = S.cloud || { state: 'unconfigured' };
  let body;
  if (c.state === 'unconfigured') body = '<div class="hint">Pendiente de configurar el servidor.</div>';
  else if (!c.email) body = cloudForm();
  else {
    const dot = c.state === 'error' ? 'var(--late)' : c.state === 'syncing' ? 'var(--warn)' : 'var(--ok)';
    const when = c.lastSync ? new Date(c.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
    body = `<div class="list-row" style="cursor:default;padding-left:0"><span class="dotc" style="--c:${dot};border-radius:50%"></span>
      <div class="grow"><div class="ttl">${c.state === 'syncing' ? 'Sincronizando…' : c.state === 'error' ? 'Error al sincronizar' : 'Sincronizado'}</div>
      <div class="meta">${esc(c.email)}${when ? ' · ' + when : ''}${c.error ? ' · ' + esc(c.error) : ''}</div></div>
      <button class="ibtn" data-act="cloud-sync" title="Sincronizar ahora">${icon('redo', 13)}</button><button class="btn plain" data-act="cloud-signout" style="flex:none">Salir</button></div>
      ${ui.pwOpen ? `<div class="field" data-key="pw-change"><span>Nueva contraseña (la usarás también en el móvil)</span>
        <div class="row2"><input class="input" data-new-pw type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"><button class="btn primary" data-act="cloud-setpw" style="flex:none">Guardar</button></div>
        <div class="cloud-msg ${ui.pwMsg?.kind || ''}">${ui.pwMsg ? esc(ui.pwMsg.text) : ''}</div></div>`
        : `<div class="c-actions" style="margin-top:8px"><button class="btn" data-act="cloud-pw">Cambiar contraseña</button></div>`}
      ${c.mobileUrl ? `<div class="c-meta desk-only" style="margin-top:6px">App del móvil: <a class="lnk" href="${esc(c.mobileUrl)}" target="_blank">${esc(c.mobileUrl.replace(/^https?:\/\//, ''))}</a></div>` : ''}`;
  }
  return body;
}
// En el móvil, sin sesión se muestra directamente la entrada
function renderLogin() {
  let el = $('#login');
  const need = S?.web && S.cloud?.state === 'signed-out';
  if (!need) return el?.remove();
  if (!el) {
    el = document.createElement('div');
    el.id = 'login';
    $('#widget').appendChild(el);
  }
  if (el.querySelector('input') && document.activeElement?.closest('#login')) return;
  el.innerHTML = `<div class="login-card"><div class="greet">Golden&#39;s Calendar</div><div class="sub" style="margin-bottom:14px">Tu calendario de estudio, también en el móvil.</div>${cloudForm()}</div>`;
}
function sizeHow() {
  const w = $('#widget');
  $('#how').style.setProperty('--hw', w.clientWidth - 20 + 'px');
  $('#how').style.setProperty('--hh', w.clientHeight - 20 + 'px');
}
function renderHow(force = true) {
  const el = $('#how');
  sizeHow();
  el.className = `how ${ui.how} ${ui.fresh && ui.how !== 'open' ? 'fresh' : ''} ${document.activeElement?.matches?.('.how .rm-t') ? 'rm-editing' : ''}`;
  if (!el.firstChild) el.innerHTML = `<div class="how-btn"></div><div class="how-body"></div>`;
  $('.how-btn', el).innerHTML = `${ui.fresh ? '<span class="dot"></span>' : icon('sun', 14)} ¿Cómo vas?`;
  if (ui.how !== 'open' || (!force && document.activeElement?.closest?.('.how-body input, .how-body textarea, .how-body select'))) return;
  const body = $('.how-body', el);
  const scroll = body.scrollTop;
  const view = ui.howView;
  if (body.dataset.view !== view) (body.innerHTML = ''), (body.dataset.view = view); // otra pantalla: entra completa
  morph(body, view === 'settings' ? howSettings() : view === 'organize' ? howOrganize() : view === 'todo' ? howTodo() : view === 'ai' ? howAI() : howSummary());
  body.scrollTop = scroll;
  animateValues(body);
  if (view === 'todo') (rmBar(), rmFit(body));
}
function openHow(view = 'summary') {
  if (S.web) {
    // En el móvil es una pantalla del historial; Organizar ↔ Ajustes son pestañas (sustituyen, no apilan)
    const cur = navCur().scr;
    const tabs = ['organize', 'settings'];
    if (cur.k === 'how' && cur.view === view && view !== 'todo') return;
    return navTo({ k: 'how', view, list: null }, { replace: cur.k === 'how' && tabs.includes(cur.view) && tabs.includes(view) });
  }
  closeCard(true);
  if (view === 'todo' && ui.howView !== 'todo') (ui.rm.draft = null), (ui.rm.detail = null);
  howShow(view);
}
function howShow(view) {
  ui.how = 'open';
  ui.howView = view;
  if (ui.fresh) { ui.fresh = false; api.briefingSeen(); if (S.web) renderDock(); }
  renderHow();
  if (view === 'ai' && S.cloud?.email && mcpCache === undefined) loadMcp();
  if (view === 'summary' && S.account.ok && !(S.db.meta.briefingDate === S.today && S.db.meta.briefingText) && !aiLoading) {
    aiLoading = true;
    renderHow();
    api.briefingAI().finally(() => { aiLoading = false; refresh(); });
  }
  if (view === 'settings') { api.memories().then((m) => { memCache = m; renderHow(); }); if (S.cloud?.email) loadMcp(); }
}
function closeHow() {
  if (S?.web) return navRoot(); // en el móvil, cerrar = volver al calendario
  ui.how = 'idle';
  renderHow();
}

// Proximidad: la barrita se convierte en botón cuando el cursor se acerca
document.addEventListener('mousemove', (e) => {
  magnetDots(e);
  if (ui.how === 'open' || S?.web) return; // en el móvil, «¿Cómo vas?» es un botón del dock
  const w = $('#widget').getBoundingClientRect();
  const near = Math.hypot(e.clientX - (w.left + w.width / 2), (e.clientY - (w.top + 10)) * 1.8) < 120;
  if (near !== (ui.how === 'near')) { ui.how = near ? 'near' : 'idle'; renderHow(false); }
});
document.addEventListener('mouseleave', () => { if (ui.how === 'near') { ui.how = 'idle'; renderHow(false); } });

// Puntos magnéticos
let dotPos = null, dotRaf = 0;
function magnetDots(e) {
  if (dotRaf || S?.web) return;
  dotRaf = requestAnimationFrame(() => {
    dotRaf = 0;
    const dots = $$('#dots i');
    if (!dotPos) dotPos = dots.map((d) => { const r = d.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    dots.forEach((d, i) => {
      const dist = Math.hypot(e.clientX - dotPos[i][0], e.clientY - dotPos[i][1]);
      d.classList.toggle('near', dist < 120);
    });
  });
}

// ---------- agente: botón de esquina → barra de texto ----------
const TOOL_LABEL = {
  daily_briefing: 'Día revisado', create_project: 'Proyecto creado', update_project: 'Proyecto actualizado',
  create_milestone: 'Fecha añadida', update_milestone: 'Fecha actualizada', add_topic: 'Tema añadido', update_topic: 'Tema actualizado', add_tasks: 'Subapartados añadidos',
  update_task: 'Tarea actualizada', create_block: 'Bloque creado', update_block: 'Bloque actualizado', plan_study: 'Estudio planificado', rollover_pending: 'Pendientes movidos',
  set_day_status: 'Día marcado', delete_item: 'Eliminado', get_todos: 'Recordatorios revisados', add_todos: 'Recordatorios añadidos', update_todo: 'Recordatorio actualizado', indent_todo: 'Recordatorio movido', create_todo_list: 'Lista creada', update_todo_list: 'Lista actualizada', create_goal: 'Objetivo marcado', update_goal: 'Objetivo actualizado', remember: 'Lo recordaré',
};
function md(text) {
  const lines = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n');
  let out = '', list = false;
  for (const l of lines) {
    const m = l.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
    if (m) { if (!list) { out += '<ul>'; list = true; } out += `<li>${m[1]}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    if (l.trim()) out += `<p>${l}</p>`;
  }
  return out + (list ? '</ul>' : '');
}

// ---------- Puntitos del agente: una animación distinta según lo que esté haciendo ----------
// Usa las animaciones de «dot/matrix» (MIT, ver dotmatrix.js): en reposo Sparkle, al acercarte Inner Twinkle,
// con la barra abierta Listening (Caret mientras escribes), pensando Thinking, usando herramientas Cipher,
// y al terminar Verify (✓) o Halt si falla. Al cambiar de estado se funden de una a otra.
const agentDots = (() => {
  let box = null, cur = null, curColor = '', temp = null, tempT = 0, hover = false;
  const base = () => (ui.busy ? 'think' : ui.agentOpen ? ($('#agent-in')?.value.trim() ? 'typing' : 'listen') : hover ? 'hover' : 'idle');
  const src = (k, color) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(DOTMATRIX[k].replaceAll('#ffffff', color));
  function show() {
    if (!box) return;
    const k = temp || base();
    const color = getComputedStyle(box).color;
    if (k === cur && color === curColor) return;
    const sameState = k === cur;
    cur = k;
    curColor = color;
    const img = new Image();
    img.className = 'dm';
    img.alt = '';
    img.src = src(k, color);
    const old = [...box.children];
    box.appendChild(img);
    if (sameState) return old.forEach((o) => o.remove()); // solo cambia el color: sin fundido
    img.animate([{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    old.forEach((o) => (o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).onfinish = () => o.remove()));
  }
  return {
    mount(el) {
      box = el;
      const host = el.closest('#agent');
      host.addEventListener('mouseenter', () => ((hover = true), show()));
      host.addEventListener('mouseleave', () => ((hover = false), show()));
      show();
    },
    sync() { show(); setTimeout(show, 320); }, // tras la transición de color al abrir/cerrar
    flash(k, ms) {
      temp = k;
      clearTimeout(tempT);
      tempT = setTimeout(() => ((temp = null), show()), ms);
      show();
    },
    kick() { show(); },
  };
})();

function renderAgent() {
  const el = $('#agent');
  if (!el.firstChild) {
    el.innerHTML = `<div class="spark"></div><input id="agent-in" placeholder="Pídeme algo: «examen de Química el 20, temas 1 a 4»" /><button class="send" data-act="agent-send">${icon('send', 15)}</button>`;
    agentDots.mount($('.spark', el));
    const inp = $('#agent-in');
    inp.addEventListener('input', () => agentDots.kick());
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); return histStep(inp, e.key === 'ArrowUp' ? -1 : 1); }
      if (e.key === 'Enter') { e.preventDefault(); sendAgent(); }
      if (e.key === 'Escape') { e.stopPropagation(); closeAgent(); }
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (!inp.value.trim() && !ui.busy && document.activeElement !== inp) closeAgent(); }, 180));
  }
  el.classList.toggle('open', ui.agentOpen);
  el.classList.toggle('busy', ui.busy);
  agentDots.sync();
}
// Historial de lo que le has pedido: ↑ y ↓ lo recorren, como en un terminal
const hist = { list: (() => { try { return JSON.parse(localStorage.getItem('agent-hist') || '[]'); } catch { return []; } })(), i: null, draft: '' };
function histStep(inp, d) {
  if (!hist.list.length) return;
  if (hist.i === null) {
    if (d > 0) return;
    hist.draft = inp.value;
    hist.i = hist.list.length;
  }
  hist.i += d;
  if (hist.i < 0) hist.i = 0;
  if (hist.i >= hist.list.length) {
    hist.i = null;
    inp.value = hist.draft;
  } else inp.value = hist.list[hist.i];
  requestAnimationFrame(() => inp.setSelectionRange(inp.value.length, inp.value.length));
}
function histPush(text) {
  hist.i = null;
  hist.draft = '';
  if (hist.list[hist.list.length - 1] !== text) hist.list.push(text);
  hist.list = hist.list.slice(-50);
  try { localStorage.setItem('agent-hist', JSON.stringify(hist.list)); } catch {}
}
function openAgent() {
  ui.agentOpen = true;
  renderAgent();
  setTimeout(() => $('#agent-in').focus(), 120);
}
function closeAgent() {
  ui.agentOpen = false;
  renderAgent();
}
let replyTimer;
function showReply() {
  const el = $('#reply');
  clearTimeout(replyTimer);
  if (!ui.reply) return el.classList.remove('show');
  const { text, tools } = ui.reply;
  el.innerHTML = `${tools.length ? `<div class="chips">${tools.map((t) => `<span class="chip">${icon('check', 11)} ${TOOL_LABEL[t] || t}</span>`).join('')}</div>` : ''}${text ? md(text) : '<div class="typing"><i></i><i></i><i></i></div>'}`;
  el.classList.add('show');
  if (text) replyTimer = setTimeout(hideReply, Math.min(30000, 9000 + text.length * 60));
}
function hideReply() {
  if ($('#reply').matches(':hover')) return (replyTimer = setTimeout(hideReply, 3000));
  ui.reply = null;
  $('#reply').classList.remove('show');
}
function agentContext() {
  const parts = [`Está viendo ${MONTHS[parse(ui.month).getMonth()]} ${ui.month.slice(0, 4)}${activeLayer() ? ` en ${activeLayer().multi ? 'las capas' : 'la capa'} «${activeLayer().name}» (id ${ui.layer})` : ''}.`];
  const c = ui.card;
  if (c?.type === 'block') { const b = byId(S.db.blocks, c.id); if (b) parts.push(`Tiene abierto el bloque «${b.title}» (id ${b.id}, ${b.date}).`); }
  if (c?.type === 'ms') { const m = byId(S.db.milestones, c.id); if (m) parts.push(`Tiene abierto ${ART[m.kind]} «${m.title}» (id ${m.id}, ${m.date}).`); }
  if (c?.type === 'goal') { const g = byId(S.db.goals || [], c.id); if (g) parts.push(`Tiene abierto el objetivo «${g.title}» (id ${g.id}, ${g.date}).`); }
  if (c?.type === 'day') parts.push(`Tiene abierto el día ${c.date}.`);
  if (ui.how === 'open' && ui.howView === 'todo') parts.push(ui.rm.list ? `Está en Recordatorios, en «${RM_SMART[ui.rm.list]?.name || rmListOf(rmCurList()).name}»${rmCurList() ? ` (listId ${rmCurList()})` : ''}.` : 'Está en Recordatorios.');
  else if (ui.how === 'open') parts.push('Está mirando «¿Cómo vas?».');
  return parts.join(' ');
}
async function sendAgent() {
  const inp = $('#agent-in');
  const text = inp.value.trim();
  if (!text || ui.busy) return;
  histPush(text);
  if (!S.account.ok) { toast('Inicia sesión en Claude para usar el agente'); return openHow('settings'); }
  inp.value = '';
  ui.busy = true;
  ui.reply = { text: '', tools: [] };
  renderAgent();
  showReply();
  const res = await api.chat(text, agentContext());
  ui.busy = false;
  agentDots.flash(res.error ? 'error' : 'done', 2200);
  ui.reply = { text: res.error ? (res.error === 'NOAUTH' ? 'Tu sesión de Claude ha caducado. Ve a Ajustes → Iniciar sesión.' : '⚠️ ' + res.error) : res.text, tools: ui.reply?.tools || [] };
  renderAgent();
  showReply();
  if (res.changed) refresh();
}
api.onAIEvent((ev) => {
  if (ev.type === 'tool') agentDots.flash('tool', 1400);
  if (ev.type !== 'tool' || !ui.reply || !TOOL_LABEL[ev.name]) return;
  if (!ui.reply.tools.includes(ev.name)) { ui.reply.tools.push(ev.name); showReply(); }
});

// ---------- acciones ----------
function popCheck(el, done) {
  ui.holdUntil = Date.now() + 480;
  el.classList.toggle('done', done);
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  if (done) {
    const r = (el.querySelector('.check') || el).getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, getComputedStyle(el).getPropertyValue('--c').trim() || '#d97757');
  }
}
// Menú de añadir anclado a un botón; date es el día en el que se crea
function addMenu(el, date) {
  if (!date) return;
  const r = el.getBoundingClientRect();
  const swap = (type) => () => actions.swap({ dataset: { type, date } });
  openCtx(r.right, r.bottom + 4, [
    { label: 'Bloque', icon: 'layers', run: swap('new-block') },
    { label: 'Objetivo', icon: 'target', run: swap('new-goal') },
    { label: 'Examen o entrega', icon: 'cap', run: swap('new-ms') },
    { label: 'Recordatorio', icon: 'checklist', run: () => actions['day-todo']({ dataset: { date } }) },
    '-',
    { label: 'Proyecto o asignatura', icon: 'folder', run: swap('new-project') },
  ]);
}
const actions = {
  month: (el) => changeMonth(+el.dataset.d),
  today: () => {
    if (ui.view === 'week') {
      const d = S.today < ui.weekStart ? -1 : 1;
      if (S.web && mondayOf(S.today) !== ui.weekStart) return carGo(mondayOf(S.today), d);
      ui.weekStart = mondayOf(S.today); ui.month = S.today.slice(0, 8) + '01'; return goWeekOrMonth(d); }
    return goMonth(S.today.slice(0, 8) + '01', S.today < ui.month ? -1 : 1);
  },
  'toggle-view': () => setView(ui.view === 'week' ? 'month' : 'week'),
  // Clic en un hueco libre de la semana: bloque nuevo a esa hora
  'wk-slot': (el, e) => {
    if (e.target.closest('.wk-it')) return;
    const g = el.closest('.wk-grid');
    const m = +g.dataset.h0 + (e.clientY - el.getBoundingClientRect().top) / +g.dataset.ppm;
    const start = hhmmOf(Math.max(0, Math.min(1410, Math.floor(m / 30) * 30)));
    if (ui.card) return closeCard();
    openCard({ type: 'new-block', date: el.dataset.date, start }, el);
  },
  'force-last': async () => {
    const r = ui.retry;
    if (!r) return;
    ui.retry = null;
    await run(r.name, { ...r.input, allowOverlap: true });
    closeCard(true);
    await refresh();
    toast(`${icon('check', 14)} Puesto encima del tiempo bloqueado`);
  },
  'sub-blocking': async (el) => { const s = byId(S.db.subscriptions, el.dataset.id); await run('update_subscription', { id: s.id, blocking: !s.blocking }); await refresh(); renderHow(true); },
  demo: async () => { await api.demo(); await refresh(); toast(`${icon('spark', 14)} Ejemplo cargado`); },
  open: (el) => {
    const v = { type: el.dataset.type, id: el.dataset.id };
    if (S.web) return openCard(v, el); // en el móvil se apila una pantalla
    if (ui.card && el.closest('#card')) return swapCard(v);
    if (ui.card) closeCard(true);
    openCard(v, el);
  },
  'open-day': (el) => { if (ui.card) return closeCard(); openCard({ type: 'day', date: el.dataset.date }, el); },
  'day-step': (el) => stepDay(+el.dataset.d),
  // Pausa del bloque en marcha: al reanudar se alarga lo que ha durado y se retrasa lo flexible de detrás
  'pause-block': async (el) => {
    const resume = !!el.dataset.resume;
    const r = await run('pause_block', { id: el.dataset.id, resume });
    await refresh();
    if (!resume) return toast(`${icon('pause', 14)} En pausa: cuando vuelvas, pulsa Reanudar`);
    toast(`${icon('play', 14)} Pausa de ${r.pausedMin} min · acaba a las ${r.end}${r.moved.length ? ` · ${r.moved.length} retrasado${r.moved.length > 1 ? 's' : ''}` : ''}${r.conflicts.length && !S.web ? ' · Claude lo reorganiza' : ''}`, 4500);
  },
  'day-jump': (el) => ui.card?.type === 'day' && stepDay(diffDays(ui.card.date, el.dataset.date), el.dataset.date),
  // «+» de la vista del día: menú con lo que se puede añadir ese día
  // «+» de la vista del día y de la cabecera del móvil: menú con lo que se puede añadir
  'day-add': (el) => addMenu(el, ui.card?.date),
  'add-menu': (el) => {
    const { from, to } = gridRange();
    const vis = ui.view === 'week' ? { from: ui.weekStart, to: addDays(ui.weekStart, 6) } : { from: ui.month, to: addDays(addMonths(ui.month, 1), -1) };
    addMenu(el, S.today >= vis.from && S.today <= vis.to ? S.today : vis.from || from || to);
  },
  'day-todo': (el) => {
    const date = el.dataset.date;
    const draft = () => { ui.rm.draft = { parentId: null, afterId: 'end', listId: null, preset: { due: date } }; rmRender('[data-key="td-draft"] .rm-t'); };
    if (S.web) return navTo({ k: 'how', view: 'todo', list: 'inbox' }, { sync: true, after: draft }); // sin esperar: así iOS abre el teclado
    closeCard(true); ui.rm.list = 'inbox'; openHow('todo'); ui.rm.draft = { parentId: null, afterId: 'end', listId: null, preset: { due: date } }; rmRender('[data-key="td-draft"] .rm-t'); },
  new: (el) => openCard({ type: el.dataset.type }, el),
  swap: (el) => {
    if (S.web) return navTo({ k: 'card', v: pageOf(el.dataset) });
    const back = ui.card; swapCard({ type: el.dataset.type, id: el.dataset.id, date: el.dataset.date, ms: el.dataset.ms }); ui.card.back = back; $('#card').classList.toggle('has-back', !!back); },
  'card-back': () => { if (S.web) return navBack(); const back = ui.card?.back; if (!back) return closeCard(); S.web ? swapSheet(back, -1) : swapCard(back); ui.card.back = back.back; $('#card').classList.toggle('has-back', !!back.back); },
  'close-card': () => closeCard(),
  'toggle-task': async (el, e) => {
    if (e.target.closest('.x, .dep')) return;
    const t = byId(S.db.tasks, el.dataset.id);
    if (t.requires?.length) return toast(`${icon('layers', 14)} Se marca solo al completar aquello de lo que depende`);
    const done = !t.done;
    popCheck(el, done);
    t.done = done;
    await run('update_task', { id: t.id, done });
  },
  'toggle-goal': async (el) => {
    const g = byId(S.db.goals, el.dataset.id);
    const done = !g.done;
    popCheck(el, done);
    g.done = done;
    await run('update_goal', { id: g.id, done });
    if (done) toast(`${icon('target', 14)} ¡Objetivo conseguido!`);
  },
  'del-goal': (el) => confirmIn(el, async () => { await run('delete_item', { type: 'goal', id: el.dataset.id }); closeCard(true); }),
  'toggle-block': (el) => { const b = byId(S.db.blocks, el.dataset.id); popCheck(el, !b.done); run('update_block', { id: b.id, done: !b.done }); },
  'del-task': (el, e) => { e.stopPropagation(); run('delete_item', { type: 'task', id: el.dataset.id }); },
  'del-block': (el) => confirmIn(el, async () => { await run('delete_item', { type: 'block', id: el.dataset.id }); closeCard(true); }),
  'del-ms': (el) => confirmIn(el, async () => { await run('delete_item', { type: 'milestone', id: el.dataset.id }); closeCard(true); }),
  'del-topic': (el, e) => { e.stopPropagation(); confirmIn(el, () => run('delete_item', { type: 'topic', id: el.dataset.id })); },
  'del-project': (el) => confirmIn(el, () => run('delete_item', { type: 'project', id: el.dataset.id })),
  fold: (el, e) => { if (e.target.closest('[data-act="del-topic"]')) return; const id = el.dataset.id; ui.closed.has(id) ? ui.closed.delete(id) : ui.closed.add(id); localStorage.setItem('closed', JSON.stringify([...ui.closed])); updateCard(); },
  'day-status': async (el) => {
    const cur = S.db.days[el.dataset.date]?.status;
    const s = cur === el.dataset.s ? '' : el.dataset.s;
    await run('set_day_status', { date: el.dataset.date, status: s });
    if (s === 'ok') toast(`${icon('check', 14)} ¡Al día! Sigue así`);
  },
  rollover: async () => { const out = await run('rollover_pending', {}); toast(out.moved.length ? `${icon('redo', 14)} ${out.moved.length} tarea${out.moved.length > 1 ? 's' : ''} al siguiente bloque` : 'No había nada pendiente'); },
  'how-close': () => closeHow(),
  'how-view': (el) => openHow(el.dataset.v),
  'how-open-ms': async (el) => {
    if (S.web) {
      const m = byId(S.db.milestones, el.dataset.id);
      if (m) ui.month = m.date.slice(0, 8) + '01'; // al volver, el calendario está en su mes
      refresh();
      return navTo({ k: 'card', v: { type: 'ms', id: el.dataset.id } });
    }
    closeHow();
    const m = byId(S.db.milestones, el.dataset.id);
    const mon = m.date.slice(0, 8) + '01';
    if (mon !== ui.month) await goMonth(mon, 1);
    setTimeout(() => { const bar = $(`[data-key^="ms-${m.id}-"]`); if (bar) openCard({ type: 'ms', id: m.id }, bar); }, 420);
  },
  login: () => { api.login(); toast('Inicia sesión en la ventana que se ha abierto y luego pulsa «Comprobar»', 5000); },
  'pick-color': (el) => {
    const open = $('.how-body .palette');
    const next = ui.colorFor === el.dataset.id ? null : el.dataset.id;
    const apply = () => ((ui.colorFor = next), renderHow());
    if (!open) return apply();
    open.classList.add('folding');
    setTimeout(apply, 180);
  },
  'set-color': async (el) => {
    // El color cambia al instante (con transición) y la paleta se pliega; el resto no se mueve
    const btn = $(`.how-body .color-btn[data-id="${el.dataset.id}"]`);
    btn?.style.setProperty('--c', el.dataset.c);
    $$('.palette button', el.parentNode).forEach((b) => b.classList.toggle('on', b === el));
    el.parentNode.classList.add('folding');
    await run(el.dataset.kind === 'sub' ? 'update_subscription' : el.dataset.kind === 'todoList' ? 'update_todo_list' : 'update_project', { id: el.dataset.id, color: el.dataset.c });
    setTimeout(async () => {
      ui.colorFor = null;
      await refresh();
      renderHow(true);
    }, 200);
  },
  'layer-menu': (_el, e) => { e.stopPropagation(); ui.layerMenu = !ui.layerMenu; renderHead(); },
  'set-layer': (el, e) => {
    const ids = layerOrder();
    // Varias a la vez: en el móvil cada toque marca o desmarca; en el PC, con Ctrl o Mayús
    if (el.dataset.id !== 'all' && el.closest?.('.layer-menu') && (S.web || e?.ctrlKey || e?.shiftKey || e?.metaKey)) {
      const cur = selLayers();
      const next = cur.includes(el.dataset.id) ? cur.filter((x) => x !== el.dataset.id) : [...cur, el.dataset.id];
      ui.layer = next.length ? next.join(',') : 'all';
      localStorage.setItem('layer', ui.layer);
      e?.stopPropagation?.();
      renderHead(); // el menú sigue abierto
      return renderCal();
    }
    if (S.web) { ui.layer = el.dataset.id; ui.layerMenu = false; localStorage.setItem('layer', ui.layer); renderHead(); }
    else rollLayer(el.dataset.id, ids.indexOf(el.dataset.id) < ids.indexOf(ui.layer) ? -1 : 1);
    renderCal(1);
    toast(`${icon('layers', 14)} ${esc(activeLayer()?.name || 'Todo')}`);
  },
  'manage-layers': () => { ui.layerMenu = false; renderHead(); openHow('organize'); setTimeout(() => { const el = $('#sec-layers'); el && $('.how-body').scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' }); }, 450); },
  'layer-toggle': async (el) => {
    const l = byId(S.db.layers, el.dataset.layer);
    const k = el.dataset.kind, id = el.dataset.id;
    const cats = (pid) => (byId(S.db.projects, pid)?.categories || []).map((c) => c.id);
    const lc = l.categoryIds || [];
    let patch;
    if (k === 'category') {
      const pid = el.dataset.project;
      if (l.projectIds.includes(pid)) // el proyecto estaba entero: queda todo menos esta subcategoría
        patch = { projectIds: l.projectIds.filter((x) => x !== pid), categoryIds: [...new Set([...lc, ...cats(pid).filter((c) => c !== id)])] };
      else {
        const next = lc.includes(id) ? lc.filter((x) => x !== id) : [...lc, id];
        const all = cats(pid).every((c) => next.includes(c)); // todas marcadas: pasa a proyecto entero
        patch = all ? { projectIds: [...l.projectIds, pid], categoryIds: next.filter((c) => !cats(pid).includes(c)) } : { categoryIds: next };
      }
    } else if (k === 'project') {
      const on = l.projectIds.includes(id);
      patch = { projectIds: on ? l.projectIds.filter((x) => x !== id) : [...l.projectIds, id], categoryIds: lc.filter((c) => !cats(id).includes(c)) };
    } else patch = k === 'loose' ? { includeLoose: !l.includeLoose }
      : { subscriptionIds: l.subscriptionIds.includes(id) ? l.subscriptionIds.filter((x) => x !== id) : [...l.subscriptionIds, id] };
    el.classList.toggle('on');
    await run('update_layer', { id: l.id, ...patch });
    await refresh();
    renderHow(true);
  },
  'del-layer': (el) => confirmIn(el, async () => { await run('delete_item', { type: 'layer', id: el.dataset.id }); if (selLayers().includes(el.dataset.id)) { ui.layer = selLayers().filter((x) => x !== el.dataset.id).join(',') || 'all'; localStorage.setItem('layer', ui.layer); } await refresh(); renderHow(true); }),
  'add-sub': async () => {
    const name = $('[data-sub-name]').value.trim(), url = $('[data-sub-url]').value.trim();
    if (!name || !url) return toast('Pon nombre y URL del calendario');
    const s = await run('add_subscription', { name, url, layerIds: selLayers() });
    toast(`${icon('cal', 14)} Descargando «${esc(name)}»…`);
    await refresh();
    renderHow(true);
    await api.refreshSubs(s.id);
    await refresh();
    renderHow(true);
  },
  'refresh-sub': async (el) => { el.classList.add('spin'); await api.refreshSubs(el.dataset.id); await refresh(); renderHow(true); },
  'del-sub': (el) => confirmIn(el, async () => { await run('delete_item', { type: 'subscription', id: el.dataset.id }); await refresh(); renderHow(true); }),
  'cloud-pw': () => { ui.pwOpen = true; ui.pwMsg = null; renderHow(true); setTimeout(() => $('[data-new-pw]')?.focus(), 80); },
  'cloud-setpw': async () => {
    const pw = $('[data-new-pw]')?.value || '';
    const show = (msg) => { ui.pwMsg = msg; const box = $('[data-key="pw-change"] .cloud-msg'); if (box) (box.className = 'cloud-msg ' + msg.kind), (box.textContent = msg.text); };
    if (pw.length < 6) return show({ kind: 'err', text: 'Mínimo 6 caracteres.' });
    try {
      await api.cloudSetPassword(pw);
      show({ kind: 'ok', text: 'Contraseña cambiada. Úsala para entrar en el móvil.' });
      setTimeout(() => { ui.pwOpen = false; ui.pwMsg = null; renderHow(true); }, 2500);
    } catch (e) {
      show({ kind: 'err', text: cleanErr(e) });
    }
  },
  'cloud-signin': () => cloudAuth('in'),
  'cloud-signup': () => cloudAuth('up'),
  'cloud-sync': async () => { await api.cloudSync(); await refresh(); renderHow(true); },
  'cloud-signout': (el) => confirmIn(el, async () => { await api.cloudSignOut(); await refresh(); renderHow(true); }),
  'how-open': () => openHow(),
  'rm-go': () => { ui.rm.list = ui.rm.list || null; openHow('todo'); },
  'rm-open': (el) => { if (S.web) return navTo({ k: 'how', view: 'todo', list: el.dataset.l || null }); ui.rm.list = el.dataset.l || null; ui.rm.detail = null; ui.rm.draft = null; ui.rm.q = ''; ui.colorFor = null; renderHow(true); $('.how-body').scrollTop = 0; },
  'rm-check': (el) => rmToggle(el, el.dataset.id),
  'rm-toggle': (el) => rmToggle(el, el.dataset.id),
  'rm-fold': async (el) => { const t = byId(rmAll(), el.dataset.id); await run('update_todo', { id: t.id, collapsed: !t.collapsed }); rmReload(); },
  'rm-detail': (el) => { ui.rm.detail = ui.rm.detail === el.dataset.id ? null : el.dataset.id; renderHow(true); },
  'rm-new': () => rmStartDraft(null),
  'rm-showdone': () => { ui.rm.showDone = !ui.rm.showDone; renderHow(true); },
  'rm-due': async (el) => { await run('update_todo', { id: el.dataset.id, due: el.dataset.v === '' ? '' : addDays(S.today, +el.dataset.v) }); rmReload(); },
  'rm-pri': async (el) => { await run('update_todo', { id: el.dataset.id, priority: +el.dataset.v }); rmReload(); },
  'rm-flag': async (el) => { const t = byId(rmAll(), el.dataset.id); await run('update_todo', { id: t.id, flagged: !t.flagged }); rmReload(); },
  'rm-indent': async (el) => { try { await run('indent_todo', { id: el.dataset.id, outdent: !!el.dataset.out }); } catch {} rmReload(); },
  'rm-del': async (el) => { if (ui.rm.detail === el.dataset.id) ui.rm.detail = null; await run('delete_item', { type: 'todo', id: el.dataset.id }); rmReload(); },
  'rm-goto': (el) => { const t = byId(rmAll(), el.dataset.id); if (!t) return; if (S.web) return navTo({ k: 'how', view: 'todo', list: t.listId || 'inbox', detail: t.id }); ui.rm.list = t.listId || 'inbox'; ui.rm.detail = t.id; openHow('todo'); },
  'rm-list-menu': (el, e) => {
    const id = el.dataset.id;
    const r = el.getBoundingClientRect();
    openCtx(r.left, r.bottom + 4, [
      { label: 'Cambiar color', icon: 'sun', run: () => { ui.colorFor = ui.colorFor === id ? null : id; renderHow(true); } },
      { label: ui.rm.showDone ? 'Ocultar completados' : 'Mostrar completados', icon: 'check', run: () => actions['rm-showdone']() },
      '-',
      { label: 'Eliminar lista y sus recordatorios', icon: 'trash', danger: true, run: async () => { await run('delete_item', { type: 'todoList', id }); if (S.web) return navBack(); ui.rm.list = null; rmReload(); } },
    ]);
  },
  'mcp-create': (el) => {
    const go = async () => {
      el.disabled = true;
      try {
        const url = await api.mcpLinkCreate();
        api.copy(url);
        toast(`${icon('check', 14)} Enlace creado y copiado`, 3500);
      } catch (e) { toast(esc(cleanErr(e)), 4000); }
      loadMcp();
    };
    return mcpCache ? confirmIn(el, go) : go();
  },
  'mcp-copy': () => { if (mcpCache?.url) { api.copy(mcpCache.url); toast(`${icon('check', 14)} Enlace copiado`); } },
  'mcp-revoke': (el) => confirmIn(el, async () => { await api.mcpLinkRevoke(); toast('Enlace desactivado'); loadMcp(); }),
  'mcp-reload': () => loadMcp(),
  'del-cat': (el) => confirmIn(el, async () => { await run('update_project', { id: el.dataset.project, removeCategoryIds: [el.dataset.id] }); await refresh(); renderHow(true); }),
  'link-open': (el, e) => {
    e.stopPropagation();
    if (ui.card) { const back = ui.card; swapCard({ type: 'link', id: el.dataset.id }); ui.card.back = back; return $('#card').classList.toggle('has-back', true); }
    if (ui.how === 'open') closeHow();
    openCard({ type: 'link', id: el.dataset.id }, el);
  },
  unlink: async (el, e) => {
    e.stopPropagation();
    await run('link_progress', { [el.dataset.kind === 'topic' ? 'topicId' : 'taskId']: el.dataset.target, remove: [el.dataset.id] });
    await refresh();
  },
  'check-account': async () => { const a = await api.checkAccount(); toast(a.ok ? `${icon('check', 14)} Cuenta de Claude conectada` : 'No hay sesión de Claude en este PC'); await refresh(); renderHow(); },
  'pin-mem': async (el) => { await api.pinMemory(el.dataset.id, !!el.dataset.on); memCache = await api.memories(); renderHow(); },
  forget: async (el) => { await api.forget(el.dataset.id); memCache = await api.memories(); renderHow(); },
  'copy-mcp': async () => { api.copy(JSON.stringify(await api.mcpConfig(), null, 2)); toast(`${icon('check', 14)} Configuración MCP copiada`); },
  'install-skill': async () => { const p = await api.installSkill(); toast(`${icon('check', 14)} Skill instalada en ${esc(p)}`, 4000); },
  'agent-send': () => sendAgent(),
  // Móvil: Claude se abre con el mensaje escrito y usa el conector del calendario
  'ai-send': () => {
    const box = $('[data-ai-text]');
    const text = (box?.value || '').trim();
    if (!text) return box?.focus();
    const msg = `Usa mi conector «Golden's Calendar». ${text}`;
    api.copy(msg); // por si Claude no lo recoge del enlace: basta con pegarlo
    window.open('https://claude.ai/new?q=' + encodeURIComponent(msg), '_blank', 'noopener');
    ui.aiDraft = '';
    box.value = '';
    toast(`${icon('spark', 14)} Abriendo Claude · el mensaje también está copiado`, 3500);
  },
  'ai-open': () => openHow('ai'),
  'ai-suggest': (el) => {
    const box = $('[data-ai-text]');
    box.value = ui.aiDraft = el.dataset.q;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  },
};
// Muestra el estado del inicio de sesión dentro de la propia tarjeta (no en un aviso que quede tapado)
function cloudStatus(msg, busy = null) {
  ui.cloudMsg = msg;
  ui.cloudBusy = busy;
  for (const box of $$('.cloud-msg')) {
    box.className = 'cloud-msg ' + (msg?.kind || '');
    box.textContent = msg?.text || '';
  }
  for (const b of $$('[data-act="cloud-signin"], [data-act="cloud-signup"]')) {
    b.disabled = !!busy;
    b.textContent = b.dataset.act === 'cloud-signin' ? (busy === 'in' ? 'Entrando…' : 'Entrar') : busy === 'up' ? 'Creando…' : 'Crear cuenta';
  }
}
async function cloudAuth(kind) {
  // Los campos de la tarjeta que se está usando (la de entrada en el móvil o la de Ajustes)
  const scope = document.activeElement?.closest?.('#login, .how-body') || $('#login') || $('.how-body') || document;
  const email = (scope.querySelector('[data-cloud-email]')?.value || '').trim().toLowerCase();
  const pw = scope.querySelector('[data-cloud-pw]')?.value || '';
  if (!/^\S+@\S+\.\S+$/.test(email)) return cloudStatus({ kind: 'err', text: 'Escribe un email válido.' });
  if (pw.length < 6) return cloudStatus({ kind: 'err', text: 'La contraseña debe tener al menos 6 caracteres.' });
  ui.cloudEmail = email;
  cloudStatus(null, kind);
  try {
    await (kind === 'up' ? api.cloudSignUp(email, pw) : api.cloudSignIn(email, pw));
    cloudStatus({ kind: 'ok', text: kind === 'up' ? 'Cuenta creada. Sincronizando…' : 'Dentro. Sincronizando…' });
    toast(`${icon('check', 14)} ${kind === 'up' ? 'Cuenta creada' : 'Conectado'}: sincronizando`);
    await refresh();
    renderHow(true);
    setTimeout(() => cloudStatus(null), 1500);
  } catch (e) {
    cloudStatus({ kind: 'err', text: cleanErr(e) || 'No se pudo conectar. Revisa la conexión e inténtalo otra vez.' });
  }
}
const cleanErr = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// Confirmación en el propio botón (pulsar dos veces)
function confirmIn(el, fn) {
  if (el.dataset.armed) return fn();
  el.dataset.armed = '1';
  const old = el.innerHTML;
  el.innerHTML = '¿Seguro?';
  Object.assign(el.style, { width: 'auto', padding: '0 8px', color: 'var(--late)' });
  el.animate([{ transform: 'scale(0.85)' }, { transform: 'none' }], { duration: 400, easing: SPRING });
  setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.innerHTML = old; Object.assign(el.style, { width: '', padding: '', color: '' }); } }, 2600);
}

document.addEventListener('click', (e) => {
  if (ui.suppressClick) return (ui.suppressClick = false); // el clic que cierra un arrastre o una pulsación larga
  if (e.target.closest('.ctx')) return;
  if (S?.web && e.target.closest('[data-back]')) return navBack(); // «‹ Atrás» del móvil: el historial del navegador
  const seg = e.target.closest('[data-seg] button');
  if (seg && !seg.dataset.act) {
    const wrap = seg.closest('[data-seg]');
    $$('button', wrap).forEach((b) => b.classList.toggle('on', b === seg));
    const hidden = $('input[type=hidden]', wrap);
    if (hidden) hidden.value = seg.dataset.v;
    if (wrap.dataset.live === 'theme') api.setSettings({ theme: seg.dataset.v });
    if (wrap.dataset.live === 'glass') api.setSettings({ glass: seg.dataset.v }).then(refresh).then(() => renderHow());
    if (wrap.dataset.live === 'mode') api.setSettings({ mode: seg.dataset.v }).then(refresh).then(() => renderHow());
    return;
  }
  if (e.target.closest('#agent') && !ui.agentOpen) return openAgent();
  if (e.target.closest('#how') && ui.how === 'near') return openHow();
  if (ui.reply && !e.target.closest('#reply, #agent')) hideReply();
  if (ui.layerMenu && !e.target.closest('.layer-menu, .layer-pill')) { ui.layerMenu = false; renderHead(); }
  if (ui.card && !S.web && !e.target.closest('#card, #how')) return closeCard(); // primer clic fuera: solo cerrar
  const el = e.target.closest('[data-act]');
  if (el) actions[el.dataset.act]?.(el, e);
});

// Opacidad en vivo mientras arrastras; se guarda al soltar
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-opacity]')) document.documentElement.style.setProperty('--alpha', e.target.value);
});
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-opacity]')) api.setSettings({ opacity: +e.target.value }).then(() => (S.db.settings.opacity = +e.target.value));
});

// Ajustes en vivo y formularios dependientes
document.addEventListener('change', async (e) => {
  if (e.target.dataset?.layerName && e.target.value.trim()) return run('update_layer', { id: e.target.dataset.layerName, name: e.target.value.trim() });
  if (e.target.dataset?.catName && e.target.value.trim()) return run('update_project', { id: e.target.dataset.project, renameCategory: { id: e.target.dataset.catName, name: e.target.value.trim() } });
  const s = e.target.dataset?.setting;
  if (s) { await api.setSettings({ [s]: e.target.checked }); await refresh(); }
  const t = e.target.dataset?.settingText;
  if (t && e.target.value.trim()) await api.setSettings({ [t]: e.target.value.trim() });
  const f = e.target.closest('form[data-form]');
  if (f && (e.target.name === 'projectId' || e.target.name === 'goalProject')) {
    const cf = $('[data-catfield]', f);
    if (cf) { const pid = e.target.value; $('select', cf).innerHTML = catOptions(pid, ''); cf.hidden = !(byId(S.db.projects, pid)?.categories || []).length; }
  }
  if (f && e.target.name === 'milestoneId' && e.target.value) {
    const cid = byId(S.db.milestones, e.target.value)?.categoryId;
    if (cid && f.categoryId) f.categoryId.value = cid;
  }
  if (f && e.target.name === 'projectId') {
    const isNew = e.target.value === '__new';
    $('[data-newproj]', f).hidden = !isNew;
    if (f.milestoneId) f.milestoneId.innerHTML = isNew ? '' : msOptions(e.target.value);
    const pick = $('[data-pick]', f);
    if (pick) pick.innerHTML = isNew ? '' : pickTasks(e.target.value, '', [], null);
  }
  if (f && e.target.name === 'milestoneId') {
    const keep = $$('input[name=taskIds]:checked', f).map((i) => i.value);
    $('[data-pick]', f).innerHTML = pickTasks(f.projectId.value, e.target.value, keep, null);
    if (!f.title.value && e.target.value) f.title.value = 'Estudiar · ' + byId(S.db.milestones, e.target.value).title;
  }
});

// Formularios de la tarjeta
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  const d = Object.fromEntries(fd);
  const taskIds = fd.getAll('taskIds');
  const ensureProject = async () => {
    if (d.projectId && d.projectId !== '__new') return d.projectId;
    if (!d.newProject?.trim()) { toast('Pon nombre al proyecto nuevo'); throw new Error('sin proyecto'); }
    return (await run('create_project', { name: d.newProject.trim() })).id;
  };
  try {
    if (f.dataset.form === 'project') {
      await run('create_project', { name: d.name, kind: d.kind, color: d.color });
      toast(`${icon('check', 14)} Proyecto creado`);
      closeCard();
    }
    if (f.dataset.form === 'ms') {
      if (f.dataset.id) {
        await run('update_milestone', { id: f.dataset.id, title: d.title, date: d.date, kind: d.kind, time: d.time, categoryId: d.categoryId ?? undefined, blocking: !!d.blocking });
        await refresh();
        return swapCard({ type: 'ms', id: f.dataset.id });
      }
      const projectId = await ensureProject();
      const m = await run('create_milestone', { projectId, title: d.title, date: d.date, kind: d.kind, time: d.time, categoryId: d.categoryId || undefined, blocking: !!d.blocking || undefined });
      for (const t of (d.topics || '').split('\n').map((s) => s.trim()).filter(Boolean)) await run('add_topic', { projectId, milestoneId: m.id, title: t });
      toast(`${icon('check', 14)} ${KIND_LABEL[d.kind]} añadido`);
      await refresh();
      swapCard({ type: 'ms', id: m.id });
    }
    if (f.dataset.form === 'block') {
      if (f.dataset.id) {
        const was = S.db.tasks.filter((t) => t.blockId === f.dataset.id).map((t) => t.id);
        for (const id of was.filter((x) => !taskIds.includes(x))) await run('update_task', { id, blockId: '' });
        await run('update_block', { id: f.dataset.id, title: d.title, date: d.date, endDate: d.endDate || '', start: d.start || '', end: d.end || '', taskIds, categoryId: d.categoryId ?? undefined, blocking: !!d.blocking, event: !!d.event, fixed: !!d.fixed });
        await refresh();
        return swapCard({ type: 'block', id: f.dataset.id });
      }
      const projectId = await ensureProject();
      const b = await run('create_block', { projectId, milestoneId: d.milestoneId || undefined, categoryId: d.categoryId || undefined, blocking: !!d.blocking || undefined, event: d.event ? true : undefined, fixed: d.fixed ? true : undefined, title: d.title, date: d.date, endDate: d.endDate || undefined, start: d.start || undefined, end: d.end || undefined, taskIds });
      toast(b.sumsTo?.length ? `${icon('layers', 14)} Bloque creado · suma a ${b.sumsTo.map(esc).join(', ')}` : `${icon('check', 14)} Bloque creado`, b.sumsTo?.length ? 4500 : 2600);
      await refresh();
      swapCard({ type: 'block', id: b.id });
    }
    if (f.dataset.form === 'goal') {
      const input = { title: d.title, date: d.date, time: d.time || '', projectId: d.goalProject || '', notes: d.notes || '', categoryId: d.goalProject ? d.categoryId || '' : '', blocking: !!d.blocking };
      const g = f.dataset.id ? await run('update_goal', { id: f.dataset.id, ...input }) : await run('create_goal', { ...input, time: d.time || undefined, projectId: d.goalProject || undefined, categoryId: d.goalProject && d.categoryId ? d.categoryId : undefined });
      if (!f.dataset.id) toast(`${icon('target', 14)} Objetivo marcado`);
      await refresh();
      return swapCard({ type: 'goal', id: g.id });
    }
    if (f.dataset.form === 'link') {
      const target = f.dataset.topic ? byId(S.db.topics, f.dataset.topic) : byId(S.db.tasks, f.dataset.task);
      const want = new Set(fd.getAll('ref'));
      const had = new Set((target.requires || []).map((r) => r.type + ':' + r.id));
      const add = [...want].filter((k) => !had.has(k)).map((k) => ({ type: k.split(':')[0], id: k.split(':')[1] }));
      const remove = [...had].filter((k) => !want.has(k)).map((k) => k.split(':')[1]);
      await run('link_progress', { topicId: f.dataset.topic || undefined, taskId: f.dataset.task || undefined, add, remove });
      await refresh();
      return actions['card-back']();
    }
    if (f.dataset.form === 'plan') {
      const out = await run('plan_study', { milestoneId: f.dataset.id, from: d.from, reviewDays: +d.reviewDays, skipWeekends: !!d.skipWeekends, start: d.start || undefined, end: d.end || undefined });
      toast(`${icon('wand', 14)} ${out.created} bloques · ~${out.perDay}/día`);
      await refresh();
      swapCard({ type: 'ms', id: f.dataset.id });
    }
  } catch {}
});

// Añadir en línea (Enter) y teclado
document.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && e.target.matches?.('.cat-name')) return e.target.blur();
  const inp = e.target.closest?.('.inline-add, .cat-add');
  if (inp && e.key === 'Enter' && inp.value.trim()) {
    const v = inp.value.trim();
    inp.value = '';
    const kind = inp.dataset.add;
    if (kind === 'task') await run('add_tasks', { topicId: inp.dataset.topic, titles: v.split(/\s*;\s*/) });
    if (kind === 'topic') await run('add_topic', { projectId: inp.dataset.project, milestoneId: inp.dataset.ms || undefined, title: v });
    if (kind === 'category') {
      await run('update_project', { id: inp.dataset.project, addCategories: v.split(/\s*[,;]\s*/) });
      await refresh();
      renderHow(true);
      $(`.how-body [data-key="catadd-${inp.dataset.project}"]`)?.focus();
      return;
    }
    if (kind === 'todo-list') {
      const l = await run('create_todo_list', { name: v });
      await refresh();
      if (S.web) return navTo({ k: 'how', view: 'todo', list: l.id }, { sync: true, after: () => rmStartDraft(null) });
      ui.rm.list = l.id;
      return rmStartDraft(null);
    }
    if (kind === 'layer') {
      await run('create_layer', { name: v, projectIds: [] });
      await refresh();
      renderHow(true);
      $('.how-body [data-key="addlayer"]')?.focus();
      return;
    }
    if (kind === 'project') {
      const p = await run('create_project', { name: v });
      ui.colorFor = p.id; // abre su paleta para elegir color al momento
      await refresh();
      renderHow(true);
      $('.how-body [data-key="addproj"]')?.focus();
      toast(`${icon('check', 14)} «${esc(v)}» creado · elige su color`);
    }
    if (kind === 'block-task') {
      const b = byId(S.db.blocks, inp.dataset.id);
      let topicId = S.db.tasks.find((t) => t.blockId === b.id)?.topicId;
      if (!topicId) topicId = (await run('add_topic', { projectId: b.projectId, milestoneId: b.milestoneId || undefined, title: b.title })).id;
      await run('add_tasks', { topicId, titles: v.split(/\s*;\s*/), blockId: b.id });
    }
    return;
  }
  if (inp && e.key === 'Escape') return inp.blur();
  if (e.key === 'Enter' && e.target.matches?.('[data-cloud-email], [data-cloud-pw]')) return cloudAuth('in');
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches?.('[data-ai-text]')) return e.preventDefault(), actions['ai-send']();
  if (e.key === 'Escape') return escapeCascade(e.target);
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'ArrowLeft') changeMonth(-1);
  else if (e.key === 'ArrowRight') changeMonth(1);
  else if (e.key === '/') { e.preventDefault(); openAgent(); }
  else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) actions['rm-go']();
  else if (e.key.toLowerCase() === 'w' && !e.ctrlKey && !e.metaKey) actions['toggle-view']();
});

// Móvil: el mes sigue al dedo (ver monthSwipeInit)
monthSwipeInit();

// Rueda = cambiar de mes. Sin bloqueo: cada muesca cuenta aunque siga la animación;
// el touchpad acumula delta hasta sumar una muesca. En la vista semanal, dentro de las horas
// la rueda desplaza en vertical; fuera de ellas (cabecera, días, todo el día) corre un día
let wheelAcc = 0, wheelT;
$('#widget').addEventListener('wheel', (e) => {
  if (ui.card) return;
  const t = e.target;
  if (ui.view === 'week') {
    if (t.closest('.wk-body, .layer-wheel') || !t.closest('#cal, #head, #weekdays')) return;
  } else if (!t.closest('#cal')) return;
  const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // en líneas → px
  if (!dy) return;
  clearTimeout(wheelT);
  wheelT = setTimeout(() => (wheelAcc = 0), 250);
  const step = (d) => (ui.view === 'week' && !S?.web ? stepDays(d) : changeMonth(d)); // en la semana, un día
  if (Math.abs(dy) >= 50) { wheelAcc = 0; return step(Math.sign(dy)); } // muesca de ratón = un mes (o un día)
  if (Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0; // cambio de sentido: responde al instante
  wheelAcc += dy;
  while (Math.abs(wheelAcc) >= 80) {
    const d = Math.sign(wheelAcc);
    wheelAcc -= d * 80;
    step(d);
  }
}, { passive: true });
function changeMonth(d) {
  if (ui.view === 'week') return changeWeek(d);
  const m = parse(ui.month);
  m.setMonth(m.getMonth() + d);
  return goMonth(iso(m), d);
}
let goSeq = 0;
async function goMonth(month, d) {
  if (S?.web && d && month !== ui.month && ui.view !== 'week') return carGo(month, d);
  closeCard(true);
  ui.month = month;
  const seq = ++goSeq;
  const st = await api.state(gridRange());
  if (seq !== goSeq) return; // ya se pidió otro mes: descarta esta respuesta
  S = st;
  renderHead();
  $('#mname').classList.add(d < 0 ? 'l' : 'r');
  renderCal(d);
}

const weeksEl = $('#weeks');

// Redimensionar desde la esquina + menú contextual
$('#grip').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  $('#grip').setPointerCapture(e.pointerId); // seguir el ratón aunque salga de la ventana
  const start = { x: e.screenX, y: e.screenY, w: window.outerWidth, h: window.outerHeight };
  let raf = 0;
  const sign = document.body.classList.contains('mode-tray') ? -1 : 1; // en la bandeja se tira hacia arriba-izquierda
  const move = (ev) => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; api.resize(start.w + sign * (ev.screenX - start.x), start.h + sign * (ev.screenY - start.y)); }); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setTimeout(() => api.resizeEnd(), 40); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});
let resizeT;
window.addEventListener('resize', () => { dotPos = null; clearTimeout(resizeT); resizeT = setTimeout(() => S && renderCal(), 60); });


// ---------- eventos del proceso principal ----------
let changeT;
api.onChanged(() => { clearTimeout(changeT); changeT = setTimeout(refresh, Math.max(40, ui.holdUntil - Date.now())); });
api.onBriefingNew(() => { ui.fresh = true; refresh(); });
api.onBriefingOpen(() => setTimeout(() => openHow(), 150));
api.onSettings(() => openHow('settings'));

// Cristal esmerilado: coloca el fondo de escritorio exactamente donde queda detrás del panel
let glass = null;
function placeGlass() {
  const el = $('#glass');
  if (!glass?.url || !glass.win) return;
  const d = glass.display, iw = glass.w, ih = glass.h;
  let bw, bh;
  if (glass.style === 2) [bw, bh] = [d.width, d.height]; // estirar
  else {
    const s = glass.style === 6 ? Math.min(d.width / iw, d.height / ih) : glass.style === 0 ? 1 : Math.max(d.width / iw, d.height / ih); // ajustar · centrar · rellenar
    [bw, bh] = [iw * s, ih * s];
  }
  const ox = d.x + (d.width - bw) / 2, oy = d.y + (d.height - bh) / 2;
  const w = $('#widget');
  const ex = glass.win.x + w.offsetLeft + el.offsetLeft, ey = glass.win.y + w.offsetTop + el.offsetTop; // sin transformaciones
  el.style.backgroundSize = `${bw}px ${bh}px`;
  el.style.backgroundPosition = `${ox - ex}px ${oy - ey}px`;
}
// --- Fondo: el color normal del panel; los brillos viven solo en los bordes (sobre todo abajo) y donde
// mantienes pulsado, que brota y crece mientras sigues pulsando ---
const AURORA = {
  dark: { base: [30, 30, 28], colors: [[217, 119, 87], [104, 86, 214], [34, 66, 160]], blend: 'lighter', power: 0.3 },
  light: { base: [247, 245, 239], colors: [[226, 128, 96], [140, 118, 226], [96, 146, 226]], blend: 'source-over', power: 0.22 },
};
const aur = {
  on: false, raf: 0, last: 0, t0: performance.now(), pulses: [], hold: null, trail: 0, pc: 0,
  mouse: { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, near: 0, tnear: 0 },
  // Brillos de borde: centrados fuera del panel, para que solo asome su halo
  edges: [
    { c: 0, x: 0.18, y: 1.14, r: 0.36, ax: 0.07, s: 0.05, p: 0, a: 1 },
    { c: 1, x: 0.52, y: 1.16, r: 0.4, ax: 0.09, s: 0.04, p: 2, a: 0.9 },
    { c: 2, x: 0.86, y: 1.14, r: 0.36, ax: 0.07, s: 0.06, p: 4, a: 1 },
    { c: 2, x: -0.12, y: 0.72, r: 0.24, ay: 0.06, s: 0.05, p: 1, a: 0.45 },
    { c: 1, x: 1.12, y: 0.62, r: 0.24, ay: 0.06, s: 0.04, p: 3, a: 0.45 },
  ],
};
const ease = (p) => 1 - Math.pow(1 - p, 3);
function drawAurora(now) {
  aur.raf = requestAnimationFrame(drawAurora);
  if (now - aur.last < 33) return; // ~30 fps es de sobra para algo tan suave
  aur.last = now;
  const c = $('#aurora');
  const w = $('#glass');
  const W = Math.max(8, Math.round(w.offsetWidth / 6)), H = Math.max(8, Math.round(w.offsetHeight / 6));
  if (c.width !== W || c.height !== H) [c.width, c.height] = [W, H];
  const ctx = c.getContext('2d');
  const P = matchMedia('(prefers-color-scheme: dark)').matches ? AURORA.dark : AURORA.light;
  const alpha = +getComputedStyle(document.documentElement).getPropertyValue('--alpha') || 0.55;
  const t = (now - aur.t0) / 1000;
  const m = aur.mouse;
  m.x += (m.tx - m.x) * 0.08;
  m.y += (m.ty - m.y) * 0.08;
  m.near += (m.tnear - m.near) * 0.06;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = `rgba(${P.base.join(',')},${0.6 + alpha * 0.4})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = P.blend;
  const M = Math.max(W, H);
  const blob = (x, y, r, col, a) => {
    if (a <= 0.003) return;
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * M);
    g.addColorStop(0, `rgba(${col.join(',')},${a})`);
    g.addColorStop(1, `rgba(${col.join(',')},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  // Bordes: respiran despacio; el de abajo se aviva cerca del cursor
  const bottomBoost = m.near * Math.max(0, (m.y - 0.55) / 0.45);
  for (const e of aur.edges) {
    const x = e.x + Math.sin(t * e.s + e.p) * (e.ax || 0);
    const y = e.y + Math.cos(t * e.s * 1.3 + e.p) * (e.ay || 0.015);
    const breathe = 0.85 + 0.15 * Math.sin(t * 0.5 + e.p);
    const boost = e.y > 1 ? 1 + 0.9 * bottomBoost * Math.max(0, 1 - Math.abs(m.x - x) * 2.2) : 1;
    blob(x, y, e.r * breathe, P.colors[e.c], P.power * e.a * boost);
  }
  // Mantener pulsado: brota en el punto y crece mientras sigues pulsando
  if (aur.hold) {
    const k = Math.min(1, (now - aur.hold.t0) / 1600);
    aur.hold.r = 0.03 + 0.3 * ease(k);
    aur.hold.a = 0.25 + 0.9 * ease(k);
    blob(aur.hold.x, aur.hold.y, aur.hold.r, P.colors[aur.hold.c], P.power * aur.hold.a);
  }
  aur.pulses = aur.pulses.filter((p) => now - p.t0 < p.life);
  for (const p of aur.pulses) {
    const k = (now - p.t0) / p.life;
    blob(p.x, p.y, p.r + p.grow * ease(k), P.colors[p.c], P.power * p.a * Math.pow(1 - k, 2));
  }
}
function setAurora(on) {
  aur.on = on;
  document.body.classList.toggle('aurora', on);
  cancelAnimationFrame(aur.raf);
  if (on && !document.hidden) aur.raf = requestAnimationFrame(drawAurora);
}
document.addEventListener('visibilitychange', () => setAurora(aur.on)); // se pausa con la ventana oculta
const toLocal = (e) => {
  const r = $('#glass').getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
};
window.addEventListener('pointermove', (e) => {
  if (!aur.on) return;
  const p = toLocal(e);
  Object.assign(aur.mouse, { tx: p.x, ty: p.y, tnear: 1 });
  if (aur.hold) Object.assign(aur.hold, { x: aur.hold.x + (p.x - aur.hold.x) * 0.5, y: aur.hold.y + (p.y - aur.hold.y) * 0.5 }); // el brillo acompaña al arrastrar
}, { passive: true });
document.addEventListener('pointerleave', () => (aur.mouse.tnear = 0));
window.addEventListener('blur', () => ((aur.mouse.tnear = 0), releaseHold()));
window.addEventListener('pointerdown', (e) => {
  if (!aur.on) return;
  aur.hold = { ...toLocal(e), t0: performance.now(), c: aur.pc++ % 3, r: 0.03, a: 0.25 };
}, { passive: true });
function releaseHold() {
  const h = aur.hold;
  if (!h) return;
  aur.hold = null;
  aur.pulses.push({ x: h.x, y: h.y, r: h.r, grow: 0.06, a: h.a, c: h.c, t0: performance.now(), life: 700 }); // se apaga suave al soltar
}
['pointerup', 'pointercancel'].forEach((ev) => window.addEventListener(ev, releaseHold, { passive: true }));

api.onGlass((g) => {
  glass = { ...glass, ...g };
  const mode = !g.mode || g.mode === 'live' ? 'aurora' : g.mode;
  setAurora(mode === 'aurora');
  if (g.url) $('#glass').style.backgroundImage = `url("${g.url}")`;
  if (mode === 'aurora' || g.url) document.body.classList.add('has-glass');
  placeGlass();
});
window.addEventListener('resize', () => placeGlass());
// Modo bandeja: animación de entrada/salida del panel
api.onMode((m) => { document.body.className = document.body.className.replace(/\bmode-\w+/g, '') + ' mode-' + m; });
api.onFlyout(({ show, from }) => {
  const w = $('#widget');
  const off = { bottom: ['0', '24px'], top: ['0', '-24px'], left: ['-24px', '0'], right: ['24px', '0'] }[from || 'bottom'];
  w.style.setProperty('--fx', off[0]);
  w.style.setProperty('--fy', off[1]);
  w.classList.remove('fly-in', 'fly-out');
  void w.offsetWidth;
  w.classList.add(show ? 'fly-in' : 'fly-out');
  if (show) { dotPos = null; refresh(); }
  else { closeCard(true); if (ui.how === 'open') closeHow(); }
});

// ---------- arranque ----------
(async () => {
  document.body.classList.add('glass-' + (new URLSearchParams(location.search).get('glass') || 'clear'));
  const now = new Date();
  ui.month = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  if (ui.view === 'week') ui.weekStart = mondayOf(iso(now));
  renderDots();
  await refresh();
  if (S.web) navInit(); // en el móvil, la pantalla que diga el historial (por si se recargó con una abierta)
})();


// ================= Interacción propia =================

// ---------- Onda al pulsar ----------
const RIPPLE = 'button, .list-row, .task, .pchip, .bar, .cell, .layer-pill, .topic-h, .goal-check, .color-btn, .ctx-item, .how.near, .agent:not(.open)';
window.addEventListener('pointerdown', (e) => {
  if (S?.web) return; // en el móvil, la respuesta al toque es la de iOS (atenuar/encoger con :active), sin trabajo extra por toque
  const el = e.target.closest(RIPPLE);
  if (!el || e.target.closest('input, textarea, select')) return;
  if (el.matches('.rm-check, .rm-fold, .rm-info, .rm-bar button') || (S?.web && el.matches('.cell, .bar, .acheck, .rm-tile, .rm-lrow, .df-add button'))) return; // en el móvil, la pulsación propia de iOS
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const clip = document.createElement('div');
  clip.className = 'ripple-clip';
  Object.assign(clip.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: cs.borderRadius, clipPath: `inset(0 round ${cs.borderRadius})`, color: el.matches('.bar, .btn.primary, .agent') ? '#fff' : 'var(--accent)' });
  const d = Math.hypot(r.width, r.height) * 2;
  const dot = document.createElement('i');
  Object.assign(dot.style, { width: d + 'px', height: d + 'px', left: e.clientX - r.left - d / 2 + 'px', top: e.clientY - r.top - d / 2 + 'px' });
  clip.appendChild(dot);
  document.body.appendChild(clip);
  dot.animate([{ transform: 'scale(0)', opacity: 0.28 }, { transform: 'scale(1)', opacity: 0 }], { duration: 650, easing: OUT }).onfinish = () => clip.remove();
}, { passive: true });

// ---------- Fuera lo predeterminado del navegador/Electron ----------
document.addEventListener('dragstart', (e) => e.preventDefault()); // nada de "fantasmas" de arrastre nativos
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault()); // soltar un archivo no abre nada
document.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault()); // sin autodesplazamiento con la rueda
window.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false }); // sin zoom
document.addEventListener('keydown', (e) => {
  const typing = e.target.matches?.('input, textarea');
  if (e.ctrlKey && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
  if (e.ctrlKey && e.key.toLowerCase() === 'a' && !typing) e.preventDefault();
  if (e.key === 'Escape' && $('.ctx')) closeCtx();
});
document.addEventListener('dblclick', (e) => {
  if (e.target.closest('input, textarea')) return;
  getSelection()?.removeAllRanges();
  const cell = e.target.closest('.cell');
  if (cell && !e.target.closest('.bar')) { if (ui.card) closeCard(true); openCard({ type: 'new-block', date: cell.dataset.date }, cell); } // doble clic en un día: bloque nuevo
});

// Escape: cierra por orden lo que haya abierto y, si no queda nada, el calendario (como el notch).
// Llega por el teclado o, sin foco, por la tecla global del proceso principal.
function escapeCascade(target = document.activeElement) {
  if ($('.ctx')) return closeCtx();
  if (ui.agentOpen && document.activeElement?.id === 'agent-in') return closeAgent();
  if (target?.matches?.('input, textarea, select') && target !== document.body) return target.blur();
  if (ui.card) return closeCard();
  if (ui.how === 'open') return closeHow();
  if (ui.reply) return hideReply();
  if (ui.layerMenu) { ui.layerMenu = false; return renderHead(); }
  if (!S.web) api.win('hide');
}
api.onEscape(() => escapeCascade());
// Con el ratón encima del calendario, Escape funciona aunque no tenga el foco
document.addEventListener('mouseenter', () => api.escHover(true));
document.addEventListener('mouseleave', () => api.escHover(false));

// ---------- Menú contextual propio ----------
function closeCtx() {
  const m = $('.ctx');
  if (!m) return;
  m.classList.add('out');
  setTimeout(() => m.remove(), 140);
}
function openCtx(x, y, items) {
  $('.ctx')?.remove();
  if (!items.length) return;
  const m = document.createElement('div');
  m.className = 'ctx';
  let n = 0;
  m.innerHTML = items.map((it, i) => it === '-' ? '<div class="ctx-sep"></div>' : it.h ? `<div class="ctx-h">${esc(it.h)}</div>`
    : `<button class="ctx-item ${it.on ? 'on' : ''} ${it.danger ? 'danger' : ''}" data-i="${i}" style="--n:${n++}">${icon(it.icon || 'arrow', 14)}<span>${esc(it.label)}</span>${it.k ? `<span class="k">${esc(it.k)}</span>` : ''}</button>`).join('');
  document.body.appendChild(m);
  const W = innerWidth, H = innerHeight, r = m.getBoundingClientRect();
  const left = x + r.width > W - 8 ? x - r.width : x, top = y + r.height > H - 8 ? Math.max(8, y - r.height) : y;
  Object.assign(m.style, { left: Math.max(8, left) + 'px', top: top + 'px', transformOrigin: `${left < x ? 'right' : 'left'} ${top < y ? 'bottom' : 'top'}` });
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('.ctx-item');
    if (!b) return;
    const it = items[+b.dataset.i];
    if (it.danger && !b.classList.contains('armed')) { // los borrados piden una segunda pulsación
      b.classList.add('armed');
      b.querySelector('span').textContent = 'Pulsa otra vez para confirmar';
      return;
    }
    closeCtx();
    await it.run();
  });
}
document.addEventListener('pointerdown', (e) => { if ($('.ctx') && !e.target.closest('.ctx')) closeCtx(); }, true);
window.addEventListener('blur', closeCtx);

async function editText(el, op) {
  el.focus();
  if (op === 'all') return el.select();
  const [a, b] = [el.selectionStart, el.selectionEnd];
  const sel = el.value.slice(a, b);
  if (op === 'copy' || op === 'cut') await navigator.clipboard.writeText(sel);
  if (op === 'cut') el.setRangeText('', a, b, 'end');
  if (op === 'paste') el.setRangeText(await navigator.clipboard.readText(), a, b, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const MODES = [['tray', 'En la bandeja', 'sun'], ['desk', 'Fijado al escritorio', 'pin'], ['top', 'Siempre visible', 'layers'], ['win', 'Ventana normal', 'cal']];
function ctxFor(target) {
  const field = target.closest('input, textarea');
  if (field) return [
    { label: 'Cortar', icon: 'copy', k: 'Ctrl+X', run: () => editText(field, 'cut') },
    { label: 'Copiar', icon: 'copy', k: 'Ctrl+C', run: () => editText(field, 'copy') },
    { label: 'Pegar', icon: 'doc', k: 'Ctrl+V', run: () => editText(field, 'paste') },
    '-',
    { label: 'Seleccionar todo', icon: 'check', run: () => editText(field, 'all') },
  ];
  const bar = target.closest('.bar');
  if (bar) {
    const { type, id } = bar.dataset;
    const open = (t) => { if (ui.card) closeCard(true); openCard({ type: t, id }, bar); };
    const del = (kind) => ({ label: 'Eliminar', icon: 'trash', danger: true, run: () => run('delete_item', { type: kind, id }) });
    const blk = (kind) => { const x = kind === 'goal' ? byId(S.db.goals, id) : byId(S.db.milestones, id); return { label: x?.blocking ? 'Quitar tiempo bloqueado' : 'Marcar como tiempo bloqueado', icon: 'clock', on: !!x?.blocking, run: () => run('set_blocking', { type: kind === 'goal' ? 'goal' : 'milestone', id, blocking: !x?.blocking }) }; };
    if (type === 'ms') return [{ label: 'Abrir', icon: 'arrow', run: () => open('ms') }, blk('ms'), { label: 'Editar', icon: 'edit', run: () => open('edit-ms') }, { label: 'Planificar estudio', icon: 'wand', run: () => open('plan') }, '-', del('milestone')];
    if (type === 'goal') {
      const g = byId(S.db.goals, id);
      return [{ label: 'Abrir', icon: 'arrow', run: () => open('goal') }, blk('goal'), { label: g?.done ? 'Marcar como no conseguido' : 'Marcar como conseguido', icon: 'target', run: () => run('update_goal', { id, done: !g?.done }) }, { label: 'Editar', icon: 'edit', run: () => open('edit-goal') }, '-', del('goal')];
    }
    if (type === 'block') {
      const b = byId(S.db.blocks, id);
      const items = [{ label: 'Abrir', icon: 'arrow', run: () => open('block') }, { label: 'Editar', icon: 'edit', run: () => open('edit-block') }];
      if (b) items.push({ label: b.blocking ? 'Quitar tiempo bloqueado' : 'Marcar como tiempo bloqueado', icon: 'clock', on: !!b.blocking, run: () => run('update_block', { id, blocking: !b.blocking }) });
      if (b && S.stats.blocks[id]?.manual) items.push({ label: b.done ? 'Marcar como pendiente' : 'Marcar como hecho', icon: 'check', run: () => run('update_block', { id, done: !b.done }) });
      if (b && blockEnd(b) < S.today && S.stats.blocks[id]?.pct < 100) items.push({ label: 'Pasar lo pendiente al siguiente bloque', icon: 'redo', run: () => run('rollover_pending', {}) });
      return [...items, '-', del('block')];
    }
    if (type === 'ext') return [{ label: 'Ver detalles', icon: 'arrow', run: () => open('ext') }];
  }
  const rmr = target.closest('.rm-row:not(.draft), .task[data-act="rm-toggle"]');
  if (rmr) {
    const t = byId(rmAll(), rmr.dataset.id);
    if (t) {
      const up = (patch) => run('update_todo', { id: t.id, ...patch }).then(() => rmReload());
      const lists = [INBOX, ...(S.db.todoLists || [])].filter((l) => l.id !== (t.listId || 'inbox'));
      return [
        { label: t.done ? 'Marcar como pendiente' : 'Marcar como hecho', icon: 'check', run: () => rmToggle(rmr.querySelector('.rm-check') || rmr, t.id) },
        { label: 'Detalles', icon: 'info', run: () => (rmr.classList.contains('task') ? actions['rm-goto']({ dataset: { id: t.id } }) : actions['rm-detail']({ dataset: { id: t.id } })) },
        '-',
        { label: 'Para hoy', icon: 'cal', on: t.due === S.today, run: () => up({ due: t.due === S.today ? '' : S.today }) },
        { label: 'Mañana', icon: 'clock', on: t.due === addDays(S.today, 1), run: () => up({ due: addDays(S.today, 1) }) },
        { label: t.flagged ? 'Quitar bandera' : 'Bandera', icon: 'flag', on: t.flagged, run: () => up({ flagged: !t.flagged }) },
        '-',
        { label: 'Sangrar', icon: 'indent', k: 'Tab', run: () => run('indent_todo', { id: t.id }).then(() => rmReload(), () => {}) },
        ...(t.parentId ? [{ label: 'Quitar sangría', icon: 'outdent', k: 'Mayús+Tab', run: () => run('indent_todo', { id: t.id, outdent: true }).then(() => rmReload()) }] : []),
        ...(lists.length ? ['-', { h: 'Mover a' }, ...lists.map((l) => ({ label: l.name, icon: 'list', run: () => up({ listId: l.id }) }))] : []),
        '-',
        { label: 'Eliminar', icon: 'trash', danger: true, run: () => run('delete_item', { type: 'todo', id: t.id }).then(() => rmReload()) },
      ];
    }
  }
  const task = target.closest('.task[data-act="toggle-task"]');
  if (task) {
    const t = byId(S.db.tasks, task.dataset.id);
    return [{ label: t?.done ? 'Marcar como pendiente' : 'Marcar como hecha', icon: 'check', run: () => run('update_task', { id: t.id, done: !t.done }) }, '-', { label: 'Eliminar', icon: 'trash', danger: true, run: () => run('delete_item', { type: 'task', id: t.id }) }];
  }
  const cell = target.closest('.cell');
  if (cell) {
    const d = cell.dataset.date;
    const create = (t) => { if (ui.card) closeCard(true); openCard({ type: t, date: d }, cell); };
    const items = [{ h: fmtLong(d) }, { label: 'Bloque de estudio', icon: 'layers', k: 'doble clic', run: () => create('new-block') }, { label: 'Objetivo', icon: 'target', run: () => create('new-goal') }, { label: 'Examen o entrega', icon: 'cap', run: () => create('new-ms') }];
    if (d <= S.today) {
      const st = S.db.days[d]?.status;
      items.push('-', { label: 'Voy al día', icon: 'check', on: st === 'ok', run: () => run('set_day_status', { date: d, status: st === 'ok' ? '' : 'ok' }) }, { label: 'Voy atrasado', icon: 'clock', on: st === 'late', run: () => run('set_day_status', { date: d, status: st === 'late' ? '' : 'late' }) });
    }
    return items;
  }
  // En cualquier otro sitio: navegación, capas y la propia app
  const items = [{ label: 'Hoy', icon: 'cal', k: 'T', run: () => actions.today() }, { label: '¿Cómo vas?', icon: 'sun', run: () => openHow() }, { label: 'Recordatorios', icon: 'checklist', k: 'R', run: () => actions['rm-go']() }];
  if ((S.db.layers || []).length) items.push('-', { h: 'Capa' }, { label: 'Todo', icon: 'layers', on: ui.layer === 'all', run: () => actions['set-layer']({ dataset: { id: 'all' } }) }, ...S.db.layers.map((l) => ({ label: l.name, icon: 'layers', on: selLayers().includes(l.id), run: () => actions['set-layer']({ dataset: { id: l.id } }) })));
  if (!S.web) {
    const cur = S.db.settings.mode || 'tray';
    items.push('-', { h: 'Dónde vive' }, ...MODES.map(([m, label, ic]) => ({ label, icon: ic, on: cur === m, run: async () => { await api.setSettings({ mode: m }); await refresh(); } })));
    items.push('-', { label: 'Organizar', icon: 'folder', run: () => openHow('organize') }, { label: 'Ajustes', icon: 'gear', run: () => openHow('settings') }, { label: 'Ocultar', icon: 'minus', run: () => api.win('hide') }, { label: 'Salir de Temario', icon: 'x', danger: true, run: () => api.win('quit') });
  } else items.push('-', { label: 'Organizar', icon: 'folder', run: () => openHow('organize') }, { label: 'Ajustes', icon: 'gear', run: () => openHow('settings') });
  return items;
}
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  openCtx(e.clientX, e.clientY, ctxFor(e.target));
});
// Pulsación larga (pantallas táctiles) = menú contextual
let press = null, pressAt = null;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  const { clientX: x, clientY: y, target } = e;
  pressAt = [x, y];
  press = setTimeout(() => { ui.suppressClick = true; navigator.vibrate?.(12); openCtx(x, y, ctxFor(target)); }, 520);
});
['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => clearTimeout(press)));
document.addEventListener('pointermove', (e) => { if (press && e.pointerType === 'touch' && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 8) clearTimeout(press); }, { passive: true });

// ---------- Arrastre propio de barras (bloques, objetivos, exámenes) ----------
let pdrag = null, lastDragEnd = 0;
let holdT = 0;
weeksEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const bar = e.target.closest('.bar');
  if (!bar || !['block', 'goal', 'ms'].includes(bar.dataset.type)) return;
  const cell = $$('.cell', bar.closest('.week'))[colAt(e.clientX)];
  const arm = () => (pdrag = { bar, type: bar.dataset.type, id: bar.dataset.id, x0: e.clientX, y0: e.clientY, from: cell?.dataset.date, started: false });
  if (e.pointerType !== 'touch') return arm();
  clearTimeout(holdT);
  holdT = setTimeout(() => { if (!car) { arm(); bar.classList.add('armed'); navigator.vibrate?.(10); } }, 300);
});
['pointerup', 'pointercancel'].forEach((ev) => window.addEventListener(ev, () => { clearTimeout(holdT); $$('.bar.armed').forEach((b) => b.classList.remove('armed')); }));
const colAt = (x) => Math.max(0, Math.min(6, Math.floor(((x - weeksEl.getBoundingClientRect().left) / weeksEl.clientWidth) * 7)));
function dragFrame() {
  if (!pdrag?.started) return;
  const g = pdrag.ghost, k = 0.32;
  pdrag.cx += (pdrag.tx - pdrag.cx) * k;
  pdrag.cy += (pdrag.ty - pdrag.cy) * k;
  const tilt = Math.max(-6, Math.min(6, (pdrag.tx - pdrag.cx) * 0.25));
  g.style.transform = `translate(${pdrag.cx}px, ${pdrag.cy}px) rotate(${tilt}deg) scale(1.06)`;
  pdrag.raf = requestAnimationFrame(dragFrame);
}
window.addEventListener('pointermove', (e) => {
  if (!pdrag) return;
  if (!pdrag.started) {
    if (Math.hypot(e.clientX - pdrag.x0, e.clientY - pdrag.y0) < 6) return;
    clearTimeout(press);
    const r = pdrag.bar.getBoundingClientRect();
    const g = pdrag.bar.cloneNode(true);
    g.className += ' drag-ghost';
    Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    document.body.appendChild(g);
    pdrag.bar.classList.add('lifted');
    document.body.classList.add('dragging');
    Object.assign(pdrag, { started: true, ghost: g, cx: 0, cy: 0, tx: 0, ty: 0, r });
    pdrag.raf = requestAnimationFrame(dragFrame);
    if (ui.card) closeCard(true);
  }
  pdrag.tx = e.clientX - pdrag.x0;
  pdrag.ty = e.clientY - pdrag.y0;
  const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cell');
  $$('.cell.drop').forEach((x) => x !== cell && x.classList.remove('drop'));
  cell?.classList.add('drop');
  pdrag.target = cell;
});
window.addEventListener('pointerup', async () => {
  const d = pdrag;
  pdrag = null;
  if (!d?.started) return;
  ui.suppressClick = true;
  setTimeout(() => (ui.suppressClick = false), 50);
  lastDragEnd = Date.now();
  cancelAnimationFrame(d.raf);
  document.body.classList.remove('dragging');
  $$('.cell.drop').forEach((x) => x.classList.remove('drop'));
  const to = d.target?.dataset.date;
  const shift = to && d.from ? diffDays(d.from, to) : 0;
  // El fantasma vuela a su sitio (o vuelve) con muelle
  const tr = d.target ? d.target.getBoundingClientRect() : null;
  const dx = tr ? tr.left + 3 - d.r.left : 0, dy = tr ? tr.top + 33 - d.r.top : 0;
  d.ghost.animate([{ transform: d.ghost.style.transform }, { transform: `translate(${dx}px, ${dy}px) rotate(0) scale(1)` }], { duration: 380, easing: SPRING, fill: 'forwards' }).onfinish = () => {
    d.ghost.remove();
    d.bar.classList.remove('lifted');
  };
  if (!shift) return;
  if (d.type === 'block') {
    const b = byId(S.db.blocks, d.id);
    await run('update_block', { id: b.id, date: addDays(b.date, shift), endDate: b.endDate ? addDays(b.endDate, shift) : '' });
  } else if (d.type === 'goal') await run('update_goal', { id: d.id, date: addDays(byId(S.db.goals, d.id).date, shift) });
  else await run('update_milestone', { id: d.id, date: addDays(byId(S.db.milestones, d.id).date, shift) });
  toast(`${icon('layers', 13)} Movido al ${fmtShort(to)}`);
});
