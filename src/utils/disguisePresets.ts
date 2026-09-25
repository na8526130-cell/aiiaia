import { DisguisePreset, DisguisePresetConfig } from '../types';

export const DISGUISE_PRESETS: Record<DisguisePreset, DisguisePresetConfig> = {
  classroom: {
    id: 'classroom',
    name: 'Google Classroom / 数理アカデミー',
    tabTitle: '数理アカデミー 学習ポータル',
    faviconUrl: 'https://ssl.gstatic.com/classroom/favicon.png',
    description: '高校数学・二次方程式の解法と応用を解説するオンライン教材風'
  },
  docs: {
    id: 'docs',
    name: 'Google ドキュメント',
    tabTitle: '無題のドキュメント - Google ドキュメント',
    faviconUrl: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico',
    description: '数学レポートを作成中のGoogle Docs文書エディタ画面風'
  },
  nhk: {
    id: 'nhk',
    name: 'NHK for School',
    tabTitle: 'NHK for School | 学びを広げる教育動画',
    faviconUrl: 'https://www.nhk.or.jp/favicon.ico',
    description: 'NHK教育の公式動画学習ライブラリ・デジタル授業風'
  },
  wikipedia: {
    id: 'wikipedia',
    name: 'Wikipedia（二次方程式）',
    tabTitle: '二次方程式 - Wikipedia',
    faviconUrl: 'https://en.wikipedia.org/static/favicon/wikipedia.ico',
    description: 'オンライン百科事典Wikipediaの数学記事風'
  }
};

const PRESET_STORAGE_KEY = 'kaito_disguise_preset';

export function getDisguisePreset(): DisguisePreset {
  try {
    const saved = localStorage.getItem(PRESET_STORAGE_KEY);
    if (saved && saved in DISGUISE_PRESETS) {
      return saved as DisguisePreset;
    }
  } catch {}
  return 'classroom';
}

export function setDisguisePreset(preset: DisguisePreset): void {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, preset);
  } catch {}
}

export function applyDisguiseMeta(preset: DisguisePreset): void {
  const config = DISGUISE_PRESETS[preset] || DISGUISE_PRESETS.classroom;
  document.title = config.tabTitle;
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = config.faviconUrl;
}
