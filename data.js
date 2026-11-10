// Calendrier de la formation en alternance, Digital Campus Montpellier, M2 2026-2027.
// Source : annexe 2 du calendrier de la formation (PDF DC_calendrier).
// Toutes les dates sont des chaînes AAAA-MM-JJ, calculées en UTC pour éviter les décalages d'heure.

export const START = '2026-08-24'; // lundi de la première semaine du calendrier (S35)
export const WEEK_COUNT = 54;
export const END = '2027-09-03'; // fin de la période (dernier examen)

const MS = 86400000;
export const toMs = (d) => Date.parse(d + 'T00:00:00Z');
export const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d, n) => fromMs(toMs(d) + n * MS);
export const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / MS); // b - a
export const dow = (d) => new Date(toMs(d)).getUTCDay() || 7; // 1 = lundi, 7 = dimanche
export const mondayOf = (d) => addDays(d, 1 - dow(d));

export function isoWeek(d) {
  const t = new Date(toMs(d));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t - y0) / MS + 1) / 7);
}

export function todayStr(override) {
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  const n = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

// Lundis des semaines de formation (7 h par jour, du lundi au vendredi).
const SCHOOL_MONDAYS = new Set([
  '2026-09-07', '2026-09-21', '2026-10-19', '2026-11-16', '2026-12-14', '2027-01-04', '2027-02-01',
  '2027-02-22', '2027-03-15', '2027-04-12', '2027-05-03', '2027-05-24', '2027-06-14', '2027-07-05',
]);
const SEM2_FROM = '2027-02-22';

export const FERIES = {
  '2026-11-01': 'Toussaint',
  '2026-11-11': 'Armistice',
  '2026-12-25': 'Noël',
  '2027-01-01': 'Jour de l’an',
  '2027-03-29': 'Lundi de Pâques',
  '2027-05-01': 'Fête du travail',
  '2027-05-06': 'Ascension',
  '2027-05-08': 'Victoire 1945',
  '2027-05-17': 'Lundi de Pentecôte',
  '2027-07-14': 'Fête nationale',
  '2027-08-15': 'Assomption',
};

// Jours qui sortent de la règle « semaine d'école = 5 jours de 7 h ».
const OVERRIDES = {
  '2026-12-16': { kind: 'evenement', hours: 7 },
  '2027-05-07': { kind: 'entreprise', hours: 0 }, // pont de l'Ascension, retour en entreprise
  '2027-07-07': { kind: 'formation', hours: 5.25 },
  '2027-07-08': { kind: 'examen', hours: 7 },
  '2027-07-09': { kind: 'entreprise', hours: 0 },
  '2027-09-03': { kind: 'examen', hours: 1.75 },
};
for (let i = 0; i < 5; i++) OVERRIDES[addDays('2027-05-24', i)] = { kind: 'evenement', hours: 7 };
for (let i = 0; i < 4; i++) OVERRIDES[addDays('2027-08-30', i)] = { kind: 'oral', hours: 0 };

export const KIND_LABEL = {
  formation: 'École',
  evenement: 'Événement pédagogique',
  examen: 'Examen',
  oral: 'Oral du mastère',
  entreprise: 'Entreprise',
  ferie: 'Férié',
  weekend: 'Week-end',
};

export const TYPE_LABEL = { ecole: 'École', entreprise: 'Entreprise', final: 'Oral et examen' };

function buildDay(date, schoolWeek, weekIndex) {
  const d = dow(date);
  const ferie = FERIES[date] || null;
  let kind;
  let hours = 0;
  if (d >= 6) kind = 'weekend';
  else if (ferie) kind = 'ferie';
  else if (OVERRIDES[date]) ({ kind, hours } = OVERRIDES[date]);
  else if (schoolWeek) { kind = 'formation'; hours = 7; }
  else kind = 'entreprise';
  return { date, dow: d, kind, hours, ferie, weekIndex };
}

function buildWeeks() {
  const weeks = [];
  for (let i = 0; i < WEEK_COUNT; i++) {
    const monday = addDays(START, i * 7);
    const school = SCHOOL_MONDAYS.has(monday);
    const days = [];
    for (let k = 0; k < 7; k++) days.push(buildDay(addDays(monday, k), school, i));
    const work = days.slice(0, 5);
    const hasOral = work.some((x) => x.kind === 'oral');
    const schoolDays = work.filter((x) => ['formation', 'evenement', 'examen'].includes(x.kind)).length;
    let type = 'entreprise';
    if (hasOral) type = 'final';
    else if (school) type = 'ecole';
    weeks.push({
      index: i,
      monday,
      sunday: addDays(monday, 6),
      num: isoWeek(monday),
      type,
      sem: school ? (monday < SEM2_FROM ? 1 : 2) : 0,
      days,
      schoolDays,
      holidays: work.filter((x) => x.kind === 'ferie'),
    });
  }
  return weeks;
}

export const WEEKS = buildWeeks();
const DAY_INDEX = new Map();
WEEKS.forEach((w) => w.days.forEach((d) => DAY_INDEX.set(d.date, d)));
export const dayInfo = (date) => DAY_INDEX.get(date) || null;
export const weekOf = (date) => {
  const i = Math.floor(diffDays(START, mondayOf(date)) / 7);
  return i >= 0 && i < WEEK_COUNT ? WEEKS[i] : null;
};

// Dates clés de l'année, lues dans le planning (pas des rendus : on ne peut pas les modifier).
export const JALONS = [
  { id: 'evt-1', date: '2026-12-16', title: 'Événement pédagogique', detail: 'Une journée à l’école' },
  { id: 'evt-2', date: '2027-05-24', end: '2027-05-28', title: 'Événement pédagogique', detail: 'Une semaine à l’école' },
  { id: 'exam-1', date: '2027-07-08', title: 'Examen de certification', detail: '7 h' },
  { id: 'oral', date: '2027-08-30', end: '2027-09-02', title: 'Oral du mastère', detail: 'Sur convocation' },
  { id: 'exam-2', date: '2027-09-03', title: 'Dernier examen', detail: '1 h 45' },
];

// Totaux d'heures, pour contrôle contre la synthèse du PDF.
export function hourTotals() {
  const t = { sem1: 0, sem2: 0, eval: 0 };
  for (const w of WEEKS) {
    for (const d of w.days) {
      if (d.kind === 'examen') t.eval += d.hours;
      else if (d.kind === 'formation' || d.kind === 'evenement') t[w.sem === 1 ? 'sem1' : 'sem2'] += d.hours;
    }
  }
  return t;
}

export function getStatus(today) {
  const total = WEEKS.length;
  const lastDay = WEEKS[total - 1].sunday;
  let phase = 'during';
  if (today < START) phase = 'before';
  else if (today > lastDay) phase = 'after';
  const week = phase === 'during' ? weekOf(today) : null;
  const idx = week ? week.index : phase === 'before' ? -1 : total;

  const left = WEEKS.filter((w) => w.sunday >= today);
  const remaining = {
    ecole: left.filter((w) => w.type === 'ecole').length,
    entreprise: left.filter((w) => w.type === 'entreprise').length,
    final: left.filter((w) => w.type === 'final').length,
  };

  let next = null;
  if (phase === 'before') next = { week: WEEKS[0], days: diffDays(today, WEEKS[0].monday) };
  else if (week) {
    const nw = WEEKS.slice(idx + 1).find((w) => w.type !== week.type);
    if (nw) next = { week: nw, days: diffDays(today, nw.monday) };
  }
  return {
    phase,
    week,
    idx,
    remaining,
    next,
    daysToEnd: diffDays(today, END),
    weekNumber: idx + 1, // rang dans le calendrier (1 à 53)
    total,
  };
}
