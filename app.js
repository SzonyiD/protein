import * as db from './db.js';
import * as c from './calc.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const RING_C = 2 * Math.PI * 96;

const S = {
  today: c.dayKey(),
  day: c.dayKey(),
  entries: [],
  weights: [],
  settings: { ...c.DEFAULT_SETTINGS },
  templates: c.DEFAULT_TEMPLATES,
  prepit: [],
  training: {},
};

// ---------- betöltés ----------
async function load() {
  [S.entries, S.weights] = await Promise.all([db.getAll('entries'), db.getAll('weights')]);
  S.settings = { ...c.DEFAULT_SETTINGS, ...(await db.getKV('settings', {})) };
  S.templates = await db.getKV('templates', null);
  if (!S.templates) {
    S.templates = c.DEFAULT_TEMPLATES;
    await db.setKV('templates', S.templates);
  }
  S.prepit = await db.getKV('prepit', []);
  S.training = await db.getKV('training', {});
  if (!S.weights.length) {
    const w = { date: S.today, kg: S.settings.startWeight };
    S.weights = [w];
    await db.put('weights', w);
  }
}

const weightFor = (key) => c.weightOn(S.weights, key, S.settings.startWeight);
const targetOf = (key) => c.targetFor(weightFor(key), S.settings.gPerKg);
const dayEntries = (key) => S.entries.filter((e) => e.date === key).sort((a, b) => a.time.localeCompare(b.time));

// ---------- adatműveletek ----------
async function addEntry({ name, protein, time, date, source }) {
  const e = {
    id: c.uid(),
    date: date || S.day,
    time: time || (S.day === S.today ? c.timeHM() : '12:00'),
    name: String(name).trim() || 'Tétel',
    protein: Math.round(protein * 10) / 10,
    source: source || 'manual',
  };
  S.entries.push(e);
  await db.put('entries', e);
  return e;
}

async function removeEntries(ids) {
  const set = new Set(ids);
  const removed = S.entries.filter((e) => set.has(e.id));
  S.entries = S.entries.filter((e) => !set.has(e.id));
  await Promise.all(ids.map((id) => db.del('entries', id)));
  return removed;
}

async function restoreEntries(list) {
  S.entries.push(...list);
  await db.putMany('entries', list);
}

// ---------- kirajzolás: Ma ----------
function renderMa() {
  const { weekday, date } = c.dateLabel(S.day);
  $('day-weekday').textContent = S.day === S.today ? `Ma · ${weekday}` : weekday;
  $('day-date').textContent = date;
  $('day-next').disabled = S.day >= S.today;
  $('go-today').hidden = S.day === S.today;
  $('log-title').textContent = S.day === S.today ? 'Ma' : 'Napló';
  $('weight-val').textContent = c.fmt(weightFor(S.today), 1);

  const totals = c.totalsByDay(S.entries);
  const total = totals.get(S.day) || 0;
  const target = targetOf(S.day);
  const frac = Math.min(total / target, 1);

  const fg = $('ring-fg');
  fg.style.strokeDasharray = `${frac * RING_C} ${RING_C}`;
  fg.style.strokeOpacity = total > 0 ? 1 : 0;
  $('ring-wrap').classList.toggle('done', total >= target);
  $('ring-wrap').setAttribute('aria-label', `${c.fmt(total)} gramm a ${target} grammos célból`);
  $('ring-num').textContent = c.fmt(total);
  $('ring-target').textContent = target;

  const missing = target - total;
  $('t-missing-l').textContent = missing > 0 ? 'Hiányzik' : 'Cél felett';
  $('t-missing').textContent = missing > 0 ? `${c.fmt(missing)} g` : `+${c.fmt(-missing)} g`;
  $('t-gkg').textContent = c.fmt(total / weightFor(S.day), 2);
  $('t-streak').textContent = `${c.streak(totals, S.today, targetOf)} nap`;

  const trained = !!S.training[S.day];
  $('train-toggle').setAttribute('aria-pressed', String(trained));
  $('train-label').textContent = trained ? 'Edzésnap' : 'Edzésnap?';

  renderQuick();
  renderLog();
  renderWeek(totals);
}

