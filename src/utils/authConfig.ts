import { customFetch } from './apiClient';

export interface DisguiseAuthConfig {
  customId: string;
  customPassword: string;
  requirePassword: boolean;
  allowQuickUnlock: boolean;
}

const STORAGE_KEY = 'kaito_disguise_auth_v1';
export const DEFAULT_AUTH_ID = 'kaito';
export const DEFAULT_AUTH_PASSWORD = '@0726kaito';

export function getDisguiseAuthConfig(): DisguiseAuthConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        customId: (parsed.customId ?? DEFAULT_AUTH_ID).trim(),
        customPassword: (parsed.customPassword ?? DEFAULT_AUTH_PASSWORD).trim(),
        requirePassword: parsed.requirePassword !== false,
        allowQuickUnlock: parsed.allowQuickUnlock !== false
      };
    }
  } catch (e) {
    console.warn('Failed to load disguise auth config:', e);
  }
  return {
    customId: DEFAULT_AUTH_ID,
    customPassword: DEFAULT_AUTH_PASSWORD,
    requirePassword: true,
    allowQuickUnlock: true
  };
}

export function saveDisguiseAuthConfig(partial: Partial<DisguiseAuthConfig>): DisguiseAuthConfig {
  const current = getDisguiseAuthConfig();
  const updated: DisguiseAuthConfig = {
    customId: partial.customId !== undefined ? partial.customId.trim() : current.customId,
    customPassword: partial.customPassword !== undefined ? partial.customPassword.trim() : current.customPassword,
    requirePassword: partial.requirePassword !== undefined ? partial.requirePassword : current.requirePassword,
    allowQuickUnlock: partial.allowQuickUnlock !== undefined ? partial.allowQuickUnlock : current.allowQuickUnlock
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('kaito_disguise_auth_changed', { detail: updated }));
  } catch (e) {
    console.error('Failed to save disguise auth config to localStorage:', e);
  }

  // Fire-and-forget server / GAS synchronization
  try {
    customFetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: updated.customId,
        password: updated.customPassword
      })
    }).catch(() => {});
  } catch {}

  return updated;
}

export function resetDisguiseAuth(): DisguiseAuthConfig {
  return saveDisguiseAuthConfig({
    customId: DEFAULT_AUTH_ID,
    customPassword: DEFAULT_AUTH_PASSWORD,
    requirePassword: true,
    allowQuickUnlock: true
  });
}

/**
 * Local fast-path verification (never fails if network is down or GAS is unresponsive)
 */
export function verifyLocalDisguiseCredentials(username: string, password: string): {
  success: boolean;
  mode?: 'media' | 'study';
  message?: string;
} {
  const config = getDisguiseAuthConfig();
  const trimmedUser = (username || '').trim();
  const trimmedPass = (password || '').trim();

  // If password requirement is disabled, allow unlock immediately
  if (!config.requirePassword) {
    return { success: true, mode: 'media' };
  }

  // Study Portal account (dedicated)
  if (trimmedUser === 'education' && trimmedPass === 'matheducation') {
    return { success: true, mode: 'study' };
  }

  // Check custom user-configured password (ID is optional if password matches!)
  if (config.customPassword && trimmedPass === config.customPassword) {
    return { success: true, mode: 'media' };
  }

  // Check default fallback password (@0726kaito)
  if (trimmedPass === DEFAULT_AUTH_PASSWORD) {
    return { success: true, mode: 'media' };
  }

  // Check exact ID and Password match
  if (trimmedUser === config.customId && trimmedPass === config.customPassword) {
    return { success: true, mode: 'media' };
  }

  return {
    success: false,
    message: '受講生IDまたはパスワードが正しくありません。'
  };
}
