import {
  START, END, WEEKS, JALONS, KIND_LABEL,
  addDays, diffDays, mondayOf, toMs, todayStr, dayInfo, weekOf, getStatus,
} from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const TODAY = todayStr(new URLSearchParams(location.search).get('today'));
const KEY = 'planning-alternance:v1';

/* ---------- Dates et textes ---------- */
const fmt = (o) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...o });
const F = {
  dayLong: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
  dayMonth: fmt({ day: 'numeric', month: 'long' }),
  dayShort: fmt({ weekday: 'short', day: 'numeric', month: 'short' }),
  full: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  month: fmt({ month: 'long', year: 'numeric' }),
  monthShort: fmt({ month: 'short' }),
  weekday: fmt({ weekday: 'long' }),
};
const f = (fm, d) => fm.format(new Date(toMs(d)));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n) => (n > 1 ? 's' : '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const range = (a, b) => (a.slice(0, 7) === b.slice(0, 7) ? `${+a.slice(8)} au ${f(F.dayMonth, b)}` : `${f(F.dayMonth, a)} au ${f(F.dayMonth, b)}`);
const hh = (h) => {
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  return m ? `${hr} h ${String(m).padStart(2, '0')}` : `${hr} h`;
};
const eta = (date, done) => {
  const n = diffDays(TODAY, date);
  if (n < 0) return done ? '' : `en retard de ${-n} j`;
  if (n === 0) return 'aujourd’hui';
  if (n === 1) return 'demain';
  return `dans ${n} j`;
};
const etaClass = (date, done) => {
  if (done) return '';
  const n = diffDays(TODAY, date);
  return n < 0 ? 'late' : n <= 2 ? 'soon' : '';
};

const ICON = {
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  left: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
};

/* ---------- Rendus (stockés sur l'appareil) ---------- */
const RTYPES = [['ecole', 'École'], ['entreprise', 'Entreprise'], ['perso', 'Perso']];
const rlabel = (t) => (RTYPES.find((x) => x[0] === t) || [])[1] || 'Perso';
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const cleanRendu = (r) =>
  r && typeof r.id === 'string' && typeof r.titre === 'string' && isDate(r.date)
    ? { id: r.id, titre: r.titre.slice(0, 200), date: r.date, type: RTYPES.some((x) => x[0] === r.type) ? r.type : 'perso', lien: typeof r.lien === 'string' ? r.lien : '', note: typeof r.note === 'string' ? r.note : '', fait: !!r.fait }
    : null;

let rendus = load();
function load() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr.map(cleanRendu).filter(Boolean) : [];
  } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(rendus)); }
  catch { toast('Impossible d’enregistrer sur cet appareil'); }
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const byDate = (a, b) => a.date.localeCompare(b.date) || a.titre.localeCompare(b.titre);

function pendingByWeek() {
  const m = new Map();
  for (const r of rendus) {
    if (r.fait) continue;
    const w = weekOf(r.date);
    if (w) m.set(w.index, (m.get(w.index) || 0) + 1);
  }
  return m;
}

/* ---------- État ---------- */
const MONTH_MIN = START.slice(0, 7);
const MONTH_MAX = END.slice(0, 7);
const clampMonth = (m) => (m < MONTH_MIN ? MONTH_MIN : m > MONTH_MAX ? MONTH_MAX : m);
const state = { tab: 'home', month: clampMonth(TODAY.slice(0, 7)), filter: 'avenir', type: 'all', sheet: null, intro: false, heroKind: 'idle', sel: 0, lastFocus: null };