function renderQuick() {
  $('quick').innerHTML = S.templates.map((t) => {
    let val = '';
    if (t.kind === 'fixed') val = `<span class="q-val">${c.fmt(t.protein)} g</span>`;
    else if (t.kind === 'shake') val = `<span class="q-val">${c.fmt(c.shakeProtein(t.defaultMl, t.scoop, t.milkPerL))} g</span>`;
    else if (t.kind === 'chicken') val = '<span class="q-val dim">g →</span>';
    else if (t.kind === 'prepit') val = '<span class="q-val dim">lista</span>';
    else if (t.kind === 'repeat') val = '<span class="q-val dim">↺</span>';
    return `<button class="q" data-t="${esc(t.id)}"><span class="q-name">${esc(t.name)}</span>${val}</button>`;
  }).join('');
}

function renderLog() {
  const list = dayEntries(S.day);
  if (!list.length) {
    $('log').innerHTML = `<div class="empty">${S.day === S.today ? 'Még nincs bejegyzés ma. Kezdd egy gyors sablonnal.' : 'Ezen a napon nincs bejegyzés.'}</div>`;
    return;
  }
  $('log').innerHTML = list.map((e) => `
    <div class="entry" data-id="${esc(e.id)}">
      <div class="entry-del" aria-hidden="true">Törlés</div>
      <button class="entry-row" data-id="${esc(e.id)}" aria-label="${esc(e.name)}, ${c.fmt(e.protein, e.protein % 1 ? 1 : 0)} gramm, ${esc(e.time)}. Koppints a szerkesztéshez.">
        <span class="e-time">${esc(e.time)}</span>
        <span class="e-name">${esc(e.name)}</span>
        <span class="e-val">${c.fmt(e.protein, e.protein % 1 ? 1 : 0)} g</span>
      </button>
    </div>`).join('');
}

function renderWeek(totals) {
  const sevenAgo = c.addDays(S.today, -6);
  const end = S.day >= sevenAgo ? S.today : c.addDays(S.day, 3) > S.today ? S.today : c.addDays(S.day, 3);
  const days = c.lastNDays(totals, end, 7);
  const target = targetOf(S.day);
  const max = Math.max(target * 1.2, ...days.map((d) => d.total * 1.06));
  const H = 120;

  $('bars').innerHTML = `<div class="target-line" style="bottom:${(target / max) * H}px"></div>` +
    days.map((d) => {
      const cls = ['bar', d.key === S.day ? 'sel' : '', d.total >= targetOf(d.key) ? 'hit' : ''].join(' ');
      return `<button class="${cls}" data-day="${d.key}" style="height:${Math.max(4, (d.total / max) * H)}px" aria-label="${c.dateLabel(d.key).date}: ${c.fmt(d.total)} gramm"></button>`;
    }).join('');
  $('bar-labels').innerHTML = days.map((d) => `<span class="${d.key === S.day ? 'sel' : ''}">${d.label}</span>`).join('');

  const done = days.filter((d) => d.key !== S.today && d.total > 0);
  $('avg7').textContent = done.length ? `${c.fmt(done.reduce((a, d) => a + d.total, 0) / done.length)} g` : '–';
}

// ---------- kirajzolás: Súly, Beállítások ----------
function renderSuly() {
  const list = [...S.weights].sort((a, b) => b.date.localeCompare(a.date));
  $('weight-log').innerHTML = list.map((w) => `
    <div class="entry"><button class="entry-row" data-wdate="${w.date}">
      <span class="e-name">${c.dateLabel(w.date).date} <span class="muted small">${w.date.slice(0, 4)}</span></span>
      <span class="e-val">${c.fmt(w.kg, 1)} kg</span>
    </button></div>`).join('');
}

function renderBeall() {
  $('gpk').value = S.settings.gPerKg;
  $('gpk-val').textContent = c.fmt(S.settings.gPerKg, 1);
  $('gpk-hint').textContent = `Napi cél ${c.fmt(weightFor(S.today), 1)} kg mellett: ${targetOf(S.today)} g`;
}

