/* Temario — widget de escritorio. Vanilla JS: render por regiones, morphs con WAAPI, delegación de eventos. */
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
  layerMenu: false,
};
// Capas: qué se ve en el calendario
const activeLayer = () => (ui.layer !== 'all' && S ? byId(S.db.layers || [], ui.layer) : null);
function inLayer(kind, x) {
  const l = activeLayer();
  if (!l) return true;
  if (kind === 'ext') return l.subscriptionIds.includes(x.subId);
  if (kind === 'goal' && !x.projectId) return !!l.includeLoose;
  return l.projectIds.includes(x.projectId);
}
const subColor = (id) => byId(S.db.subscriptions || [], id)?.color || '#8c8c84';
const byId = (list, id) => list.find((x) => x.id === id);
const proj = (id) => byId(S.db.projects, id) || { name: '—', color: '#999' };
const blockEnd = (b) => b.endDate || b.date;
const ink = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.66 ? '#1f1e1d' : '#fff';
};

function gridRange() {
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
    toast(esc(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')));
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
  if (S.web && !aur.on) (setAurora(true), document.body.classList.add('has-glass'));
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
    <div class="month"><span class="n" id="mname">${MONTHS[m.getMonth()]}</span><span class="y">${m.getFullYear()}</span></div>
    <div class="nav">
      <button class="ibtn" data-act="month" data-d="-1" title="Mes anterior">${icon('chevL', 16)}</button>
      <button class="ibtn" data-act="month" data-d="1" title="Mes siguiente">${icon('chevR', 16)}</button>
      ${ui.month !== S.today.slice(0, 8) + '01' ? `<button class="ibtn" data-act="today" title="Volver a hoy">${icon('cal', 15)}</button>` : ''}
    </div>
    <button class="layer-pill ${activeLayer() ? 'on' : ''}" data-act="layer-menu" title="Capas">${icon('layers', 13)} ${esc(activeLayer()?.name || 'Todo')}</button>
    ${ui.layerMenu ? layerMenu() : ''}`);
  $('#weekdays').innerHTML = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<div>${d}</div>`).join('');
}

const paletteRow = (id, current, kind) => `<div class="palette" data-key="pal-${id}">${PALETTE.map((c, i) => `<button class="${c === current ? 'on' : ''}" style="--c:${c};--n:${i}" data-act="set-color" data-kind="${kind}" data-id="${id}" data-c="${c}"></button>`).join('')}</div>`;

function layerMenu() {
  const count = (l) => l.projectIds.length + l.subscriptionIds.length;
  return `<div class="layer-menu">
    <button class="${ui.layer === 'all' ? 'on' : ''}" data-act="set-layer" data-id="all">${icon('layers', 14)} Todo</button>
    ${(S.db.layers || []).map((l) => `<button class="${ui.layer === l.id ? 'on' : ''}" data-act="set-layer" data-id="${l.id}">${icon('layers', 14)} ${esc(l.name)}<span class="n">${count(l)}</span></button>`).join('')}
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

function renderCal(dir = 0) {
  const { from } = gridRange();
  const month = parse(ui.month).getMonth();
  const weekH = $('#weeks').clientHeight / 6 || 80;
  const cap = Math.max(1, Math.floor((weekH - 34) / 21));
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
      const style = `left:calc(${(it.s / 7) * 100}% + 3px);width:calc(${((it.e - it.s + 1) / 7) * 100}% - 6px);top:${33 + it.lane * 21}px;--c:${p.color};--ink:${ink(p.color)};--i:${n++}`;
      if (it.kind === 'ext') {
        bars += `<div class="bar ext ${it.cl ? 'cl' : ''} ${it.cr ? 'cr' : ''}" data-act="open" data-type="ext" data-id="${esc(it.id)}" data-key="${esc(key)}" style="${style}" title="${esc(it.x.title)}">${it.x.start && !it.cl ? it.x.start + ' ' : ''}${esc(it.x.title)}</div>`;
      } else if (it.kind === 'goal') {
        bars += `<div class="bar goal ${it.x.done ? 'done' : ''}" data-act="open" data-type="goal" data-id="${it.id}" data-key="${key}" style="${style}" title="${esc(it.x.title)}">${icon(it.x.done ? 'check' : 'target', 11)}<span>${esc(it.x.title)}</span></div>`;
      } else if (it.kind === 'ms') {
        bars += `<div class="bar ms" data-act="open" data-type="ms" data-id="${it.id}" data-key="${key}" style="${style}" title="${esc(it.x.title)}">${icon(KIND_ICON[it.x.kind] || 'flag', 11)}<span>${esc(it.x.title)}</span></div>`;
      } else {
        const st = S.stats.blocks[it.id];
        bars += `<div class="bar blk ${st.pct === 100 ? 'done' : ''} ${it.cl ? 'cl' : ''} ${it.cr ? 'cr' : ''}" data-block="${it.id}" data-act="open" data-type="block" data-id="${it.id}" data-key="${key}" style="${style}" title="${esc(it.x.title)}">${esc(it.x.title)}</div>`;
      }
    }
    let cells = '';
    for (let c = 0; c < 7; c++) {
      const d = addDays(ws, c);
      const st = S.days[d];
      cells += `<div class="cell ${parse(d).getMonth() !== month ? 'out' : ''} ${d === S.today ? 'today' : ''}" data-act="open-day" data-date="${d}" data-key="day-${d}" data-drop="${d}" style="left:${(c / 7) * 100}%;width:${100 / 7}%">
        <span class="num">${parse(d).getDate()}</span>${['ok', 'late', 'carried'].includes(st) && d < S.today ? `<span class="st ${st}"></span>` : ''}${hidden[c] ? `<span class="more">+${hidden[c]}</span>` : ''}</div>`;
    }
    html += `<div class="week">${cells}${bars}</div>`;
  }
  if (!S.db.projects.length) {
    html += `<div class="empty"><div><h2>Tu temario, a la vista</h2><p>Crea una asignatura o proyecto, o pídeselo al agente con el botón de la esquina.</p>
      <div style="display:flex;gap:8px;justify-content:center"><button class="btn primary" data-act="new" data-type="new-project">${icon('plus', 14)} Crear proyecto</button><button class="btn" data-act="demo">Ver ejemplo</button></div></div></div>`;
  }
  const weeks = $('#weeks');
  if (dir) weeks.innerHTML = html; // cambio de mes: entra entero deslizando
  else morph(weeks, html);
  if (dir || !weeks.dataset.ready) {
    // las barras solo entran animadas al abrir o al cambiar de mes, no en cada actualización
    weeks.dataset.ready = '1';
    weeks.classList.add('anim');
    clearTimeout(renderCal.t);
    renderCal.t = setTimeout(() => weeks.classList.remove('anim'), 1200);
  }
  if (dir) {
    weeks.classList.remove('l', 'r');
    void weeks.offsetWidth;
    weeks.classList.add(dir < 0 ? 'l' : 'r');
  }
}

// ---------- tarjeta (morph desde una barra o un día) ----------
const taskRow = (t, color, from = '') => `
  <div class="task ${t.done ? 'done' : ''}" style="--c:${color}" data-act="toggle-task" data-id="${t.id}">
    <span class="check">${icon('check', 12)}</span>
    <span class="tt"><span class="tx">${esc(t.title)}</span>${from ? `<span class="from">${esc(from)}</span>` : ''}</span>
    ${t.carried ? `<span class="carry" title="Arrastrada de días anteriores">${icon('redo', 10)}${t.carried}</span>` : ''}
    <button class="ibtn x" data-act="del-task" data-id="${t.id}" title="Quitar">${icon('x', 12)}</button>
  </div>`;

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
      <div class="c-meta"><span class="tag" style="--c:${p.color}">${esc(p.name)}</span>${b.endDate ? `${fmtShort(b.date)} → ${fmtShort(b.endDate)}` : fmtLong(b.date)}${b.start ? ` · ${b.start}${b.end ? '–' + b.end : ''}` : ''}</div></div>
      <button class="ibtn" data-act="close-card">${icon('x', 15)}</button></div>
    <div class="c-hero" style="--c:${p.color}">${ring('cb-' + id, st.pct, p.color, 48, 5)}
      <div><div style="font-weight:600">${st.carried ? 'Pendientes movidos' : st.manual ? (b.done ? 'Hecho' : 'Sin tareas') : `${st.done} de ${st.total} hechas`}</div>
      ${m ? `<div class="lbl"><a class="lnk" data-act="open" data-type="ms" data-id="${m.id}">${esc(m.title)}</a> · ${rel(diffDays(S.today, m.date)).toLowerCase()}</div>` : ''}</div></div>
    <div class="tasks">${tasks.map((t) => taskRow(t, p.color, byId(S.db.topics, t.topicId)?.title)).join('')}
      ${!tasks.length && !st.carried ? `<div class="task ${b.done ? 'done' : ''}" style="--c:${p.color}" data-act="toggle-block" data-id="${id}"><span class="check">${icon('check', 12)}</span><span class="tt"><span class="tx">Bloque completado</span></span></div>` : ''}
      <input class="inline-add" data-key="addb-${id}" data-add="block-task" data-id="${id}" placeholder="Añadir tarea a este bloque  ↵" />
    </div>
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
      <div class="c-meta"><span class="tag" style="--c:${p.color}">${icon(KIND_ICON[m.kind], 11)} ${esc(p.name)}</span>${fmtLong(m.date)}${m.time ? ' · ' + m.time : ''}</div></div>
      <button class="ibtn" data-act="close-card">${icon('x', 15)}</button></div>
    <div class="c-hero" style="--c:${p.color}"><div style="flex:1"><div class="big">${n < 0 ? '✓' : n}</div>
      <div class="lbl">${n < 0 ? 'Ya pasó' : n === 0 ? '¡Es hoy!' : `${n === 1 ? 'día' : 'días'} para ${ART[m.kind]}`}${n > 0 && pending ? ` · ~${(pending / n).toFixed(pending / n < 10 ? 1 : 0)} tareas/día` : ''}</div></div>
      ${ring('cm-' + id, st.pct, p.color, 64, 6, true, 'big')}</div>
    ${topics.map((tp) => {
      const tasks = S.db.tasks.filter((t) => t.topicId === tp.id).sort((a, c) => (a.order ?? 0) - (c.order ?? 0));
      const ts = S.stats.topics[tp.id];
      return `<div class="topic ${ui.closed.has(tp.id) ? 'closed' : ''}"><div class="topic-h" data-act="fold" data-id="${tp.id}"><span class="chev">${icon('chevD', 14)}</span><span class="name">${esc(tp.title)}</span><span class="meta">${ts.done}/${ts.total}</span>
        <button class="ibtn" data-act="del-topic" data-id="${tp.id}" title="Eliminar tema" style="width:22px;height:22px">${icon('trash', 12)}</button></div>
        ${prog('tp-' + tp.id, ts.pct, p.color)}
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
      <div class="c-meta"><span class="tag" style="--c:${c}">${icon('target', 11)} Objetivo${g.projectId ? ' · ' + esc(proj(g.projectId).name) : ''}</span>${fmtLong(g.date)}${g.time ? ' · ' + g.time : ''}</div></div>
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
    <label class="field"><span>Notas</span><textarea class="input" name="notes" rows="2">${esc(g?.notes || '')}</textarea></label>
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
      ${ms.map((m) => row('ms', m.id, proj(m.projectId).color, m.title, `${KIND_LABEL[m.kind]} · ${S.stats.milestones[m.id].pct}%`)).join('')}
      ${blocks.map((b) => { const s = S.stats.blocks[b.id]; return row('block', b.id, proj(b.projectId).color, b.title, `${esc(proj(b.projectId).name)}${b.start ? ' · ' + b.start : ''} · ${s.manual ? (b.done ? 'hecho' : 'pendiente') : `${s.done}/${s.total}`}`); }).join('')}
      ${goals.map(goalRow).join('')}
      ${exts.map((e) => row('ext', e.id, subColor(e.subId), e.title, `${esc(byId(S.db.subscriptions || [], e.subId)?.name || '')}${e.start ? ' · ' + e.start : ' · todo el día'}`)).join('')}
      ${!ms.length && !blocks.length && !goals.length && !exts.length ? '<div class="hint">Día libre.</div>' : ''}
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
    <label class="field"><span>Título</span><input class="input" name="title" required autofocus value="${esc(m?.title || '')}" placeholder="Parcial 1, Entrega práctica…"></label>
    <div class="row2"><label class="field"><span>Fecha</span><input class="input" type="date" name="date" required value="${m?.date || date || addDays(S.today, 14)}"></label>
      <label class="field"><span>Hora</span><input class="input" type="time" name="time" value="${m?.time || ''}"></label></div>
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
function formBlock({ id, date, ms }) {
  const b = id && byId(S.db.blocks, id);
  const m0 = ms && byId(S.db.milestones, ms);
  const pid = b?.projectId || m0?.projectId || S.db.projects[0]?.id;
  const mid = b?.milestoneId || ms || '';
  const assigned = b ? S.db.tasks.filter((t) => t.blockId === b.id).map((t) => t.id) : [];
  return `<form data-form="block" data-id="${id || ''}"><div class="c-title">${b ? 'Editar bloque' : 'Bloque de estudio'}</div>
    ${b ? '' : `<div class="row2"><label class="field"><span>Proyecto</span><select class="input" name="projectId">${projectOptions(pid)}</select></label>
      <label class="field"><span>Para</span><select class="input" name="milestoneId">${pid ? msOptions(pid, mid) : ''}</select></label></div>${newProjectField(!pid)}`}
    <label class="field"><span>Qué vas a hacer</span><input class="input" name="title" required autofocus value="${esc(b?.title || (m0 ? 'Estudiar · ' + m0.title : ''))}" placeholder="Repasar tema 2…"></label>
    <div class="row2"><label class="field"><span>Desde</span><input class="input" type="date" name="date" required value="${b?.date || date || S.today}"></label>
      <label class="field"><span>Hasta</span><input class="input" type="date" name="endDate" value="${b?.endDate || ''}"></label></div>
    <div class="row2"><label class="field"><span>Inicio</span><input class="input" type="time" name="start" value="${b?.start || ''}"></label>
      <label class="field"><span>Fin</span><input class="input" type="time" name="end" value="${b?.end || ''}"></label></div>
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

const CARD_W = { ext: 300, goal: 310, 'new-goal': 320, 'edit-goal': 320, block: 320, ms: 340, day: 300, 'new-project': 320, 'new-ms': 330, 'edit-ms': 330, 'new-block': 350, 'edit-block': 350, plan: 330 };
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
    case 'new-block': return formBlock({ date: v.date, ms: v.ms });
    case 'edit-block': return formBlock({ id: v.id });
    case 'plan': return formPlan({ id: v.id });
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
  setTimeout(() => $('[autofocus]', card)?.focus(), 250);
}
function swapCard(v) {
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
  const html = cardHTML(ui.card);
  if (!html) return closeCard(true);
  const inner = $('.card-in', card);
  if (!inner || $('form', inner)) return; // no pisar un formulario a medio rellenar
  const scroll = inner.scrollTop;
  const focus = document.activeElement?.dataset?.key;
  morph(inner, html);
  inner.classList.remove('fade');
  inner.scrollTop = scroll;
  if (focus) $(`[data-key="${focus}"]`, inner)?.focus();
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
      <div style="display:flex;gap:2px"><button class="ibtn" data-act="how-view" data-v="organize" title="Organizar: proyectos, capas y calendarios">${icon('folder', 16)}</button><button class="ibtn" data-act="how-view" data-v="settings" title="Ajustes">${icon('gear', 16)}</button><button class="ibtn" data-act="how-close" title="Cerrar">${icon('x', 16)}</button></div></div>
    ${text ? `<div class="ai-line">${icon('spark', 15)}<span>${esc(text)}</span></div>` : aiLoading ? `<div class="ai-line loading">${icon('spark', 15)}<span>Pensando en tu día…</span></div>` : ''}
    ${b.moved.length ? `<div class="sub" style="margin-top:12px">↻ ${b.moved.length} tarea${b.moved.length > 1 ? 's' : ''} de días anteriores ${b.moved.length > 1 ? 'pasaron' : 'pasó'} a tus próximos bloques.</div>` : ''}
    <div class="how-cols">
      <div>
        <div class="verdict">${ring('how-today', all.pct, late ? 'var(--late)' : 'var(--accent)', 62, 6, true, 'big')}
          <div><b>${verdict}</b><div class="sub">${all.total ? `${all.done} de ${all.total} tareas de hoy` : 'Nada programado hoy'}${late ? ` · <a class="lnk" data-act="rollover">pasarlas al siguiente bloque</a>` : ''}</div></div></div>
        <div class="h3">Hoy</div>
        ${b.goals.filter((g) => g.date <= S.today).map((g) => goalRow(byId(S.db.goals, g.id))).join('')}
        ${b.blocks.flatMap((bl) => bl.tasks.map((t) => taskRow(t, bl.color, bl.title))).join('') || (b.goals.some((g) => g.date <= S.today) ? '' : '<div class="hint">Día libre 🌿</div>')}
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
  return `<div class="how-top"><div style="display:flex;align-items:center;gap:6px"><button class="ibtn" data-act="how-view" data-v="summary" title="Volver">${icon('chevL', 17)}</button><div class="greet" style="font-size:24px">${title}</div></div>
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
        ${sec('sec-study', 'redo', 'Estudio', 'Qué hace Temario con lo que se queda sin hacer.', `
          <label class="toggle"><div>Arrastrar lo pendiente<small>Cada mañana, lo no hecho pasa al siguiente bloque</small></div><input type="checkbox" data-setting="autoRollover" ${s.autoRollover ? 'checked' : ''}><span class="switch"></span></label>`, 'desk-only')}
      </div>
      <div>
        ${sec('sec-cloud', 'layers', 'Nube y móvil', 'Tu calendario sincronizado entre este PC, el móvil y otros ordenadores.', cloudSection())}
        ${sec('sec-agent', 'spark', 'Agente', 'Usa tu cuenta de Claude. Recuerda lo importante de lo que haces y le pides.', `
          <div class="list-row" style="cursor:default;padding-left:0"><span class="dotc" style="--c:${S.account.ok ? 'var(--ok)' : 'var(--late)'};border-radius:50%"></span>
            <div class="grow"><div class="ttl">${S.account.ok ? 'Cuenta de Claude conectada' : 'Sin sesión de Claude'}</div>
            <div class="meta">${S.account.ok ? [S.account.email, S.account.plan && 'plan ' + cap1(S.account.plan)].filter(Boolean).map(esc).join(' · ') || 'Usa la sesión de Claude Code de este PC' : 'Pulsa «Iniciar sesión» y entra con tu cuenta de Claude en el navegador'}</div></div>
            ${S.account.ok ? '' : `<button class="btn primary" data-act="login" style="flex:none">Iniciar sesión</button>`}<button class="ibtn" data-act="check-account" title="Comprobar">${icon('redo', 13)}</button></div>
          <label class="field"><span>Modelo</span><input class="input" data-setting-text="model" value="${esc(s.model)}"></label>
          <div class="field"><span>Memoria${memCache ? ` · ${memCache.memories.length} recuerdos` : ''}</span>
          ${memCache ? memCache.memories.slice(0, 12).map((m) => `<div class="mem" data-key="mem-${m.id}"><div class="grow">${esc(m.text)}</div><div class="str">${prog('mem-' + m.id, m.strength, 'var(--accent)')}</div><button class="ibtn" data-act="forget" data-id="${m.id}" title="Olvidar" style="width:22px;height:22px">${icon('x', 12)}</button></div>`).join('') || '<div class="hint">Todavía no recuerda nada. Irá aprendiendo de lo que haces y le pides.</div>' : '<div class="hint">Cargando…</div>'}</div>`, 'desk-only')}
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
        ${sec('sec-projects', 'folder', 'Proyectos', 'Asignaturas, trabajos y proyectos propios. Toca el color para cambiarlo.', `
          ${S.db.projects.map((p) => `<div class="list-row" data-key="pr-${p.id}" style="cursor:default"><button class="color-btn ${ui.colorFor === p.id ? 'open' : ''}" style="--c:${p.color}" data-act="pick-color" data-id="${p.id}" title="Cambiar color"></button><div class="grow"><div class="ttl">${esc(p.name)}</div><div class="meta">${KIND_LABEL[p.kind] || ''} · ${S.stats.projects[p.id].pct}%</div></div><button class="ibtn" data-act="del-project" data-id="${p.id}" title="Eliminar">${icon('trash', 13)}</button></div>${ui.colorFor === p.id ? paletteRow(p.id, p.color, 'project') : ''}`).join('') || '<div class="hint">Aún no hay proyectos.</div>'}
          <input class="inline-add" data-add="project" data-key="addproj" placeholder="Nuevo proyecto  ↵" />`)}
        ${sec('sec-subs', 'cal', 'Calendarios suscritos', 'Calendarios externos (Google, Outlook, iCloud). Sus eventos son de solo lectura y se actualizan solos.', `
          ${(S.db.subscriptions || []).map((s) => `<div class="list-row" data-key="sb-${s.id}" style="cursor:default"><button class="color-btn ${ui.colorFor === s.id ? 'open' : ''}" style="--c:${s.color}" data-act="pick-color" data-id="${s.id}" title="Cambiar color"></button>
            <div class="grow"><div class="ttl">${esc(s.name)}</div><div class="meta">${s.error ? `<span style="color:var(--late)">No se pudo descargar: ${esc(s.error)}</span>` : s.lastSync ? `${s.count || 0} eventos · actualizado ${new Date(s.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Descargando…'}</div></div>
            <button class="ibtn" data-act="refresh-sub" data-id="${s.id}" title="Actualizar ahora">${icon('redo', 13)}</button><button class="ibtn" data-act="del-sub" data-id="${s.id}" title="Quitar">${icon('trash', 13)}</button></div>
            ${ui.colorFor === s.id ? paletteRow(s.id, s.color, 'sub') : ''}`).join('')}
          <div class="sub-form"><input class="input" data-sub-name placeholder="Nombre (p. ej. «Horario de clases»)"><input class="input" data-sub-url placeholder="https://…/basic.ics o webcal://…"><button class="btn primary" data-act="add-sub" style="justify-self:start">Suscribirme</button></div>
          <div class="sec-d" style="margin-top:10px">En Google Calendar: Configuración → tu calendario → «Dirección secreta en formato iCal».</div>`)}
      </div>
      <div>
        ${sec('sec-layers', 'layers', 'Capas', 'Cada capa es una vista del calendario. Marca qué proyectos y calendarios entran en cada una; un proyecto puede estar en varias.', `
          ${(S.db.layers || []).map((l) => `<div class="layer-box" data-key="ly-${l.id}">
            <div class="layer-head">${icon('layers', 14)}<input class="layer-name" data-layer-name="${l.id}" value="${esc(l.name)}"><button class="ibtn" data-act="del-layer" data-id="${l.id}" title="Eliminar capa">${icon('trash', 13)}</button></div>
            <div class="chips-row">
              ${S.db.projects.map((p) => `<button class="pchip ${l.projectIds.includes(p.id) ? 'on' : ''}" style="--c:${p.color}" data-act="layer-toggle" data-layer="${l.id}" data-kind="project" data-id="${p.id}">${esc(p.name)}</button>`).join('')}
              ${(S.db.subscriptions || []).map((s) => `<button class="pchip sub ${l.subscriptionIds.includes(s.id) ? 'on' : ''}" style="--c:${s.color}" data-act="layer-toggle" data-layer="${l.id}" data-kind="sub" data-id="${s.id}">${esc(s.name)}</button>`).join('')}
              <button class="pchip ${l.includeLoose ? 'on' : ''}" data-act="layer-toggle" data-layer="${l.id}" data-kind="loose">Objetivos sin proyecto</button>
            </div></div>`).join('') || '<div class="hint">Aún no hay capas. Sin capas, el calendario muestra todo.</div>'}
          <input class="inline-add" data-add="layer" data-key="addlayer" placeholder="Nueva capa (p. ej. «Universidad»)  ↵" />`)}
      </div>
    </div>`;
}

// ---------- Nube y móvil ----------
function cloudForm() {
  return `<div class="c-meta" style="margin:2px 0 8px">Entra para tener tu calendario en el móvil y en otros PCs.</div>
    <input class="input" data-cloud-email type="email" autocomplete="email" placeholder="tu@email.com" value="${esc(ui.cloudEmail || '')}">
    <input class="input" data-cloud-pw type="password" autocomplete="current-password" placeholder="Contraseña" style="margin-top:6px">
    <div class="c-actions"><button class="btn primary" data-act="cloud-signin">Entrar</button><button class="btn plain" data-act="cloud-signup">Crear cuenta</button></div>`;
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
  el.innerHTML = `<div class="login-card"><div class="greet">Temario</div><div class="sub" style="margin-bottom:14px">Tu calendario de estudio, también en el móvil.</div>${cloudForm()}</div>`;
}
function sizeHow() {
  const w = $('#widget');
  $('#how').style.setProperty('--hw', w.clientWidth - 20 + 'px');
  $('#how').style.setProperty('--hh', w.clientHeight - 20 + 'px');
}
function renderHow(force = true) {
  const el = $('#how');
  sizeHow();
  el.className = `how ${ui.how} ${ui.fresh && ui.how !== 'open' ? 'fresh' : ''}`;
  if (!el.firstChild) el.innerHTML = `<div class="how-btn"></div><div class="how-body"></div>`;
  $('.how-btn', el).innerHTML = `${ui.fresh ? '<span class="dot"></span>' : icon('sun', 14)} ¿Cómo vas?`;
  if (ui.how !== 'open' || (!force && document.activeElement?.closest?.('.how-body input'))) return;
  const body = $('.how-body', el);
  const scroll = body.scrollTop;
  const view = ui.howView;
  if (body.dataset.view !== view) (body.innerHTML = ''), (body.dataset.view = view); // otra pantalla: entra completa
  morph(body, view === 'settings' ? howSettings() : view === 'organize' ? howOrganize() : howSummary());
  body.scrollTop = scroll;
  animateValues(body);
}
function openHow(view = 'summary') {
  closeCard(true);
  ui.how = 'open';
  ui.howView = view;
  if (ui.fresh) { ui.fresh = false; api.briefingSeen(); }
  renderHow();
  if (view === 'summary' && S.account.ok && !(S.db.meta.briefingDate === S.today && S.db.meta.briefingText) && !aiLoading) {
    aiLoading = true;
    renderHow();
    api.briefingAI().finally(() => { aiLoading = false; refresh(); });
  }
  if (view === 'settings') api.memories().then((m) => { memCache = m; renderHow(); });
}
function closeHow() { ui.how = 'idle'; renderHow(); }

// Proximidad: la barrita se convierte en botón cuando el cursor se acerca
document.addEventListener('mousemove', (e) => {
  magnetDots(e);
  if (ui.how === 'open') return;
  const w = $('#widget').getBoundingClientRect();
  const near = Math.hypot(e.clientX - (w.left + w.width / 2), (e.clientY - (w.top + 10)) * 1.8) < 120;
  if (near !== (ui.how === 'near')) { ui.how = near ? 'near' : 'idle'; renderHow(false); }
});
document.addEventListener('mouseleave', () => { if (ui.how === 'near') { ui.how = 'idle'; renderHow(false); } });

// Puntos magnéticos
let dotPos = null, dotRaf = 0;
function magnetDots(e) {
  if (dotRaf) return;
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
  set_day_status: 'Día marcado', delete_item: 'Eliminado', create_goal: 'Objetivo marcado', update_goal: 'Objetivo actualizado', remember: 'Lo recordaré',
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
function renderAgent() {
  const el = $('#agent');
  if (!el.firstChild) {
    el.innerHTML = `<div class="spark">${icon('spark', 19)}</div><input id="agent-in" placeholder="Pídeme algo: «examen de Química el 20, temas 1 a 4»" /><button class="send" data-act="agent-send">${icon('send', 15)}</button>`;
    const inp = $('#agent-in');
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendAgent(); }
      if (e.key === 'Escape') { e.stopPropagation(); closeAgent(); }
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (!inp.value.trim() && !ui.busy && document.activeElement !== inp) closeAgent(); }, 180));
  }
  el.classList.toggle('open', ui.agentOpen);
  el.classList.toggle('busy', ui.busy);
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
  const parts = [`Está viendo ${MONTHS[parse(ui.month).getMonth()]} ${ui.month.slice(0, 4)}${activeLayer() ? ` en la capa «${activeLayer().name}» (id ${ui.layer})` : ''}.`];
  const c = ui.card;
  if (c?.type === 'block') { const b = byId(S.db.blocks, c.id); if (b) parts.push(`Tiene abierto el bloque «${b.title}» (id ${b.id}, ${b.date}).`); }
  if (c?.type === 'ms') { const m = byId(S.db.milestones, c.id); if (m) parts.push(`Tiene abierto ${ART[m.kind]} «${m.title}» (id ${m.id}, ${m.date}).`); }
  if (c?.type === 'goal') { const g = byId(S.db.goals || [], c.id); if (g) parts.push(`Tiene abierto el objetivo «${g.title}» (id ${g.id}, ${g.date}).`); }
  if (c?.type === 'day') parts.push(`Tiene abierto el día ${c.date}.`);
  if (ui.how === 'open') parts.push('Está mirando «¿Cómo vas?».');
  return parts.join(' ');
}
async function sendAgent() {
  const inp = $('#agent-in');
  const text = inp.value.trim();
  if (!text || ui.busy) return;
  if (!S.account.ok) { toast('Inicia sesión en Claude para usar el agente'); return openHow('settings'); }
  inp.value = '';
  ui.busy = true;
  ui.reply = { text: '', tools: [] };
  renderAgent();
  showReply();
  const res = await api.chat(text, agentContext());
  ui.busy = false;
  ui.reply = { text: res.error ? (res.error === 'NOAUTH' ? 'Tu sesión de Claude ha caducado. Ve a Ajustes → Iniciar sesión.' : '⚠️ ' + res.error) : res.text, tools: ui.reply?.tools || [] };
  renderAgent();
  showReply();
  if (res.changed) refresh();
}
api.onAIEvent((ev) => {
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
    const r = el.querySelector('.check').getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, getComputedStyle(el).getPropertyValue('--c').trim() || '#d97757');
  }
}
const actions = {
  month: (el) => changeMonth(+el.dataset.d),
  today: () => goMonth(S.today.slice(0, 8) + '01', S.today < ui.month ? -1 : 1),
  demo: async () => { await api.demo(); await refresh(); toast(`${icon('spark', 14)} Ejemplo cargado`); },
  open: (el) => {
    const v = { type: el.dataset.type, id: el.dataset.id };
    if (ui.card && el.closest('#card')) return swapCard(v);
    if (ui.card) closeCard(true);
    openCard(v, el);
  },
  'open-day': (el) => { if (ui.card) return closeCard(); openCard({ type: 'day', date: el.dataset.date }, el); },
  new: (el) => openCard({ type: el.dataset.type }, el),
  swap: (el) => { const back = ui.card; swapCard({ type: el.dataset.type, id: el.dataset.id, date: el.dataset.date, ms: el.dataset.ms }); ui.card.back = back; },
  'card-back': () => { const back = ui.card?.back; if (!back) return closeCard(); swapCard(back); ui.card.back = back.back; },
  'close-card': () => closeCard(),
  'toggle-task': async (el, e) => {
    if (e.target.closest('.x')) return;
    const t = byId(S.db.tasks, el.dataset.id);
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
    await run(el.dataset.kind === 'sub' ? 'update_subscription' : 'update_project', { id: el.dataset.id, color: el.dataset.c });
    setTimeout(async () => {
      ui.colorFor = null;
      await refresh();
      renderHow(true);
    }, 200);
  },
  'layer-menu': (_el, e) => { e.stopPropagation(); ui.layerMenu = !ui.layerMenu; renderHead(); },
  'set-layer': (el) => {
    ui.layer = el.dataset.id;
    ui.layerMenu = false;
    localStorage.setItem('layer', ui.layer);
    renderHead();
    renderCal(1);
    toast(`${icon('layers', 14)} ${esc(activeLayer()?.name || 'Todo')}`);
  },
  'manage-layers': () => { ui.layerMenu = false; renderHead(); openHow('organize'); setTimeout(() => { const el = $('#sec-layers'); el && $('.how-body').scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' }); }, 450); },
  'layer-toggle': async (el) => {
    const l = byId(S.db.layers, el.dataset.layer);
    const k = el.dataset.kind, id = el.dataset.id;
    const patch = k === 'loose' ? { includeLoose: !l.includeLoose }
      : k === 'project' ? { projectIds: l.projectIds.includes(id) ? l.projectIds.filter((x) => x !== id) : [...l.projectIds, id] }
      : { subscriptionIds: l.subscriptionIds.includes(id) ? l.subscriptionIds.filter((x) => x !== id) : [...l.subscriptionIds, id] };
    el.classList.toggle('on');
    await run('update_layer', { id: l.id, ...patch });
    await refresh();
    renderHow(true);
  },
  'del-layer': (el) => confirmIn(el, async () => { await run('delete_item', { type: 'layer', id: el.dataset.id }); if (ui.layer === el.dataset.id) { ui.layer = 'all'; localStorage.setItem('layer', 'all'); } await refresh(); renderHow(true); }),
  'add-sub': async () => {
    const name = $('[data-sub-name]').value.trim(), url = $('[data-sub-url]').value.trim();
    if (!name || !url) return toast('Pon nombre y URL del calendario');
    const s = await run('add_subscription', { name, url, layerIds: activeLayer() ? [ui.layer] : [] });
    toast(`${icon('cal', 14)} Descargando «${esc(name)}»…`);
    await refresh();
    renderHow(true);
    await api.refreshSubs(s.id);
    await refresh();
    renderHow(true);
  },
  'refresh-sub': async (el) => { el.classList.add('spin'); await api.refreshSubs(el.dataset.id); await refresh(); renderHow(true); },
  'del-sub': (el) => confirmIn(el, async () => { await run('delete_item', { type: 'subscription', id: el.dataset.id }); await refresh(); renderHow(true); }),
  'cloud-signin': () => cloudAuth('in'),
  'cloud-signup': () => cloudAuth('up'),
  'cloud-sync': async () => { await api.cloudSync(); await refresh(); renderHow(true); },
  'cloud-signout': (el) => confirmIn(el, async () => { await api.cloudSignOut(); await refresh(); renderHow(true); }),
  'check-account': async () => { const a = await api.checkAccount(); toast(a.ok ? `${icon('check', 14)} Cuenta de Claude conectada` : 'No hay sesión de Claude en este PC'); await refresh(); renderHow(); },
  forget: async (el) => { await api.forget(el.dataset.id); memCache = await api.memories(); renderHow(); },
  'copy-mcp': async () => { api.copy(JSON.stringify(await api.mcpConfig(), null, 2)); toast(`${icon('check', 14)} Configuración MCP copiada`); },
  'install-skill': async () => { const p = await api.installSkill(); toast(`${icon('check', 14)} Skill instalada en ${esc(p)}`, 4000); },
  'agent-send': () => sendAgent(),
};
async function cloudAuth(kind) {
  const email = $('[data-cloud-email]')?.value.trim();
  const pw = $('[data-cloud-pw]')?.value || '';
  if (!/^\S+@\S+\.\S+$/.test(email || '')) return toast('Escribe un email válido');
  if (pw.length < 6) return toast('La contraseña debe tener al menos 6 caracteres');
  ui.cloudEmail = email;
  try {
    await (kind === 'up' ? api.cloudSignUp(email, pw) : api.cloudSignIn(email, pw));
    toast(`${icon('check', 14)} ${kind === 'up' ? 'Cuenta creada' : 'Conectado'}: sincronizando`);
    await refresh();
    renderHow(true);
  } catch (e) {
    toast(esc(cleanErr(e)), 4000);
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
  if (e.target.closest('#how') && ui.how !== 'open' && (ui.how === 'near' || document.body.classList.contains('web'))) return openHow();
  if (ui.reply && !e.target.closest('#reply, #agent')) hideReply();
  if (ui.layerMenu && !e.target.closest('.layer-menu, .layer-pill')) { ui.layerMenu = false; renderHead(); }
  if (ui.card && !e.target.closest('#card, #how')) return closeCard(); // primer clic fuera: solo cerrar
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
  const s = e.target.dataset?.setting;
  if (s) { await api.setSettings({ [s]: e.target.checked }); await refresh(); }
  const t = e.target.dataset?.settingText;
  if (t && e.target.value.trim()) await api.setSettings({ [t]: e.target.value.trim() });
  const f = e.target.closest('form[data-form]');
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
        await run('update_milestone', { id: f.dataset.id, title: d.title, date: d.date, kind: d.kind, time: d.time });
        await refresh();
        return swapCard({ type: 'ms', id: f.dataset.id });
      }
      const projectId = await ensureProject();
      const m = await run('create_milestone', { projectId, title: d.title, date: d.date, kind: d.kind, time: d.time });
      for (const t of (d.topics || '').split('\n').map((s) => s.trim()).filter(Boolean)) await run('add_topic', { projectId, milestoneId: m.id, title: t });
      toast(`${icon('check', 14)} ${KIND_LABEL[d.kind]} añadido`);
      await refresh();
      swapCard({ type: 'ms', id: m.id });
    }
    if (f.dataset.form === 'block') {
      if (f.dataset.id) {
        const was = S.db.tasks.filter((t) => t.blockId === f.dataset.id).map((t) => t.id);
        for (const id of was.filter((x) => !taskIds.includes(x))) await run('update_task', { id, blockId: '' });
        await run('update_block', { id: f.dataset.id, title: d.title, date: d.date, endDate: d.endDate || '', start: d.start || '', end: d.end || '', taskIds });
        await refresh();
        return swapCard({ type: 'block', id: f.dataset.id });
      }
      const projectId = await ensureProject();
      const b = await run('create_block', { projectId, milestoneId: d.milestoneId || undefined, title: d.title, date: d.date, endDate: d.endDate || undefined, start: d.start || undefined, end: d.end || undefined, taskIds });
      toast(`${icon('check', 14)} Bloque creado`);
      await refresh();
      swapCard({ type: 'block', id: b.id });
    }
    if (f.dataset.form === 'goal') {
      const input = { title: d.title, date: d.date, time: d.time || '', projectId: d.goalProject || '', notes: d.notes || '' };
      const g = f.dataset.id ? await run('update_goal', { id: f.dataset.id, ...input }) : await run('create_goal', { ...input, time: d.time || undefined, projectId: d.goalProject || undefined });
      if (!f.dataset.id) toast(`${icon('target', 14)} Objetivo marcado`);
      await refresh();
      return swapCard({ type: 'goal', id: g.id });
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
  const inp = e.target.closest?.('.inline-add');
  if (inp && e.key === 'Enter' && inp.value.trim()) {
    const v = inp.value.trim();
    inp.value = '';
    const kind = inp.dataset.add;
    if (kind === 'task') await run('add_tasks', { topicId: inp.dataset.topic, titles: v.split(/\s*;\s*/) });
    if (kind === 'topic') await run('add_topic', { projectId: inp.dataset.project, milestoneId: inp.dataset.ms || undefined, title: v });
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
  if (e.key === 'Escape') {
    if (ui.card) return closeCard();
    if (ui.how === 'open') return closeHow();
    if (ui.reply) return hideReply();
  }
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'ArrowLeft') changeMonth(-1);
  else if (e.key === 'ArrowRight') changeMonth(1);
  else if (e.key === '/') { e.preventDefault(); openAgent(); }
});

// Móvil: deslizar a los lados cambia de mes
let touch0 = null;
$('#cal').addEventListener('touchstart', (e) => (touch0 = e.touches[0] && { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }), { passive: true });
$('#cal').addEventListener('touchend', (e) => {
  const t = e.changedTouches[0];
  if (!touch0 || !t || ui.card || pdrag?.started || Date.now() - lastDragEnd < 400) return;
  const dx = t.clientX - touch0.x, dy = t.clientY - touch0.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - touch0.t < 600) changeMonth(dx < 0 ? 1 : -1);
  touch0 = null;
}, { passive: true });

// Rueda = cambiar de mes
let wheelLock = 0;
$('#cal').addEventListener('wheel', (e) => {
  if (ui.card || Math.abs(e.deltaY) < 30 || Date.now() < wheelLock) return;
  wheelLock = Date.now() + 450;
  changeMonth(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
function changeMonth(d) {
  const m = parse(ui.month);
  m.setMonth(m.getMonth() + d);
  return goMonth(iso(m), d);
}
async function goMonth(month, d) {
  closeCard(true);
  ui.month = month;
  S = await api.state(gridRange());
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
// --- Fondo aurora: manchas de 2–3 tonos muy difuminadas que reaccionan al ratón, a los clics y al arrastre ---
const AURORA = {
  dark: { base: [15, 14, 18], colors: [[217, 119, 87], [104, 86, 214], [34, 66, 160]], blend: 'lighter', power: 0.2 },
  light: { base: [243, 241, 235], colors: [[226, 128, 96], [140, 118, 226], [96, 146, 226]], blend: 'source-over', power: 0.2 },
};
const aur = {
  on: false, raf: 0, last: 0, t0: performance.now(), pulses: [], trail: 0,
  mouse: { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, near: 0, tnear: 0 },
  blobs: [
    { c: 0, x: 0.12, y: 0.1, r: 0.42, ax: 0.08, ay: 0.06, s: 0.06, p: 0 },
    { c: 1, x: 0.92, y: 0.2, r: 0.38, ax: 0.06, ay: 0.1, s: 0.05, p: 2 },
    { c: 2, x: 0.6, y: 0.95, r: 0.45, ax: 0.1, ay: 0.05, s: 0.05, p: 4 },
    { c: 0, x: 0.9, y: 0.9, r: 0.3, ax: 0.05, ay: 0.06, s: 0.08, p: 1, follow: true },
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
  m.x += (m.tx - m.x) * 0.06;
  m.y += (m.ty - m.y) * 0.06;
  m.near += (m.tnear - m.near) * 0.05;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = `rgba(${P.base.join(',')},${0.55 + alpha * 0.45})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = P.blend;
  const blob = (x, y, r, col, a) => {
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * Math.max(W, H));
    g.addColorStop(0, `rgba(${col.join(',')},${a})`);
    g.addColorStop(1, `rgba(${col.join(',')},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  for (const b of aur.blobs) {
    let x = b.x + Math.sin(t * b.s + b.p) * b.ax;
    let y = b.y + Math.cos(t * b.s * 1.3 + b.p) * b.ay;
    if (b.follow) (x += (m.x - x) * 0.75 * m.near), (y += (m.y - y) * 0.75 * m.near);
    const r = b.r * (1 + 0.06 * Math.sin(t * 0.4 + b.p)) * (b.follow ? 0.7 + 0.5 * m.near : 1);
    blob(x, y, r, P.colors[b.c], P.power * (b.follow ? 0.4 + 0.6 * m.near : 1));
  }
  aur.pulses = aur.pulses.filter((p) => now - p.t0 < p.life);
  for (const p of aur.pulses) {
    const k = (now - p.t0) / p.life;
    blob(p.x, p.y, p.r0 + p.r1 * ease(k), P.colors[p.c], P.power * 1.8 * p.a * Math.pow(1 - k, 2));
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
  if (e.buttons && performance.now() - aur.trail > 110) { // al arrastrar deja estela
    aur.trail = performance.now();
    aur.pulses.push({ ...p, t0: aur.trail, life: 900, r0: 0.04, r1: 0.18, c: 1, a: 0.6 });
  }
}, { passive: true });
document.addEventListener('pointerleave', () => (aur.mouse.tnear = 0));
window.addEventListener('blur', () => (aur.mouse.tnear = 0));
let pulseC = 0;
window.addEventListener('pointerdown', (e) => {
  if (!aur.on) return;
  const p = toLocal(e);
  aur.pulses.push({ ...p, t0: performance.now(), life: 1500, r0: 0.05, r1: e.button === 2 ? 0.35 : 0.5, c: pulseC++ % 3, a: 1 });
}, { passive: true });

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
  renderDots();
  await refresh();
})();


// ================= Interacción propia =================

// ---------- Onda al pulsar ----------
const RIPPLE = 'button, .list-row, .task, .pchip, .bar, .cell, .layer-pill, .topic-h, .goal-check, .color-btn, .ctx-item, .how.near, .agent:not(.open)';
window.addEventListener('pointerdown', (e) => {
  const el = e.target.closest(RIPPLE);
  if (!el || e.target.closest('input, textarea, select')) return;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const clip = document.createElement('div');
  clip.className = 'ripple-clip';
  Object.assign(clip.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: cs.borderRadius, color: el.matches('.bar, .btn.primary, .agent') ? '#fff' : 'var(--accent)' });
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
    if (type === 'ms') return [{ label: 'Abrir', icon: 'arrow', run: () => open('ms') }, { label: 'Editar', icon: 'edit', run: () => open('edit-ms') }, { label: 'Planificar estudio', icon: 'wand', run: () => open('plan') }, '-', del('milestone')];
    if (type === 'goal') {
      const g = byId(S.db.goals, id);
      return [{ label: 'Abrir', icon: 'arrow', run: () => open('goal') }, { label: g?.done ? 'Marcar como no conseguido' : 'Marcar como conseguido', icon: 'target', run: () => run('update_goal', { id, done: !g?.done }) }, { label: 'Editar', icon: 'edit', run: () => open('edit-goal') }, '-', del('goal')];
    }
    if (type === 'block') {
      const b = byId(S.db.blocks, id);
      const items = [{ label: 'Abrir', icon: 'arrow', run: () => open('block') }, { label: 'Editar', icon: 'edit', run: () => open('edit-block') }];
      if (b && S.stats.blocks[id]?.manual) items.push({ label: b.done ? 'Marcar como pendiente' : 'Marcar como hecho', icon: 'check', run: () => run('update_block', { id, done: !b.done }) });
      if (b && blockEnd(b) < S.today && S.stats.blocks[id]?.pct < 100) items.push({ label: 'Pasar lo pendiente al siguiente bloque', icon: 'redo', run: () => run('rollover_pending', {}) });
      return [...items, '-', del('block')];
    }
    if (type === 'ext') return [{ label: 'Ver detalles', icon: 'arrow', run: () => open('ext') }];
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
  const items = [{ label: 'Hoy', icon: 'cal', k: 'T', run: () => actions.today() }, { label: '¿Cómo vas?', icon: 'sun', run: () => openHow() }];
  if ((S.db.layers || []).length) items.push('-', { h: 'Capa' }, { label: 'Todo', icon: 'layers', on: ui.layer === 'all', run: () => actions['set-layer']({ dataset: { id: 'all' } }) }, ...S.db.layers.map((l) => ({ label: l.name, icon: 'layers', on: ui.layer === l.id, run: () => actions['set-layer']({ dataset: { id: l.id } }) })));
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
let press = null;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  const { clientX: x, clientY: y, target } = e;
  press = setTimeout(() => { ui.suppressClick = true; navigator.vibrate?.(12); openCtx(x, y, ctxFor(target)); }, 520);
});
['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => clearTimeout(press)));
document.addEventListener('pointermove', (e) => { if (press && e.pointerType === 'touch' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 6)) clearTimeout(press); });

// ---------- Arrastre propio de barras (bloques, objetivos, exámenes) ----------
let pdrag = null, lastDragEnd = 0;
weeksEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const bar = e.target.closest('.bar');
  if (!bar || !['block', 'goal', 'ms'].includes(bar.dataset.type)) return;
  const cell = $$('.cell', bar.closest('.week'))[colAt(e.clientX)];
  pdrag = { bar, type: bar.dataset.type, id: bar.dataset.id, x0: e.clientX, y0: e.clientY, from: cell?.dataset.date, started: false };
});
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