/* ---------- Aujourd'hui ---------- */
function weekInfoHtml(i) {
  const w = WEEKS[i];
  const n = pendingByWeek().get(i) || 0;
  let line;
  if (w.type === 'ecole') {
    line = `École, ${w.schoolDays} jour${plural(w.schoolDays)}`;
    if (w.days.some((d) => d.kind === 'examen')) line += ', avec un examen';
    if (w.days.some((d) => d.kind === 'evenement')) line += ', avec un événement pédagogique';
  } else if (w.type === 'final') {
    line = 'Oral du mastère sur convocation, dernier examen le vendredi 3 septembre';
  } else {
    line = 'Entreprise';
  }
  if (w.holidays.length) line += `, ${w.holidays.map((h) => `férié le ${f(F.dayLong, h.date)}`).join(', ')}`;
  if (n) line += `, ${n} rendu${plural(n)} à rendre`;
  return `<b>Semaine ${w.num}, du ${range(w.monday, w.sunday)}</b><span>${esc(line)}</span><button type="button" data-goto="${i}">Voir dans le calendrier</button>`;
}

function renderHome() {
  const st = getStatus(TODAY);
  const w = st.week;
  let kind = 'idle', word, top, say;
  if (st.phase === 'during') {
    kind = w.type;
    word = { ecole: 'École', entreprise: 'Entreprise', final: 'Oral et examen' }[kind];
    top = `Semaine ${w.num}, du ${range(w.monday, w.sunday)}`;
    if (st.next) {
      const lead = { ecole: 'École', entreprise: 'Retour en entreprise', final: 'Oral et examen' }[st.next.week.type];
      say = `${lead} ${st.next.days === 1 ? 'demain' : `dans ${st.next.days} jours`}, ${f(F.dayLong, st.next.week.monday)}.`;
    } else {
      say = `Fin de l’alternance le ${f(F.full, END)}.`;
    }
  } else if (st.phase === 'before') {
    word = 'Pas encore';
    top = 'Calendrier de l’alternance 2026-2027';
    say = `Début le ${f(F.full, START)}, dans ${diffDays(TODAY, START)} jours.`;
  } else {
    word = 'Terminé';
    top = 'Calendrier de l’alternance 2026-2027';
    say = `Le calendrier s’est achevé le ${f(F.full, END)}.`;
  }
  state.heroKind = kind;

  let chips = '', notes = '';
  if (w) {
    chips = `<ul class="days" aria-label="Jours de la semaine">${w.days.map((d, i) =>
      `<li class="chip ${d.kind}${d.ferie ? ' ferie' : ''}${d.date === TODAY ? ' today' : ''}" aria-label="${esc(cap(f(F.dayLong, d.date)))}, ${esc(dayLine(d.date))}"><span>${'LMMJVSD'[i]}</span><b>${+d.date.slice(8)}</b></li>`).join('')}</ul>`;
    const lines = w.days.filter((d) => d.ferie || ['examen', 'evenement', 'oral'].includes(d.kind));
    if (lines.length) notes = `<div class="notes">${lines.map((d) => `<p>${esc(cap(f(F.dayLong, d.date)))} : ${d.ferie ? esc(d.ferie) + ', férié' : esc(KIND_LABEL[d.kind].toLowerCase())}</p>`).join('')}</div>`;
  }

  const hero = `<section class="hero ${kind}">
    <p class="top">${esc(top)}</p>
    <h1 class="${word.length > 11 ? 'long' : ''}">${esc(word)}</h1>
    <p class="say">${esc(say)}</p>
    ${chips}${notes}
  </section>`;

  const r = st.remaining;
  const counts = st.phase === 'after' ? '' : `<section class="counts" aria-label="Semaines restantes">
    <div class="count ecole"><strong>${r.ecole}</strong><span>semaine${plural(r.ecole)} d’école restante${plural(r.ecole)}</span></div>
    <div class="count entreprise"><strong>${r.entreprise}</strong><span>semaine${plural(r.entreprise)} d’entreprise restante${plural(r.entreprise)}</span></div>
    <p class="fine">${st.phase === 'during' ? 'Semaine en cours comprise. ' : ''}Fin de l’alternance le ${f(F.full, END)}${st.daysToEnd > 0 ? `, dans ${st.daysToEnd} jours` : ''}.</p>
  </section>`;

  const pend = pendingByWeek();
  const bars = WEEKS.map((wk, i) => {
    const n = pend.get(i) || 0;
    const cls = [wk.type, wk.sunday < TODAY ? 'past' : '', st.week && st.week.index === i ? 'now' : '', n >= 2 ? 'hot' : ''].filter(Boolean).join(' ');
    return `<div class="wk ${cls}" style="--i:${i}"><span class="pips">${'<i class="pip"></i>'.repeat(Math.min(n, 3))}</span><span class="bar"></span></div>`;
  }).join('');
  let months = '';
  let prev = '';
  const starts = [];
  WEEKS.forEach((wk, i) => { const m = wk.monday.slice(0, 7); if (m !== prev) { starts.push([i, m]); prev = m; } });
  starts.forEach(([i, m], k) => {
    const next = k + 1 < starts.length ? starts[k + 1][0] : WEEKS.length;
    months += `<i style="grid-column:${i + 1} / ${next + 1}" title="${esc(cap(f(F.month, m + '-01')))}">${esc(cap(f(F.monthShort, m + '-01')).replace('.', '').charAt(0))}</i>`;
  });
  const sel = st.week ? st.week.index : st.phase === 'before' ? 0 : WEEKS.length - 1;
  state.sel = sel;
  const year = `<section class="year">
    <h2>Toute l’année</h2>
    <div class="strip" tabindex="0" role="slider" aria-label="Une barre par semaine, de la rentrée à la fin de l’alternance" aria-valuemin="1" aria-valuemax="${WEEKS.length}" aria-valuenow="${sel + 1}">${bars}</div>
    <div class="months" aria-hidden="true">${months}</div>
    <div class="weekinfo" id="weekinfo">${weekInfoHtml(sel)}</div>
    <p class="legend"><span><i class="l-ecole"></i>École</span><span><i class="l-entr"></i>Entreprise</span><span><i class="l-exam"></i>Oral et examen</span><span><i class="l-pip"></i>Rendu à faire</span></p>
  </section>`;

  const items = [];
  for (const x of rendus) if (!x.fait) items.push({ k: 'rendu', date: x.date, x });
  for (const j of JALONS) if ((j.end || j.date) >= TODAY) items.push({ k: 'jalon', date: j.date < TODAY ? TODAY : j.date, j });
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.k === 'rendu' ? -1 : 1));
  const shown = items.slice(0, 5);
  const rows = shown.map((it) => {
    const d = it.date;
    const when = `<div class="when"><b>${+d.slice(8)}</b><span>${esc(f(F.monthShort, d))}</span></div>`;
    if (it.k === 'rendu') {
      const x = it.x;
      const w2 = weekOf(x.date);
      return `<li><button type="button" class="due" data-edit="${x.id}">${when}<div class="what"><strong>${esc(x.titre)}</strong><small>${esc(rlabel(x.type))}${w2 ? `, semaine ${w2.num}` : ''}</small></div><span class="eta ${etaClass(x.date, false)}">${eta(x.date, false)}</span></button></li>`;
    }
    const j = it.j;
    const span = j.end ? `Du ${range(j.date, j.end)}` : cap(f(F.dayLong, j.date));
    return `<li><div class="due jalon">${when}<div class="what"><strong>${esc(j.title)}</strong><small>${esc(span)}, ${esc(j.detail.toLowerCase())}</small></div><span class="eta">${eta(d, false)}</span></div></li>`;
  }).join('');
  const hasRendu = rendus.some((x) => !x.fait);
  const dues = `<section class="dues">
    <h2>Prochaines échéances</h2>
    ${hasRendu ? '' : '<p class="empty">Aucun rendu à faire. Ajoute une date avec le bouton Nouveau rendu.</p>'}
    <ul>${rows}</ul>
    ${hasRendu ? '<button type="button" class="more" data-tab="rendus">Tous les rendus</button>' : ''}
  </section>`;

  return hero + counts + year + dues;
}

