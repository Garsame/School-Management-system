export const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const DAY_LABELS = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

export const DAY_BY_JS_INDEX = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const getDayKey = (date = new Date()) => DAY_BY_JS_INDEX[date.getDay()];

export const toMinutes = (hhmm = '') => {
  const [h = '0', m = '0'] = String(hhmm).split(':');
  return Number(h) * 60 + Number(m);
};

export const nowInMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

export const isWithinAttendanceWindow = (slot, earlyMinutes = 10) => {
  const now = nowInMinutes();
  const start = toMinutes(slot?.startTime) - earlyMinutes;
  const end = toMinutes(slot?.endTime);
  return now >= start && now <= end;
};

export const formatTime = (hhmm = '') => {
  if (!hhmm) return '--:--';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isNaN(h) ? 0 : h, Number.isNaN(m) ? 0 : m, 0, 0);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const toLocalDateISO = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

