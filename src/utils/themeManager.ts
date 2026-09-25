export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'kaito_theme_preference';

/**
 * Get the currently configured theme preference
 */
export function getThemePreference(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {}
  return 'system';
}

/**
 * Check if the effective theme should be dark based on preference and OS setting
 */
export function isDarkThemeActive(mode: ThemeMode = getThemePreference()): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  // 'system'
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return true; // default dark if unknown
}

/**
 * Apply the selected theme to documentElement
 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;

  const isDark = isDarkThemeActive(mode);
  const root = document.documentElement;

  root.classList.toggle('dark', isDark);
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

/**
 * Update and persist the theme preference
 */
export function setThemePreference(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {}

  applyTheme(mode);
  window.dispatchEvent(new CustomEvent('kaito_theme_changed', { detail: { mode } }));
}

/**
 * Initialize theme listener for system OS changes and tab sync
 */
export function initThemeListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  // Apply initial theme
  applyTheme(getThemePreference());

  // Listen for OS color scheme change
  const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const handleMediaChange = () => {
    if (getThemePreference() === 'system') {
      applyTheme('system');
      window.dispatchEvent(new CustomEvent('kaito_theme_changed', { detail: { mode: 'system' } }));
    }
  };

  if (mediaQuery && mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleMediaChange);
  }

  // Listen for cross-tab storage changes
  const handleStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY && e.newValue) {
      applyTheme(e.newValue as ThemeMode);
      window.dispatchEvent(new CustomEvent('kaito_theme_changed', { detail: { mode: e.newValue } }));
    }
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    if (mediaQuery && mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', handleMediaChange);
    }
    window.removeEventListener('storage', handleStorage);
  };
}