function render() {
  renderMa();
  renderSuly();
  renderBeall();
}

// ---------- toast ----------
let toastTimer = null;
let toastUndo = null;
function toast(msg, undo) {
  $('toast-msg').textContent = msg;
  $('toast-undo').hidden = !undo;
  toastUndo = undo || null;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; toastUndo = null; }, 4500);
}
$('toast-undo').addEventListener('click', async () => {
  const fn = toastUndo;
  $('toast').hidden = true;
  toastUndo = null;
  if (fn) { await fn(); render(); }
});

async function quickAdd(data) {
  const e = await addEntry(data);
  render();
  toast(`+${c.fmt(e.protein, e.protein % 1 ? 1 : 0)} g · ${e.name}`, () => removeEntries([e.id]));
}

// ---------- bottom sheet ----------
function openSheet(title, html, bind) {
  $('sheet-title').textContent = title;
  $('sheet-body').innerHTML = html;
  $('sheet').hidden = false;
  $('backdrop').hidden = false;
  bind($('sheet-body'));
  const first = $('sheet-body').querySelector('[data-autofocus]');
  if (first) first.focus();
}
function closeSheet() {
  $('sheet').hidden = true;
  $('backdrop').hidden = true;
  $('sheet-body').innerHTML = '';
}
$('backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

function entrySheet(existing, preset = {}) {
  const e = existing || { name: preset.name || '', protein: preset.protein ?? '', time: S.day === S.today ? c.timeHM() : '12:00' };
  openSheet(existing ? 'Bejegyzés' : 'Kézi bevitel', `
    <label class="field"><span class="field-l">Megnevezés</span>
      <input type="text" id="f-name" value="${esc(e.name)}" placeholder="pl. Görög joghurt" ${existing || preset.name ? '' : 'data-autofocus'}></label>
    <div class="row2">
      <label class="field"><span class="field-l">Fehérje (g)</span>
        <input type="text" id="f-prot" inputmode="decimal" value="${e.protein === '' ? '' : c.fmt(e.protein, e.protein % 1 ? 1 : 0)}" ${!existing && preset.name ? 'data-autofocus' : ''}></label>
      <label class="field"><span class="field-l">Időpont</span>
        <input type="time" id="f-time" value="${esc(e.time)}"></label>
    </div>
    <button class="btn" id="f-save">${existing ? 'Mentés' : 'Hozzáadás'}</button>
    ${existing ? '<button class="btn danger" id="f-del">Törlés</button>' : ''}
  `, (root) => {
    root.querySelector('#f-save').addEventListener('click', async () => {
      const name = root.querySelector('#f-name').value.trim();
      const protein = c.parseNum(root.querySelector('#f-prot').value);
      const time = root.querySelector('#f-time').value || c.timeHM();
      if (!name || !(protein >= 0)) { root.querySelector(name ? '#f-prot' : '#f-name').focus(); return; }
      if (existing) {
        Object.assign(existing, { name, protein: Math.round(protein * 10) / 10, time });
        await db.put('entries', existing);
        closeSheet();
        render();
      } else {
        closeSheet();
        await quickAdd({ name, protein, time, source: 'manual' });
      }
    });
    const del = root.querySelector('#f-del');
    if (del) del.addEventListener('click', async () => {
      closeSheet();
      await deleteWithUndo(existing.id);
    });
  });
}

async function deleteWithUndo(id) {
  const removed = await removeEntries([id]);
  render();
  if (removed.length) toast(`Törölve · ${removed[0].name}`, () => restoreEntries(removed));
}

function shakeSheet(t) {
  let ml = t.defaultMl;
  openSheet('Shake', `
    <label class="field"><span class="field-l">Tej mennyisége (ml) · 1 adag por ${c.fmt(t.scoop)} g</span>
      <div class="stepper">
        <button type="button" id="ml-minus" aria-label="50 ml-rel kevesebb">−</button>
        <input type="text" id="ml" inputmode="numeric" value="${ml}">
        <button type="button" id="ml-plus" aria-label="50 ml-rel több">+</button>
      </div></label>
    <div class="result"><span class="muted">Fehérje</span><b id="ml-res"></b></div>
    <button class="btn" id="ml-add">Hozzáadás</button>
  `, (root) => {
    const inp = root.querySelector('#ml');
    const upd = () => { root.querySelector('#ml-res').textContent = `${c.fmt(c.shakeProtein(ml, t.scoop, t.milkPerL), 1)} g`; };
    const set = (v) => { ml = Math.max(0, Math.min(1000, v)); inp.value = ml; upd(); };
    root.querySelector('#ml-minus').addEventListener('click', () => set(ml - 50));
    root.querySelector('#ml-plus').addEventListener('click', () => set(ml + 50));
    inp.addEventListener('input', () => { const v = c.parseNum(inp.value); ml = v >= 0 ? v : 0; upd(); });
    upd();
    root.querySelector('#ml-add').addEventListener('click', async () => {
      closeSheet();
      await quickAdd({ name: ml ? `Shake · ${ml} ml tej` : 'Shake · vízzel', protein: c.shakeProtein(ml, t.scoop, t.milkPerL), source: 'shake' });
    });
  });
}

function chickenSheet(t) {
  let cooked = false;
  openSheet('Csirkemell', `
    <label class="field"><span class="field-l">Mennyiség (g)</span>
      <input type="text" id="ch-g" inputmode="numeric" placeholder="pl. 325" data-autofocus></label>
    <div class="seg" role="group" aria-label="Súly típusa">
      <button type="button" id="ch-raw" aria-pressed="true">Nyers · ${t.raw} g/100 g</button>
      <button type="button" id="ch-cooked" aria-pressed="false">Sült · ${t.cooked} g/100 g</button>
    </div>
    <div class="result"><span class="muted">Fehérje</span><b id="ch-res">–</b></div>
    <button class="btn" id="ch-add">Hozzáadás</button>
  `, (root) => {
    const g = () => c.parseNum(root.querySelector('#ch-g').value);
    const upd = () => {
      root.querySelector('#ch-raw').setAttribute('aria-pressed', String(!cooked));
      root.querySelector('#ch-cooked').setAttribute('aria-pressed', String(cooked));
      root.querySelector('#ch-res').textContent = g() > 0 ? `${c.fmt(c.chickenProtein(g(), cooked, t.raw, t.cooked), 1)} g` : '–';
    };
    root.querySelector('#ch-g').addEventListener('input', upd);
    root.querySelector('#ch-raw').addEventListener('click', () => { cooked = false; upd(); });
    root.querySelector('#ch-cooked').addEventListener('click', () => { cooked = true; upd(); });
    root.querySelector('#ch-add').addEventListener('click', async () => {
      const grams = g();
      if (!(grams > 0)) { root.querySelector('#ch-g').focus(); return; }
      closeSheet();
      await quickAdd({ name: `Csirkemell · ${c.fmt(grams)} g ${cooked ? 'sült' : 'nyers'}`, protein: c.chickenProtein(grams, cooked, t.raw, t.cooked), source: 'chicken' });
    });
  });
}

function prepitSheet() {
  const saved = [...S.prepit].sort((a, b) => (b.used || 0) - (a.used || 0));
  openSheet('Prepit ebéd', `
    ${saved.length ? `<div class="list-pick">${saved.map((p, i) => `
      <button class="q" data-i="${i}"><span class="q-name">${esc(p.name)}</span><span class="q-val">${c.fmt(p.protein, p.protein % 1 ? 1 : 0)} g</span></button>`).join('')}</div>`
      : '<p class="muted small" style="margin:0">Még nincs mentett menü. Az első után egy érintéssel választhatod.</p>'}
    <div class="eyebrow">Új menü</div>
    <label class="field"><span class="field-l">Menü neve</span><input type="text" id="pp-name" placeholder="pl. Csirkés rizottó"></label>
    <label class="field"><span class="field-l">Fehérje a dobozon (g)</span><input type="text" id="pp-prot" inputmode="decimal"></label>
    <button class="btn" id="pp-add">Mentés és hozzáadás</button>
  `, (root) => {
    root.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', async () => {
      const p = saved[Number(b.dataset.i)];
      p.used = (p.used || 0) + 1;
      await db.setKV('prepit', S.prepit);
      closeSheet();
      await quickAdd({ name: `Prepit · ${p.name}`, protein: p.protein, source: 'prepit' });
    }));
    root.querySelector('#pp-add').addEventListener('click', async () => {
      const name = root.querySelector('#pp-name').value.trim();
      const protein = c.parseNum(root.querySelector('#pp-prot').value);
      if (!name) { root.querySelector('#pp-name').focus(); return; }
      if (!(protein >= 0)) { root.querySelector('#pp-prot').focus(); return; }
      const ex = S.prepit.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (ex) { ex.protein = protein; ex.used = (ex.used || 0) + 1; }
      else S.prepit.push({ name, protein, used: 1 });
      await db.setKV('prepit', S.prepit);
      closeSheet();
      await quickAdd({ name: `Prepit · ${name}`, protein, source: 'prepit' });
    });
  });
}