function selectWeek(i) {
  const strip = $('.strip');
  if (!strip) return;
  i = Math.max(0, Math.min(WEEKS.length - 1, i));
  state.sel = i;
  const old = strip.querySelector('.sel');
  if (old) old.classList.remove('sel');
  strip.children[i].classList.add('sel');
  strip.setAttribute('aria-valuenow', i + 1);
  const w = WEEKS[i];
  strip.setAttribute('aria-valuetext', `Semaine ${w.num}, du ${range(w.monday, w.sunday)}`);
  $('#weekinfo').innerHTML = weekInfoHtml(i);
}

function bindStrip() {
  const strip = $('.strip');
  if (!strip) return;
  selectWeek(state.sel);
  const strip0 = strip;
  const at = (x) => { const r = strip0.getBoundingClientRect(); return Math.floor(((x - r.left) / r.width) * WEEKS.length); };
  let down = false;
  strip.addEventListener('pointerdown', (e) => { down = true; selectWeek(at(e.clientX)); });
  strip.addEventListener('pointermove', (e) => { if (down || e.pointerType === 'mouse') selectWeek(at(e.clientX)); });
  const up = () => { down = false; };
  strip.addEventListener('pointerup', up);
  strip.addEventListener('pointercancel', up);
  strip.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1 }[e.key];
    if (step) { e.preventDefault(); selectWeek(state.sel + step); }
    else if (e.key === 'Home') { e.preventDefault(); selectWeek(0); }
    else if (e.key === 'End') { e.preventDefault(); selectWeek(WEEKS.length - 1); }
  });
}

