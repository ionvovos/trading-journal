// Setting keys and their defaults (architecture section 4.1, `settings` store). Pure.
// `lang` is not defaulted here: the shell picks it from the device. `tz` defaults to the device zone.

export function deviceZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export const SETTING_DEFAULTS = {
  dayCutoffHour: 0,
  smallSampleMin: 30,
  openReminderDays: 7,
  exportReminderEvery: 50,
  reconcileCap: '1.00',
  lossWindowMin: 30,
  firstRunDone: false,
  'displayCurrency.real': 'USD',
  'displayCurrency.paper': 'USD',
};

export function settingDefault(key) {
  if (key === 'tz') return deviceZone();
  return Object.hasOwn(SETTING_DEFAULTS, key) ? SETTING_DEFAULTS[key] : undefined;
}

// Keys that must never reach an export or a log (the own key lives in localStorage, never here;
// this guards a value that was put here by mistake).
export const NEVER_EXPORT = /(^|\.)(key|secret|token|apikey)$/i;
