const STORAGE_KEY = 'tong_billing_theme';

export const THEMES = Object.freeze({
  dark: 'กรมท่าเข้ม',
  light: 'สว่าง',
  amber: 'อำพันอบอุ่น'
});

function getSavedTheme() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function saveTheme(theme) {
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* Storage may be blocked. */ }
}

function normalizeTheme(theme) {
  return Object.hasOwn(THEMES, theme) ? theme : 'dark';
}

function syncThemeControls(theme) {
  document.querySelectorAll('[data-theme-select]').forEach((control) => {
    if (control.value !== theme) control.value = theme;
  });
}

export function applyTheme(theme, { persist = true } = {}) {
  const nextTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  if (persist) saveTheme(nextTheme);
  syncThemeControls(nextTheme);
  return nextTheme;
}

export function initTheme() {
  const initialTheme = applyTheme(getSavedTheme() || 'dark', { persist: false });
  document.querySelectorAll('[data-theme-select]').forEach((control) => {
    control.value = initialTheme;
    control.addEventListener('change', (event) => applyTheme(event.currentTarget.value));
  });
  return initialTheme;
}