/* ---------- Calendrier ---------- */
function dayLine(date) {
  const d = dayInfo(date);
  if (!d) return 'En dehors du calendrier de formation';
  switch (d.kind) {
    case 'formation': return `École, ${hh(d.hours)}`;
    case 'evenement': return `Événement pédagogique, ${hh(d.hours)}`;
    case 'examen': return `Examen, ${hh(d.hours)}`;
    case 'oral': return 'Oral du mastère, sur convocation';
    case 'ferie': return `Férié : ${d.ferie}`;
    case 'weekend': return d.ferie ? `Week-end, férié : ${d.ferie}` : 'Week-end';
    default: return 'Entreprise';
  }
}

function renderCalendar() {
  const [y, m] = state.month.split('-').map(Number);
  const first = `${state.month}-01`;
  const last = `${state.month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const byDay = new Map();
  for (const r of rendus) { if (!byDay.has(r.date)) byDay.set(r.date, []); byDay.get(r.date).push(r); }

  const rows = [];
  for (let cur = mondayOf(first); cur <= addDays(mondayOf(last), 6); cur = addDays(cur, 7)) {
    const w = weekOf(cur);
    const cells = [];
    for (let k = 0; k < 7; k++) {
      const date = addDays(cur, k);
      const info = dayInfo(date);
      const kind = info ? info.kind : k >= 5 ? 'weekend' : 'none';
      const list = byDay.get(date) || [];
      const dots = list.slice(0, 3).map((r) => `<i class="dot${r.fait ? ' done' : ''}"></i>`).join('');
      const cls = ['d', kind, info && info.ferie ? 'ferie' : '', date.slice(0, 7) !== state.month ? 'dim' : '', date === TODAY ? 'today' : ''].filter(Boolean).join(' ');
      cells.push(`<button type="button" class="${cls}" data-day="${date}" aria-label="${esc(cap(f(F.dayLong, date)))}, ${esc(dayLine(date))}${list.length ? `, ${list.length} rendu${plural(list.length)}` : ''}"><span class="n">${+date.slice(8)}</span><span class="dots">${dots}</span></button>`);
    }
    rows.push(`<div class="row ${w ? w.type : ''}"><span class="wnum" aria-hidden="true">${w ? 'S' + String(w.num).padStart(2, '0') : ''}</span>${cells.join('')}</div>`);
  }

  const title = cap(f(F.month, first));
  return `<section class="cal">
    <header class="cal-head">
      <div class="ct"><h1>${esc(title)}</h1>${state.month !== clampMonth(TODAY.slice(0, 7)) ? '<button type="button" class="pill" data-today>Revenir à aujourd’hui</button>' : ''}</div>
      <div class="nav">
        <button type="button" class="ib" data-month="-1" aria-label="Mois précédent" ${state.month <= MONTH_MIN ? 'disabled' : ''}>${ICON.left}</button>
        <button type="button" class="ib" data-month="1" aria-label="Mois suivant" ${state.month >= MONTH_MAX ? 'disabled' : ''}>${ICON.right}</button>
      </div>
    </header>
    <div class="dow" aria-hidden="true"><span></span>${'LMMJVSD'.split('').map((l) => `<span>${l}</span>`).join('')}</div>
    <div class="grid">${rows.join('')}</div>
    <p class="legend"><span><i class="l-ecole"></i>École</span><span><i class="l-entr"></i>Entreprise</span><span><i class="l-ferie"></i>Férié</span><span><i class="l-exam"></i>Examen</span><span><i class="l-evt"></i>Événement pédagogique</span><span><i class="l-pip"></i>Rendu</span></p>
  </section>`;
}

/* ---------- Rendus ---------- */
function itemHtml(r, showEta = true) {
  const d = eta(r.date, r.fait);
  return `<li class="item${r.fait ? ' fait' : ''}">
    <button type="button" class="chk" data-toggle="${r.id}" aria-pressed="${r.fait}" aria-label="${r.fait ? 'Remettre à faire' : 'Marquer comme fait'} : ${esc(r.titre)}"><span>${ICON.check}</span></button>
    <button type="button" class="body" data-edit="${r.id}">
      <strong>${esc(r.titre)}</strong>
      <span class="meta"><i class="tag ${r.type}">${esc(rlabel(r.type))}</i>${esc(f(F.dayShort, r.date))}</span>
      ${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}
    </button>
    <span class="side">${showEta && d ? `<span class="eta ${etaClass(r.date, r.fait)}">${d}</span>` : ''}${r.lien ? `<a class="lnk" href="${esc(r.lien)}" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le lien : ${esc(r.titre)}">${ICON.link}</a>` : ''}</span>
  </li>`;
}

function renderRendus() {
  const todo = state.filter === 'avenir';
  const list = rendus.filter((r) => r.fait === !todo && (state.type === 'all' || r.type === state.type)).sort(byDate);
  let body = '';
  if (!list.length) {
    body = `<p class="empty" style="margin-top:28px">${todo ? 'Aucun rendu à faire. Appuie sur Nouveau rendu pour ajouter une date, un lien et une note.' : 'Aucun rendu fait pour le moment.'}</p>`;
  } else if (!todo) {
    body = `<ul style="margin-top:22px">${list.reverse().map((r) => itemHtml(r, false)).join('')}</ul>`;
  } else {
    const groups = new Map();
    for (const r of list) {
      const w = weekOf(r.date);
      const key = r.date < TODAY ? 'late' : w ? w.index : 'out';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const keys = [...groups.keys()].sort((a, b) => (a === 'late' ? -1 : b === 'late' ? 1 : a === 'out' ? 1 : b === 'out' ? -1 : a - b));
    body = keys.map((k) => {
      const g = groups.get(k);
      let head;
      if (k === 'late') head = `<h2 class="grp late"><span class="sw"></span><span class="gt"><b>En retard</b></span><span class="load">${g.length} rendu${plural(g.length)}</span></h2>`;
      else if (k === 'out') head = `<h2 class="grp"><span class="sw"></span><span class="gt"><b>Hors calendrier</b></span><span class="load">${g.length} rendu${plural(g.length)}</span></h2>`;
      else {
        const w = WEEKS[k];
        const hot = g.length >= 2;
        head = `<h2 class="grp ${w.type}"><span class="sw"></span><span class="gt"><b>Semaine ${w.num}</b><small>du ${esc(range(w.monday, w.sunday))}${w.holidays.length ? `, semaine de ${5 - w.holidays.length} jours` : ''}</small></span><span class="load${hot ? ' hot' : ''}">${g.length} rendu${plural(g.length)}${hot ? ', semaine chargée' : ''}</span></h2>`;
      }
      return head + `<ul>${g.map((r) => itemHtml(r)).join('')}</ul>`;
    }).join('');
  }
  const chips = [['all', 'Tout'], ...RTYPES].map(([v, l]) => `<button type="button" data-type="${v}" aria-pressed="${state.type === v}">${l}</button>`).join('');
  return `<section class="rd">
    <h1>Rendus</h1>
    <div class="seg" role="group" aria-label="Statut"><button type="button" data-filter="avenir" aria-pressed="${todo}">À faire</button><button type="button" data-filter="faits" aria-pressed="${!todo}">Faits</button></div>
    <div class="chips" role="group" aria-label="Type">${chips}</div>
    ${body}
    <div class="backup">
      <p>Les rendus sont enregistrés sur cet appareil. Exporte un fichier pour les garder ou les passer sur un autre téléphone.</p>
      <div class="acts" style="margin-top:0"><button type="button" class="btn" data-export>Exporter</button><label class="btn" for="imp">Importer</label><input id="imp" type="file" accept="application/json,.json" hidden></div>
    </div>
  </section>`;
}

/* ---------- Affichage ---------- */
function render() {
  const y = window.scrollY;
  const view = $('#view');
  view.className = state.tab === 'home' && !state.intro ? 'intro' : '';
  view.innerHTML = state.tab === 'home' ? renderHome() : state.tab === 'calendar' ? renderCalendar() : renderRendus();
  if (state.tab === 'home') { state.intro = true; bindStrip(); }
  document.querySelectorAll('.tabbar button').forEach((b) => (b.dataset.tab === state.tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  window.scrollTo(0, y);
  setTheme();
}

function setTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  let c = v('--paper');
  if (state.tab === 'home') c = { ecole: v('--ecole'), entreprise: v('--entr'), final: v('--exam'), idle: v('--ink') }[state.heroKind] || c;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', c));
}

/* ---------- Feuilles ---------- */
function renderSheet() {
  const host = $('#sheet');
  const app = $('#app');
  const s = state.sheet;
  if (!s) {
    host.innerHTML = '';
    app.inert = false;
    document.querySelector('.tabbar').inert = false;
    document.querySelector('.fab').inert = false;
    if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus({ preventScroll: true });
    return;
  }
  let inner;
  if (s.type === 'day') {
    const w = weekOf(s.date);
    const list = rendus.filter((r) => r.date === s.date).sort(byDate);
    inner = `<h2 id="sheet-title">${esc(cap(f(F.dayLong, s.date)))}</h2>
      <p class="sub"><b>${esc(dayLine(s.date))}</b>${w ? `<br>Semaine ${w.num}, ${w.type === 'ecole' ? 'école' : w.type === 'final' ? 'oral et examen' : 'entreprise'}` : ''}</p>
      ${list.length ? `<ul>${list.map((r) => itemHtml(r, false)).join('')}</ul>` : ''}
      <div class="acts"><button type="button" class="btn primary" data-new-on="${s.date}">Ajouter un rendu ce jour</button><button type="button" class="btn" data-close>Fermer</button></div>`;
  } else {
    const r = s.id ? rendus.find((x) => x.id === s.id) : null;
    const v = r || { titre: '', date: s.date || '', type: 'ecole', lien: '', note: '' };
    inner = `<h2 id="sheet-title">${r ? 'Modifier le rendu' : 'Nouveau rendu'}</h2>
      <form id="rf" novalidate data-id="${r ? r.id : ''}">
        <div class="field"><label for="f-titre">Titre</label><input id="f-titre" name="titre" type="text" maxlength="200" autocomplete="off" value="${esc(v.titre)}" placeholder="Mémoire, partie 2"><p class="err" id="e-titre"></p></div>
        <div class="field"><label for="f-date">Date de rendu</label><input id="f-date" name="date" type="date" value="${esc(v.date)}"><p class="err" id="e-date"></p></div>
        <div class="field"><span class="lab" id="lab-type">Type</span><div class="types" role="radiogroup" aria-labelledby="lab-type">${RTYPES.map(([val, l]) => `<input type="radio" name="type" id="t-${val}" value="${val}" ${v.type === val ? 'checked' : ''}><label for="t-${val}">${l}</label>`).join('')}</div></div>
        <div class="field"><label for="f-lien">Lien (Drive, Figma, brief)</label><input id="f-lien" name="lien" type="url" inputmode="url" autocapitalize="off" autocomplete="off" value="${esc(v.lien)}" placeholder="https://"><p class="err" id="e-lien"></p></div>
        <div class="field"><label for="f-note">Note</label><textarea id="f-note" name="note" rows="2">${esc(v.note)}</textarea></div>
        <div class="acts"><button type="submit" class="btn primary">${r ? 'Enregistrer' : 'Ajouter le rendu'}</button>${r ? '<button type="button" class="btn danger" data-delete="' + r.id + '">Supprimer</button>' : '<button type="button" class="btn" data-close>Annuler</button>'}</div>
      </form>`;
  }
  host.innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="grab"></div>${inner}</div>`;
  app.inert = true;
  document.querySelector('.tabbar').inert = true;
  document.querySelector('.fab').inert = true;
  const focus = $('#f-titre') && !s.id ? $('#f-titre') : $('.sheet');
  if (focus === $('.sheet')) focus.setAttribute('tabindex', '-1');
  focus.focus({ preventScroll: true });
}
function openSheet(sheet) {
  if (!state.sheet) state.lastFocus = document.activeElement;
  state.sheet = sheet;
  renderSheet();
}
function closeSheet() { state.sheet = null; renderSheet(); }