async function repeatYesterday() {
  const src = dayEntries(c.addDays(S.day, -1));
  if (!src.length) { toast('Az előző napon nem volt bejegyzés.'); return; }
  const added = [];
  for (const e of src) added.push(await addEntry({ name: e.name, protein: e.protein, time: e.time, source: 'repeat' }));
  render();
  const sum = added.reduce((a, e) => a + e.protein, 0);
  toast(`+${c.fmt(sum)} g · ${added.length} tétel az előző napból`, () => removeEntries(added.map((e) => e.id)));
}

function weightSheet(dateKey) {
  const key = dateKey || S.today;
  const ex = S.weights.find((w) => w.date === key);
  openSheet('Testsúly', `
    <label class="field"><span class="field-l">${c.dateLabel(key).date} · kg</span>
      <input type="text" id="w-kg" inputmode="decimal" value="${ex ? c.fmt(ex.kg, 1) : ''}" placeholder="${c.fmt(weightFor(key), 1)}" data-autofocus></label>
    <button class="btn" id="w-save">Mentés</button>
    ${ex && S.weights.length > 1 ? '<button class="btn danger" id="w-del">Mérés törlése</button>' : ''}
  `, (root) => {
    root.querySelector('#w-save').addEventListener('click', async () => {
      const kg = c.parseNum(root.querySelector('#w-kg').value);
      if (!(kg > 30 && kg < 300)) { root.querySelector('#w-kg').focus(); return; }
      const w = { date: key, kg: Math.round(kg * 10) / 10 };
      S.weights = S.weights.filter((x) => x.date !== key).concat(w);
      await db.put('weights', w);
      closeSheet();
      render();
      toast(`Súly mentve · ${c.fmt(w.kg, 1)} kg · cél ${targetOf(S.today)} g`);
    });
    const del = root.querySelector('#w-del');
    if (del) del.addEventListener('click', async () => {
      S.weights = S.weights.filter((x) => x.date !== key);
      await db.del('weights', key);
      closeSheet();
      render();
    });
  });
}

