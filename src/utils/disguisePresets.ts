import { DisguisePreset, DisguisePresetConfig } from '../types';

export const DISGUISE_PRESETS: Record<DisguisePreset, DisguisePresetConfig> = {
  classroom: {
    id: 'classroom',
    name: '数理アカデミー 学習ポータル (数学)',
    tabTitle: '数理アカデミー 学習ポータル',
    faviconUrl: 'https://ssl.gstatic.com/classroom/favicon.png',
    description: '高校数学・二次方程式の解法と応用を解説するオンライン教材'
  }
};

const PRESET_STORAGE_KEY = 'kaito_disguise_preset';

export function getDisguisePreset(): DisguisePreset {
  return 'classroom';
}

export function setDisguisePreset(preset: DisguisePreset): void {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, preset || 'classroom');
  } catch {}
}

export function applyDisguiseMeta(preset?: DisguisePreset): void {
  const config = DISGUISE_PRESETS.classroom;
  document.title = config.tabTitle;
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = config.faviconUrl;
}