/* ---------- Message ---------- */
let toastTimer;
function toast(msg, action) {
  const host = $('#toast');
  host.innerHTML = `<div class="toast"><span>${esc(msg)}</span>${action ? `<button type="button" data-undo>${esc(action.label)}</button>` : ''}</div>`;
  if (action) host.querySelector('[data-undo]').addEventListener('click', () => { action.fn(); host.innerHTML = ''; });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.innerHTML = ''; }, action ? 5000 : 2600);
}

/* ---------- Actions ---------- */
function setTab(tab) {
  state.tab = tab;
  if (tab === 'calendar') state.month = clampMonth(state.month);
  window.scrollTo(0, 0);
  render();
}
function afterChange() {
  render();
  if (state.sheet && state.sheet.type === 'day') renderSheet();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-month],[data-today],[data-day],[data-new],[data-new-on],[data-edit],[data-toggle],[data-close],[data-goto],[data-filter],[data-type],[data-export],[data-delete]');
  if (!t) return;
  const d = t.dataset;
  if (d.tab) setTab(d.tab);
  else if (d.month) { const [y, m] = state.month.split('-').map(Number); const n = new Date(Date.UTC(y, m - 1 + Number(d.month), 1)); state.month = clampMonth(n.toISOString().slice(0, 7)); render(); }
  else if ('today' in d) { state.month = clampMonth(TODAY.slice(0, 7)); render(); }
  else if (d.day) openSheet({ type: 'day', date: d.day });
  else if ('new' in d) openSheet({ type: 'form', id: null, date: '' });
  else if (d.newOn) openSheet({ type: 'form', id: null, date: d.newOn });
  else if (d.edit) openSheet({ type: 'form', id: d.edit });
  else if (d.toggle) { const r = rendus.find((x) => x.id === d.toggle); if (r) { r.fait = !r.fait; save(); afterChange(); } }
  else if ('close' in d) closeSheet();
  else if (d.goto) { state.tab = 'calendar'; state.month = clampMonth(WEEKS[Number(d.goto)].monday.slice(0, 7)); window.scrollTo(0, 0); render(); }
  else if (d.filter) { state.filter = d.filter; render(); }
  else if (d.type) { state.type = d.type; render(); }
  else if ('export' in d) exportData();
  else if (d.delete) {
    const i = rendus.findIndex((x) => x.id === d.delete);
    if (i < 0) return;
    const [gone] = rendus.splice(i, 1);
    save(); closeSheet(); render();
    toast('Rendu supprimé', { label: 'Annuler', fn: () => { rendus.push(gone); save(); render(); } });
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'rf') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const titre = String(fd.get('titre') || '').trim();
  const date = String(fd.get('date') || '');
  const type = String(fd.get('type') || 'ecole');
  let lien = String(fd.get('lien') || '').trim();
  const note = String(fd.get('note') || '').trim();
  const errs = {};
  if (!titre) errs.titre = 'Donne un titre au rendu.';
  if (!isDate(date)) errs.date = 'Choisis une date.';
  if (lien) {
    if (!/^https?:\/\//i.test(lien)) lien = 'https://' + lien;
    try { const u = new URL(lien); if (/\s/.test(lien) || !u.hostname.includes('.')) throw new Error('lien'); } catch { errs.lien = 'Ce lien n’est pas valide.'; }
  }
  ['titre', 'date', 'lien'].forEach((k) => {
    $('#e-' + k).textContent = errs[k] || '';
    $('#f-' + k).setAttribute('aria-invalid', errs[k] ? 'true' : 'false');
  });
  const bad = ['titre', 'date', 'lien'].find((k) => errs[k]);
  if (bad) { $('#f-' + bad).focus(); return; }
  const id = e.target.dataset.id;
  if (id) {
    const r = rendus.find((x) => x.id === id);
    if (r) Object.assign(r, { titre, date, type, lien, note });
  } else {
    rendus.push({ id: newId(), titre, date, type, lien, note, fait: false });
  }
  save(); closeSheet(); render();
  toast(id ? 'Rendu enregistré' : 'Rendu ajouté');
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sheet) closeSheet(); });

