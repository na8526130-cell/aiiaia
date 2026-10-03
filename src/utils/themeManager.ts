export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'kaito_theme_mode';

export function getThemePreference(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {}
  return 'dark';
}

export function isDarkThemeActive(mode: ThemeMode = getThemePreference()): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return true;
}

export function applyTheme(mode: ThemeMode = getThemePreference()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark = isDarkThemeActive(mode);
  if (isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  }
}

export function setThemePreference(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {}
  applyTheme(mode);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kaito_theme_changed', { detail: { mode } }));
  }
}

export function initThemeListener(): () => void {
  applyTheme();
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => {
    if (getThemePreference() === 'system') {
      applyTheme('system');
    }
  };
  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
}