// ---------- események ----------
$('quick').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-t]');
  if (!b) return;
  const t = S.templates.find((x) => x.id === b.dataset.t);
  if (!t) return;
  if (t.kind === 'fixed') quickAdd({ name: t.detail ? `${t.name} · ${t.detail}` : t.name, protein: t.protein, source: t.id });
  else if (t.kind === 'shake') shakeSheet(t);
  else if (t.kind === 'chicken') chickenSheet(t);
  else if (t.kind === 'prepit') prepitSheet();
  else if (t.kind === 'repeat') repeatYesterday();
});

$('omni').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const inp = $('omni-in');
  const p = c.quickParse(inp.value);
  if (!p) { inp.focus(); return; }
  inp.value = '';
  if (p.protein != null) { inp.blur(); await quickAdd({ name: p.name, protein: p.protein, source: 'text' }); }
  else entrySheet(null, { name: p.name });
});

$('manual-btn').addEventListener('click', () => entrySheet(null));
$('day-prev').addEventListener('click', () => { S.day = c.addDays(S.day, -1); renderMa(); });
$('day-next').addEventListener('click', () => { if (S.day < S.today) { S.day = c.addDays(S.day, 1); renderMa(); } });
$('go-today').addEventListener('click', () => { S.day = S.today; renderMa(); });
$('bars').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-day]');
  if (b) { S.day = b.dataset.day; renderMa(); }
});
$('train-toggle').addEventListener('click', async () => {
  if (S.training[S.day]) delete S.training[S.day]; else S.training[S.day] = true;
  await db.setKV('training', S.training);
  renderMa();
});
$('weight-pill').addEventListener('click', () => weightSheet(S.today));
$('weight-add').addEventListener('click', () => weightSheet(S.today));
$('weight-log').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-wdate]');
  if (b) weightSheet(b.dataset.wdate);
});