document.addEventListener('change', (e) => {
  if (e.target.id !== 'imp' || !e.target.files[0]) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const data = JSON.parse(String(rd.result));
      const incoming = (Array.isArray(data) ? data : data.rendus || []).map(cleanRendu).filter(Boolean);
      for (const r of incoming) { const i = rendus.findIndex((x) => x.id === r.id); if (i >= 0) rendus[i] = r; else rendus.push(r); }
      save(); render();
      toast(`${incoming.length} rendu${plural(incoming.length)} importé${plural(incoming.length)}`);
    } catch { toast('Ce fichier n’est pas une sauvegarde valide'); }
  };
  rd.readAsText(e.target.files[0]);
  e.target.value = '';
});

function exportData() {
  const blob = new Blob([JSON.stringify({ version: 1, exporte: TODAY, rendus }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rendus-alternance-${TODAY}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('Sauvegarde exportée');
}

/* Balayage horizontal sur le calendrier pour changer de mois. */
let sx = 0, sy = 0;
document.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', (e) => {
  if (state.tab !== 'calendar' || state.sheet || !e.target.closest('.grid')) return;
  const dx = e.changedTouches[0].clientX - sx;
  const dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 70 && Math.abs(dy) < 45) { const b = $(`[data-month="${dx < 0 ? 1 : -1}"]`); if (b && !b.disabled) b.click(); }
}, { passive: true });

/* ---------- Démarrage ---------- */
render();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
