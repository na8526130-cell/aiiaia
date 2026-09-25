import { convertImageToBase64DataUri, saveChannelAvatarToIndexedDB } from './offlineStorage';

// Helper utilities for Subscriptions and Blocked Channels in LocalStorage

export interface BlockedChannel {
  channelId: string;
  channelTitle: string;
  avatarUrl?: string;
  blockedAt: string;
}

export interface SubscribedChannel {
  channelId: string;
  channelTitle: string;
  customUrl?: string;
  avatarUrl?: string;
  subscriberCount?: string;
  videoCount?: string;
  description?: string;
  subscribedAt: string;
  isArtist?: boolean;
  isVerified?: boolean;
}

const BLOCKED_KEY = 'kaito_blocked_channels';
const SUBS_KEY = 'kaito_subscribed_channels_list';

// Blocked Channels
export function getBlockedChannels(): BlockedChannel[] {
  try {
    const raw = localStorage.getItem(BLOCKED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isChannelBlocked(channelId?: string): boolean {
  if (!channelId) return false;
  const list = getBlockedChannels();
  return list.some((item) => item.channelId === channelId);
}

export function blockChannel(channelId: string, channelTitle: string, avatarUrl?: string): BlockedChannel[] {
  const current = getBlockedChannels().filter((item) => item.channelId !== channelId);
  const updated = [
    {
      channelId,
      channelTitle: channelTitle || 'チャンネル',
      avatarUrl,
      blockedAt: new Date().toISOString()
    },
    ...current
  ];
  try {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('kaito_channel_blocked_changed'));
  } catch (e) {
    console.error(e);
  }
  return updated;
}

export function unblockChannel(channelId: string): BlockedChannel[] {
  const updated = getBlockedChannels().filter((item) => item.channelId !== channelId);
  try {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('kaito_channel_blocked_changed'));
  } catch (e) {
    console.error(e);
  }
  return updated;
}

// Subscribed Channels
export function getSubscribedChannels(): SubscribedChannel[] {
  try {
    const raw = localStorage.getItem(SUBS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isChannelSubscribed(channelId?: string): boolean {
  if (!channelId) return false;
  const list = getSubscribedChannels();
  return list.some((item) => item.channelId === channelId);
}

export function subscribeChannel(channel: SubscribedChannel): SubscribedChannel[] {
  const current = getSubscribedChannels().filter((item) => item.channelId !== channel.channelId);
  const updated = [channel, ...current];
  try {
    localStorage.setItem(SUBS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('kaito_channel_subs_changed'));

    // Asynchronously convert avatar image to Data URI Base64 and update local storage & IndexedDB
    if (channel.avatarUrl && !channel.avatarUrl.startsWith('data:image/')) {
      convertImageToBase64DataUri(channel.avatarUrl).then((base64Url) => {
        if (base64Url && base64Url.startsWith('data:image/')) {
          saveChannelAvatarToIndexedDB(channel.channelId, base64Url);
          const fresh = getSubscribedChannels().map((c) =>
            c.channelId === channel.channelId ? { ...c, avatarUrl: base64Url } : c
          );
          localStorage.setItem(SUBS_KEY, JSON.stringify(fresh));
        }
      });
    }
  } catch (e) {
    console.error(e);
  }
  return updated;
}

export function unsubscribeChannel(channelId: string): SubscribedChannel[] {
  const updated = getSubscribedChannels().filter((item) => item.channelId !== channelId);
  try {
    localStorage.setItem(SUBS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('kaito_channel_subs_changed'));
  } catch (e) {
    console.error(e);
  }
  return updated;
}