// napló: koppintás = szerkesztés, balra húzás = törlés
let drag = null;
$('log').addEventListener('pointerdown', (ev) => {
  const row = ev.target.closest('.entry-row');
  if (!row) return;
  drag = { row, id: row.dataset.id, x0: ev.clientX, y0: ev.clientY, dx: 0, moved: false, horiz: null };
  row.classList.remove('snap');
});
$('log').addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const dx = ev.clientX - drag.x0;
  const dy = ev.clientY - drag.y0;
  if (drag.horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) drag.horiz = Math.abs(dx) > Math.abs(dy);
  if (!drag.horiz) return;
  drag.moved = true;
  drag.dx = Math.min(0, Math.max(-140, dx));
  drag.row.style.transform = `translateX(${drag.dx}px)`;
});
const endDrag = async () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.row.classList.add('snap');
  if (d.moved && d.dx < -80) {
    d.row.style.transform = 'translateX(-100%)';
    setTimeout(() => deleteWithUndo(d.id), 160);
  } else {
    d.row.style.transform = '';
    if (!d.moved) {
      const e = S.entries.find((x) => x.id === d.id);
      if (e) entrySheet(e);
    }
  }
};
$('log').addEventListener('pointerup', endDrag);
$('log').addEventListener('pointercancel', () => { if (drag) { drag.row.classList.add('snap'); drag.row.style.transform = ''; drag = null; } });
$('log').addEventListener('click', (ev) => {
  // billentyűzetes aktiválás (Enter/Space): detail === 0
  if (ev.detail !== 0) return;
  const row = ev.target.closest('.entry-row');
  const e = row && S.entries.find((x) => x.id === row.dataset.id);
  if (e) entrySheet(e);
});

// fülek
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  for (const name of ['ma', 'stat', 'suly', 'beall']) $(`screen-${name}`).hidden = name !== tab.dataset.screen;
  window.scrollTo(0, 0);
}));

// beállítások
$('gpk').addEventListener('input', async () => {
  S.settings.gPerKg = Math.round(Number($('gpk').value) * 10) / 10;
  await db.setKV('settings', S.settings);
  render();
});

$('export-btn').addEventListener('click', async () => {
  const data = await db.exportAll();
  const name = `protein-mentes-${S.today}.json`;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Protein mentés' }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

$('import-file').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!confirm(`Visszatöltöd a mentést? ${data.entries?.length ?? 0} bejegyzés kerül be, a mostani adatok helyére.`)) return;
    await db.importAll(data);
    await load();
    render();
    toast('Mentés visszatöltve.');
  } catch (err) {
    toast(`Hiba: ${err.message}`);
  }
});

// napváltás éjfélkor (ha az app háttérből tér vissza)
function checkDay() {
  const now = c.dayKey();
  if (now !== S.today) {
    const wasToday = S.day === S.today;
    S.today = now;
    if (wasToday) S.day = now;
    render();
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
setInterval(checkDay, 60000);

// ---------- indulás ----------
(async () => {
  await load();
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
