import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { Innertube, UniversalCache, Log } from 'youtubei.js';
import dotenv from 'dotenv';
import { spawn, execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Silence youtubei.js parser JIT warnings in production logs
try {
  Log.setLevel(Log.Level.NONE);
} catch {}

const app = express();

app.use(express.json());

// =======================================================
// ★ LuanRT/YouTube.js (youtubei.js) Official InnerTube Singleton
// =======================================================
let ytClientPromise: Promise<Innertube> | null = null;

async function getInnertubeClient(): Promise<Innertube> {
  if (!ytClientPromise) {
    ytClientPromise = Innertube.create({
      lang: 'ja',
      location: 'JP',
      generate_session_locally: true,
      cache: new UniversalCache(false)
    }).catch((err) => {
      ytClientPromise = null;
      throw err;
    });
  }
  return ytClientPromise;
}

function parseCountString(raw: any): string {
  if (typeof raw === 'number' && !isNaN(raw)) return String(Math.floor(raw));
  if (!raw) return '0';
  const str = String(raw).trim();
  if (/^\d+$/.test(str)) return str;

  // Remove commas and spaces
  const clean = str.replace(/,/g, '').replace(/\s+/g, '');
  const manMatch = clean.match(/([\d.]+)万/);
  if (manMatch) {
    return String(Math.round(parseFloat(manMatch[1]) * 10000));
  }
  const okuMatch = clean.match(/([\d.]+)億/);
  if (okuMatch) {
    return String(Math.round(parseFloat(okuMatch[1]) * 100000000));
  }
  const kMatch = clean.match(/([\d.]+)[Kk]/);
  if (kMatch) {
    return String(Math.round(parseFloat(kMatch[1]) * 1000));
  }
  const mMatch = clean.match(/([\d.]+)[Mm]/);
  if (mMatch) {
    return String(Math.round(parseFloat(mMatch[1]) * 1000000));
  }
  const digitsMatch = clean.match(/(\d+)/);
  if (digitsMatch) {
    return digitsMatch[1];
  }
  return '0';
}

function parseDurationTextToSeconds(text: string): number {
  if (!text) return 0;
  const clean = String(text).trim();
  const parts = clean.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => isNaN(n))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

function secondsToIsoDuration(durationSec: number): string {
  if (!durationSec || durationSec <= 0) return 'PT0M0S';
  const hours = Math.floor(durationSec / 3600);
  const mins = Math.floor((durationSec % 3600) / 60);
  const secs = Math.floor(durationSec % 60);
  if (hours > 0) {
    return `PT${hours}H${mins}M${secs}S`;
  }
  return `PT${mins}M${secs}S`;
}

// Convert LuanRT/YouTube.js nodes (Video, CompactVideo, LockupView, ShortsLockupView, ReelItem, Playlist, CompactPlaylist, Mix) to standard YouTubeVideoItem
function convertYouTubeJsItemToYouTubeItem(
  item: any,
  fallbackChannel?: { id?: string; name?: string; avatar?: string }
): any | null {
  if (!item) return null;

  // 1. Handle LockupView (used by YouTube.js in watch_next_feed, search results, channel videos, home feed)
  if (item.type === 'LockupView') {
    const contentType = String(item.content_type || '').toUpperCase();
    const contentId =
      item.content_id ||
      item.renderer_context?.command_context?.on_tap?.payload?.playlistId ||
      item.renderer_context?.command_context?.on_tap?.payload?.videoId ||
      item.on_tap?.payload?.videoId ||
      '';

    // 1A. Handle Playlist / Mix LockupView
    if (
      contentType === 'PLAYLIST' ||
      contentId.startsWith('PL') ||
      contentId.startsWith('RD') ||
      contentId.startsWith('OLAK5uy_') ||
      contentId.startsWith('UU')
    ) {
      const playlistId =
        item.renderer_context?.command_context?.on_tap?.payload?.playlistId ||
        contentId;
      if (!playlistId) return null;

      const firstVideoId =
        item.renderer_context?.command_context?.on_tap?.payload?.videoId ||
        item.on_tap?.payload?.videoId ||
        '';

      const title = item.metadata?.title?.text || item.metadata?.title?.toString?.() || '再生リスト';
      const rows = item.metadata?.metadata?.metadata_rows || [];
      let channelTitle = fallbackChannel?.name || '';
      let channelId = fallbackChannel?.id || '';
      const descParts: string[] = [];

      for (const row of rows) {
        for (const part of row.metadata_parts || []) {
          const t = part?.text?.text || '';
          if (!t || t === 'プレイリスト' || t === '再生リストの全体を見る') continue;
          const browseId =
            part?.text?.endpoint?.payload?.browseId ||
            part?.text?.runs?.[0]?.endpoint?.payload?.browseId ||
            '';
          if (browseId && browseId.startsWith('UC') && !channelId) {
            channelId = browseId;
          }
          if (!channelTitle) {
            channelTitle = t;
          } else {
            descParts.push(t);
          }
        }
      }

      let badgeText = '';
      const primaryThumb = item.content_image?.primary_thumbnail || item.content_image;
      for (const overlay of primaryThumb?.overlays || []) {
        for (const badge of overlay?.badges || []) {
          if (badge?.text) {
            badgeText = badge.text;
            break;
          }
        }
      }
      if (!badgeText) {
        badgeText = playlistId.startsWith('RD') ? 'ミックスリスト' : '再生リスト';
      }

      const countMatch = badgeText.match(/(\d+)/);
      const itemCount = countMatch ? parseInt(countMatch[1], 10) : 0;

      const thumbUrl =
        primaryThumb?.image?.[0]?.url ||
        (firstVideoId
          ? `https://i.ytimg.com/vi/${firstVideoId}/hqdefault.jpg`
          : 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&auto=format&fit=crop&q=80');

      return {
        id: playlistId,
        kind: 'youtube#playlist',
        isPlaylist: true,
        playlistId,
        firstVideoId,
        videoCountText: badgeText,
        authorThumbnail: fallbackChannel?.avatar || '',
        lengthSeconds: 0,
        isShort: false,
        snippet: {
          publishedAt: '',
          channelId,
          title,
          description: descParts.join('\n') || `${badgeText} • ${channelTitle}`,
          channelThumbnail: fallbackChannel?.avatar || '',
          thumbnails: {
            default: { url: thumbUrl },
            medium: { url: thumbUrl },
            high: { url: thumbUrl },
            standard: { url: thumbUrl },
            maxres: { url: thumbUrl }
          },
          channelTitle: channelTitle || 'YouTube プレイリスト',
          liveBroadcastContent: 'none',
          tags: ['Playlist']
        },
        statistics: {
          viewCount: '0',
          likeCount: '0',
          commentCount: '0'
        },
        contentDetails: {
          duration: badgeText,
          itemCount
        }
      };
    }

    // 1B. Handle Video / Shorts LockupView
    if (contentType && contentType !== 'VIDEO' && contentType !== 'SHORTS') {
      return null;
    }
    const videoId = contentId;
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(String(videoId))) return null;

    const title = item.metadata?.title?.text || item.metadata?.title?.toString?.() || '';
    if (!title) return null;
    const rows = item.metadata?.metadata?.metadata_rows || [];
    let channelTitle = fallbackChannel?.name || '';
    let viewCountStr = '0';
    let publishedAt = '';

    if (rows.length > 0) {
      const firstRowText = rows[0]?.metadata_parts?.[0]?.text?.text || '';
      if (firstRowText && !firstRowText.includes('視聴') && !firstRowText.includes('前')) {
        channelTitle = firstRowText;
      }
      for (const row of rows) {
        for (const part of row.metadata_parts || []) {
          const t = part?.text?.text || '';
          if (!t) continue;
          if (t.includes('視聴') || /^[\d.,]+(万|億|K|M)?$/.test(t.trim())) {
            viewCountStr = parseCountString(t);
          } else if (t.includes('前') || t.includes('公開') || t.includes('配信')) {
            publishedAt = t;
          } else if (!channelTitle) {
            channelTitle = t;
          }
        }
      }
    }

    let durationText = '';
    for (const overlay of item.content_image?.overlays || []) {
      for (const badge of overlay?.badges || []) {
        if (badge?.text && /\d+:\d+/.test(badge.text)) {
          durationText = badge.text;
          break;
        }
      }
    }
    const durationSec = parseDurationTextToSeconds(durationText);
    const durationIso = secondsToIsoDuration(durationSec);

    const thumbUrl =
      item.content_image?.image?.[0]?.url ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const authorImg =
      item.metadata?.image?.avatar?.image?.[0]?.url ||
      fallbackChannel?.avatar ||
      '';
    const channelId =
      item.metadata?.image?.renderer_context?.command_context?.on_tap?.payload?.browseId ||
      fallbackChannel?.id ||
      '';

    const tapPageType =
      item.renderer_context?.command_context?.on_tap?.metadata?.page_type ||
      item.on_tap?.metadata?.page_type ||
      '';
    const tapUrl =
      item.renderer_context?.command_context?.on_tap?.metadata?.url ||
      item.on_tap?.metadata?.url ||
      '';

    return {
      id: videoId,
      kind: 'youtube#video',
      authorThumbnail: authorImg,
      lengthSeconds: durationSec,
      isShort: Boolean(
        contentType === 'SHORTS' ||
          tapPageType === 'WEB_PAGE_TYPE_SHORTS' ||
          tapUrl.includes('/shorts/') ||
          (durationSec > 0 && durationSec <= 65 && title.toLowerCase().includes('short'))
      ),
      snippet: {
        publishedAt: publishedAt || new Date().toISOString(),
        channelId,
        title,
        description: '',
        channelThumbnail: authorImg,
        thumbnails: {
          default: { url: thumbUrl },
          medium: { url: thumbUrl },
          high: { url: thumbUrl },
          standard: { url: thumbUrl },
          maxres: { url: thumbUrl }
        },
        channelTitle,
        liveBroadcastContent: 'none',
        tags: []
      },
      statistics: {
        viewCount: viewCountStr,
        likeCount: '0',
        commentCount: '0'
      },
      contentDetails: {
        duration: durationIso,
        dimension: '2d',
        definition: 'hd',
        caption: 'false',
        licensedContent: false
      }
    };
  }

  // 2. Handle Playlist / CompactPlaylist / GridPlaylist / Mix / CompactMix
  if (
    item.type === 'Playlist' ||
    item.type === 'CompactPlaylist' ||
    item.type === 'GridPlaylist' ||
    item.type === 'Mix' ||
    item.type === 'CompactMix'
  ) {
    const playlistId =
      item.id ||
      item.playlist_id ||
      item.endpoint?.payload?.playlistId ||
      '';
    if (!playlistId) return null;

    const firstVideoId =
      item.endpoint?.payload?.videoId ||
      item.first_videos?.[0]?.id ||
      '';
    const title = item.title?.text || item.title?.toString?.() || '再生リスト';
    const channelTitle =
      item.author?.name ||
      item.channel?.name ||
      fallbackChannel?.name ||
      'YouTube プレイリスト';
    const channelId =
      item.author?.id ||
      item.channel?.id ||
      fallbackChannel?.id ||
      '';
    const countRaw =
      item.video_count_short?.text ||
      item.video_count?.text ||
      (playlistId.startsWith('RD') ? 'ミックスリスト' : '再生リスト');
    const countMatch = String(countRaw).match(/(\d+)/);
    const itemCount = countMatch ? parseInt(countMatch[1], 10) : 0;
    const badgeText = String(countRaw).includes('本') || String(countRaw).includes('リスト')
      ? String(countRaw)
      : itemCount > 0
      ? `${itemCount} 本の動画`
      : '再生リスト';

    const thumbUrl =
      item.thumbnails?.[0]?.url ||
      (firstVideoId
        ? `https://i.ytimg.com/vi/${firstVideoId}/hqdefault.jpg`
        : 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&auto=format&fit=crop&q=80');

    return {
      id: playlistId,
      kind: 'youtube#playlist',
      isPlaylist: true,
      playlistId,
      firstVideoId,
      videoCountText: badgeText,
      authorThumbnail: fallbackChannel?.avatar || '',
      lengthSeconds: 0,
      isShort: false,
      snippet: {
        publishedAt: '',
        channelId,
        title,
        description: `${badgeText} • ${channelTitle}`,
        channelThumbnail: fallbackChannel?.avatar || '',
        thumbnails: {
          default: { url: thumbUrl },
          medium: { url: thumbUrl },
          high: { url: thumbUrl },
          standard: { url: thumbUrl },
          maxres: { url: thumbUrl }
        },
        channelTitle,
        liveBroadcastContent: 'none',
        tags: ['Playlist']
      },
      statistics: {
        viewCount: '0',
        likeCount: '0',
        commentCount: '0'
      },
      contentDetails: {
        duration: badgeText,
        itemCount
      }
    };
  }

  // 3. Handle ShortsLockupView / ReelItem
  if (item.type === 'ShortsLockupView' || item.type === 'ReelItem') {
    const videoId =
      item.on_tap_endpoint?.payload?.videoId ||
      item.inline_player_data?.payload?.videoId ||
      item.on_tap?.payload?.videoId ||
      item.endpoint?.payload?.videoId ||
      item.id ||
      item.video_id ||
      (typeof item.entity_id === 'string' ? item.entity_id.replace(/^shorts-shelf-item-/, '') : '');
    if (!videoId) return null;

    let title =
      item.overlay_metadata?.primary_text?.text ||
      item.title?.text ||
      item.title?.toString?.() ||
      '';
    let viewsRaw =
      item.overlay_metadata?.secondary_text?.text ||
      item.views?.text ||
      item.view_count?.text ||
      '';

    if (!title && item.accessibility_text) {
      const a11y = String(item.accessibility_text);
      const splitIdx = a11y.lastIndexOf(',');
      if (splitIdx > 0) {
        title = a11y.slice(0, splitIdx).trim();
        if (!viewsRaw) viewsRaw = a11y.slice(splitIdx + 1);
      } else {
        title = a11y.replace(/\s*-\s*ショート動画を再生.*$/, '').trim();
      }
    }

    const thumbUrl =
      item.on_tap_endpoint?.payload?.thumbnail?.thumbnails?.[0]?.url ||
      item.thumbnail?.[0]?.url ||
      item.thumbnails?.[0]?.url ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    return {
      id: videoId,
      kind: 'youtube#video',
      authorThumbnail: fallbackChannel?.avatar || '',
      lengthSeconds: 60,
      isShort: true,
      snippet: {
        publishedAt: new Date().toISOString(),
        channelId: item.author?.id || fallbackChannel?.id || '',
        title: title || 'YouTube Short',
        description: title ? `${title} #shorts` : '#shorts',
        channelThumbnail: fallbackChannel?.avatar || '',
        thumbnails: {
          default: { url: thumbUrl },
          medium: { url: thumbUrl },
          high: { url: thumbUrl },
          standard: { url: thumbUrl },
          maxres: { url: thumbUrl }
        },
        channelTitle: item.author?.name || fallbackChannel?.name || 'YouTube Shorts',
        liveBroadcastContent: 'none',
        tags: ['Shorts']
      },
      statistics: {
        viewCount: parseCountString(viewsRaw),
        likeCount: '0',
        commentCount: '0'
      },
      contentDetails: {
        duration: 'PT1M0S',
        dimension: '2d',
        definition: 'hd',
        caption: 'false',
        licensedContent: false
      }
    };
  }

  // 4. Standard Video / CompactVideo / GridVideo / PlaylistVideo
  if (item.type === 'Channel' || item.type === 'ShowingResultsFor' || item.type === 'SearchRefinementCard') {
    return null;
  }
  const videoId = item.id || item.video_id || item.endpoint?.payload?.videoId || '';
  if (!videoId || typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

  const title = item.title?.text || item.title?.toString?.() || '';
  if (!title) return null;
  const description =
    item.description_snippet?.text ||
    item.snippets?.[0]?.text?.text ||
    item.description?.text ||
    '';
  const channelTitle =
    item.author?.name ||
    item.channel?.name ||
    item.byline_text?.text ||
    fallbackChannel?.name ||
    '';
  const channelId =
    item.author?.id ||
    item.channel?.id ||
    fallbackChannel?.id ||
    '';
  const authorImg =
    item.author?.thumbnails?.[0]?.url ||
    item.channel?.thumbnails?.[0]?.url ||
    fallbackChannel?.avatar ||
    '';
  const thumbUrl =
    item.thumbnails?.[0]?.url ||
    item.best_thumbnail?.url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const durationSec =
    typeof item.duration?.seconds === 'number'
      ? item.duration.seconds
      : parseDurationTextToSeconds(item.duration?.text || item.length_text?.text || '');
  const durationIso = secondsToIsoDuration(durationSec);

  const viewCountRaw =
    item.view_count?.text ||
    item.short_view_count?.text ||
    item.views?.text ||
    '0';
  const publishedAt =
    item.published?.text ||
    item.relative_date?.text ||
    new Date().toISOString();

  const endpointUrl = item.endpoint?.metadata?.url || '';
  const endpointPageType = item.endpoint?.metadata?.page_type || '';

  // Extract Animated WebP preview URL from InnerTube animatedThumbnailOverlayViewModel / MovingThumbnailDetails
  let animatedThumbnailUrl = '';
  try {
    const candidates: any[] = [
      item.animated_thumbnail,
      item.rich_thumbnail?.moving_thumbnail_renderer?.moving_thumbnail_details?.thumbnails,
      item.richThumbnail?.movingThumbnailRenderer?.movingThumbnailDetails?.thumbnails,
      item.animatedThumbnailOverlayViewModel?.thumbnail?.sources,
      item.content_image?.overlays,
      item.overlays
    ];
    for (const cand of candidates) {
      if (!cand) continue;
      if (typeof cand === 'string' && cand.startsWith('http')) {
        animatedThumbnailUrl = cand;
        break;
      }
      if (Array.isArray(cand)) {
        for (const el of cand) {
          const directUrl =
            el?.url ||
            el?.thumbnail?.sources?.[0]?.url ||
            el?.animatedThumbnailOverlayViewModel?.thumbnail?.sources?.[0]?.url ||
            el?.animated_thumbnail_overlay?.thumbnail?.[0]?.url ||
            el?.image?.sources?.[0]?.url;
          if (typeof directUrl === 'string' && directUrl.startsWith('http') && (directUrl.includes('an_webp') || directUrl.includes('.webp') || directUrl.includes('mqdefault_6s'))) {
            animatedThumbnailUrl = directUrl;
            break;
          }
        }
      }
      if (animatedThumbnailUrl) break;
    }
  } catch {}

  return {
    id: videoId,
    kind: 'youtube#video',
    authorThumbnail: authorImg,
    lengthSeconds: durationSec,
    isShort: Boolean(
      item.is_short ||
        endpointPageType === 'WEB_PAGE_TYPE_SHORTS' ||
        endpointUrl.includes('/shorts/') ||
        (durationSec > 0 && durationSec <= 65 && (title.toLowerCase().includes('short') || description.toLowerCase().includes('#short')))
    ),
    snippet: {
      publishedAt,
      channelId,
      title,
      description,
      channelThumbnail: authorImg,
      animatedThumbnailUrl: animatedThumbnailUrl || undefined,
      thumbnails: {
        default: { url: thumbUrl },
        medium: { url: thumbUrl },
        high: { url: thumbUrl },
        standard: { url: thumbUrl },
        maxres: { url: thumbUrl }
      },
      channelTitle,
      liveBroadcastContent: item.is_live ? 'live' : 'none',
      tags: []
    },
    statistics: {
      viewCount: parseCountString(viewCountRaw),
      likeCount: '0',
      commentCount: '0'
    },
    contentDetails: {
      duration: durationIso,
      dimension: '2d',
      definition: 'hd',
      caption: 'false',
      licensedContent: false
    }
  };
}

// Helper to extract all video, shorts, and playlist items from YouTube.js search/feed response
function extractAllYouTubeJsItems(
  searchRes: any,
  options?: {
    fallbackChannel?: { id?: string; name?: string; avatar?: string };
    includePlaylists?: boolean;
  }
): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  const includePlaylists = options?.includePlaylists !== false;
  const fallbackChannel = options?.fallbackChannel;

  const pushConverted = (node: any) => {
    const converted = convertYouTubeJsItemToYouTubeItem(node, fallbackChannel);
    if (!converted) return;
    if (!includePlaylists && (converted.isPlaylist || converted.kind === 'youtube#playlist')) {
      return;
    }
    const key = converted.playlistId || (typeof converted.id === 'string' ? converted.id : converted.id?.videoId || converted.id?.playlistId);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(converted);
    }
  };

  // Check results first (contains LockupView playlists, shelves, and videos in natural order)
  const results = Array.isArray(searchRes?.results) ? searchRes.results : [];
  for (const r of results) {
    if (!r) continue;
    if (r.type === 'GridShelfView' || r.type === 'ReelShelf' || r.type === 'Shelf' || r.type === 'ItemSection') {
      const subItems = r.items || r.content?.items || r.contents || [];
      if (Array.isArray(subItems)) {
        for (const sub of subItems) {
          pushConverted(sub);
        }
      }
    } else {
      pushConverted(r);
    }
  }

  // Also check searchRes.videos and searchRes.playlists
  const videos = Array.isArray(searchRes?.videos) ? searchRes.videos : [];
  for (const v of videos) {
    pushConverted(v);
  }
  if (includePlaylists) {
    const playlists = Array.isArray(searchRes?.playlists) ? searchRes.playlists : [];
    for (const p of playlists) {
      pushConverted(p);
    }
  }

  // Also walk current_tab recursively (for Channel Playlists / Releases tabs with multiple shelves)
  if (searchRes?.current_tab) {
    const walkTab = (node: any, depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 8) return;
      if (
        node.type === 'LockupView' ||
        node.type === 'Playlist' ||
        node.type === 'CompactPlaylist' ||
        node.type === 'GridPlaylist' ||
        node.type === 'Mix' ||
        node.type === 'CompactMix' ||
        node.type === 'Video' ||
        node.type === 'GridVideo' ||
        node.type === 'CompactVideo' ||
        node.type === 'ShortsLockupView' ||
        node.type === 'ReelItem'
      ) {
        pushConverted(node);
        return;
      }
      const childArrays = [node.contents, node.items, node.content?.items, node.content?.contents];
      for (const arr of childArrays) {
        if (Array.isArray(arr)) {
          for (const item of arr) {
            walkTab(item, depth + 1);
          }
        }
      }
      if (node.content && typeof node.content === 'object' && !Array.isArray(node.content)) {
        walkTab(node.content, depth + 1);
      }
    };
    walkTab(searchRes.current_tab, 0);
  }

  return out;
}

// Convert LuanRT/YouTube.js VideoInfo (from yt.getInfo(id)) to YouTubeVideoItem + relatedItems
function convertYouTubeJsVideoInfo(info: any, id: string) {
  const basic = info.basic_info || {};
  const primary = info.primary_info || {};
  const secondary = info.secondary_info || {};
  const owner = secondary.owner || {};

  const title = primary.title?.text || basic.title || '';
  const description = secondary.description?.text || basic.short_description || '';
  const channelTitle = owner.author?.name || basic.author || '';
  const channelId = owner.author?.id || basic.channel_id || '';
  const authorImg =
    owner.author?.thumbnails?.[owner.author.thumbnails.length - 1]?.url ||
    owner.author?.thumbnails?.[0]?.url ||
    '';
  const subscriberCount = owner.subscriber_count?.text || '';

  const durationSec = typeof basic.duration === 'number' ? basic.duration : 0;
  const durationIso = secondsToIsoDuration(durationSec);

  const viewCountStr =
    typeof basic.view_count === 'number'
      ? String(basic.view_count)
      : parseCountString(
          primary.view_count?.view_count?.text ||
            primary.view_count?.short_view_count?.text ||
            '0'
        );

  const likeCountStr =
    typeof basic.like_count === 'number'
      ? String(basic.like_count)
      : parseCountString(
          primary.menu?.top_level_buttons?.find?.((b: any) => b.like_count || b.short_like_count)?.like_count || '0'
        );

  const publishedAt =
    primary.published?.text?.replace(/に公開済み|に配信済み/g, '').trim() ||
    primary.relative_date?.text ||
    new Date().toISOString();

  const thumbUrl =
    basic.thumbnail?.[0]?.url ||
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  const videoItem = {
    id,
    kind: 'youtube#video',
    authorThumbnail: authorImg,
    subscriberCount,
    lengthSeconds: durationSec,
    isShort: Boolean(basic.is_short || (durationSec > 0 && durationSec <= 65)),
    snippet: {
      publishedAt,
      channelId,
      title,
      description,
      channelThumbnail: authorImg,
      thumbnails: {
        default: { url: thumbUrl },
        medium: { url: thumbUrl },
        high: { url: thumbUrl },
        standard: { url: thumbUrl },
        maxres: { url: thumbUrl }
      },
      channelTitle,
      liveBroadcastContent: basic.is_live ? 'live' : 'none',
      tags: basic.keywords || []
    },
    statistics: {
      viewCount: viewCountStr,
      likeCount: likeCountStr,
      commentCount: '0'
    },
    contentDetails: {
      duration: durationIso,
      dimension: '2d',
      definition: 'hd',
      caption: 'false',
      licensedContent: false
    }
  };

  const watchNext = Array.isArray(info.watch_next_feed) ? info.watch_next_feed : [];
  const relatedItems = watchNext
    .map((item: any) => convertYouTubeJsItemToYouTubeItem(item))
    .filter((v: any) => v && v.id && v.id !== id);

  return { videoItem, relatedItems };
}

// Convert LuanRT/YouTube.js Comments to standard YouTube commentThread list
function convertYouTubeJsComments(commentsRes: any, videoId: string) {
  const contents = Array.isArray(commentsRes?.contents) ? commentsRes.contents : [];
  const items = contents
    .map((thread: any) => {
      const c = thread?.comment;
      if (!c) return null;
      const commentId = c.comment_id || Math.random().toString(36).slice(2);
      const authorName = c.author?.name || 'YouTube ユーザー';
      const authorId = c.author?.id || '';
      const authorImg =
        c.author?.thumbnails?.[0]?.url ||
        c.author?.avatar_thumbnail_url ||
        '';
      const text = c.content?.text || c.content?.toString?.() || '';
      const publishedAt = c.published_time || '';
      const likeCount = parseInt(parseCountString(c.like_count), 10) || 0;

      return {
        id: commentId,
        kind: 'youtube#commentThread',
        snippet: {
          videoId,
          topLevelComment: {
            id: commentId,
            snippet: {
              authorDisplayName: authorName,
              authorProfileImageUrl: authorImg,
              authorChannelUrl: c.author?.endpoint?.metadata?.url || '',
              authorChannelId: { value: authorId },
              videoId,
              textDisplay: text,
              textOriginal: text,
              likeCount,
              publishedAt
            }
          },
          totalReplyCount: 0
        }
      };
    })
    .filter(Boolean);

  return {
    items,
    nextPageToken: null
  };
}

// Helper for extracting API settings headers (InnerTube / Invidious / Custom proxy config)
function getRequestConfig(req: express.Request) {
  const rawInnerTube = ((req.headers['x-innertube-url'] as string) || '').trim();
  const isLegacyDeadWorker =
    rawInnerTube.includes('myproxy0108.workers.dev') ||
    rawInnerTube.includes('yt-proxy.workers.dev');
  const innertubeUrl = !rawInnerTube || isLegacyDeadWorker
    ? '/api/worker'
    : rawInnerTube;
  const invidiousUrl = (req.headers['x-invidious-url'] as string) || 'https://yt.omada.cafe/';
  const customProxyUrl = ((req.headers['x-custom-proxy-url'] as string) || '').trim();

  return {
    provider: 'innertube',
    innertubeUrl,
    invidiousUrl: invidiousUrl.trim() || 'https://yt.omada.cafe/',
    customProxyUrl
  };
}

// Invidious API fetch helper
async function fetchInvidious(instanceUrl: string, endpoint: string, queryParams: Record<string, string> = {}) {
  let baseUrl = instanceUrl.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const url = new URL(`${baseUrl}/api/v1/${endpoint}`);
  for (const [key, value] of Object.entries(queryParams)) {
    if (value) url.searchParams.set(key, value);
  }

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) {
      console.warn(`Invidious error ${res.status} on ${url.toString()}`);
      return { error: `Invidious HTTP ${res.status}` };
    }
    const data = await res.json();
    return { data };
  } catch (err: any) {
    console.warn(`Invidious fetch failed (${url.toString()}):`, err.message);
    return { error: err.message };
  }
}

// =======================================================
// ★ 海斗tube 自作 InnerTube Cloudflare Worker Engine (内蔵 + 外部Worker両対応)
// =======================================================
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const DEFAULT_INNERTUBE_WORKER = 'https://proxy.wa0260966.workers.dev';

// Dynamically load and execute our self-built Cloudflare Worker (/cloudflare-worker/worker.js) in-process
let cachedSelfWorkerModule: any = null;
async function getSelfWorkerModule() {
  if (cachedSelfWorkerModule && typeof cachedSelfWorkerModule.fetch === 'function') {
    return cachedSelfWorkerModule;
  }
  const workerPath = path.join(process.cwd(), 'cloudflare-worker', 'worker.js');
  const imported = await import(workerPath);
  const resolved = imported?.default?.fetch
    ? imported.default
    : imported?.default?.default?.fetch
    ? imported.default.default
    : imported;
  cachedSelfWorkerModule = resolved;
  return cachedSelfWorkerModule;
}

async function invokeSelfBuiltInnerTubeWorker(
  endpointPath: string,
  queryParams: Record<string, string> = {},
  method = 'GET',
  bodyStr?: string,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; headers: Record<string, string>; bodyText: string; buffer?: Buffer; data?: any }> {
  const workerMod = await getSelfWorkerModule();
  const cleanEp = endpointPath.startsWith('/') ? endpointPath : `/api/v1/${endpointPath}`;
  const fakeUrl = new URL(`https://kaito-innertube.internal${cleanEp}`);
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== null && v !== '') {
      fakeUrl.searchParams.set(k, v);
    }
  }
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extraHeaders
  };
  const req = new Request(fakeUrl.toString(), {
    method,
    headers: reqHeaders,
    body: method !== 'GET' && method !== 'HEAD' ? bodyStr : undefined
  });
  const resp: Response = await workerMod.fetch(req, {}, {});
  const headersObj: Record<string, string> = {};
  resp.headers.forEach((val, key) => {
    headersObj[key] = val;
  });
  const contentType = (headersObj['content-type'] || '').toLowerCase();
  if (
    contentType.startsWith('image/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/') ||
    contentType.includes('octet-stream')
  ) {
    const arrBuf = await resp.arrayBuffer();
    const buffer = Buffer.from(arrBuf);
    return { status: resp.status, headers: headersObj, bodyText: '', buffer };
  }
  const bodyText = await resp.text();
  let data: any = undefined;
  try {
    data = JSON.parse(bodyText);
  } catch {}
  return { status: resp.status, headers: headersObj, bodyText, data };
}

// Fetch helper for的自作 InnerTube Cloudflare Worker (内蔵 /api/worker または カスタム *.workers.dev)
async function fetchInnerTubeWorker(baseUrl: string, endpoint: string, queryParams: Record<string, string> = {}) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const rawBase = (baseUrl || DEFAULT_INNERTUBE_WORKER).trim();

  // 1. If using built-in self-made InnerTube Worker (/api/worker, self, local)
  if (
    !rawBase ||
    rawBase === '/api/worker' ||
    rawBase === '/api/worker/' ||
    rawBase === 'self' ||
    rawBase === 'local' ||
    rawBase.startsWith('/')
  ) {
    try {
      const res = await invokeSelfBuiltInnerTubeWorker(`/api/v1/${cleanEndpoint}`, queryParams);
      if (res.status >= 200 && res.status < 300 && res.data !== undefined) {
        return { data: res.data, engine: 'self-worker' };
      }
      return { error: `Self InnerTube Worker HTTP ${res.status}` };
    } catch (err: any) {
      console.warn(`Self InnerTube Worker failed (${cleanEndpoint}):`, err.message);
      return { error: err.message };
    }
  }

  // 2. External deployed Cloudflare Worker URL (e.g. https://kaito-innertube.xxx.workers.dev)
  let cleanBase = rawBase;
  if (!cleanBase.startsWith('http://') && !cleanBase.startsWith('https://')) {
    cleanBase = 'https://' + cleanBase;
  }
  if (cleanBase.endsWith('/')) {
    cleanBase = cleanBase.slice(0, -1);
  }

  const url = new URL(`${cleanBase}/api/v1/${cleanEndpoint}`);
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      const isEmptyComments =
        (cleanEndpoint.startsWith('comments/') || cleanEndpoint.startsWith('livechat/')) &&
        (!Array.isArray(data?.comments) || data.comments.length === 0) &&
        !data?.isLiveChat;
      if (!isEmptyComments) {
        return { data, engine: 'external-worker' };
      }
    }
    // If trending endpoint on external worker returns HTTP 400 (e.g. YouTube FEtrending deprecation), call /api/v1/search on the same external worker
    if (cleanEndpoint === 'trending') {
      try {
        const searchUrl = new URL(`${cleanBase}/api/v1/search`);
        searchUrl.searchParams.set('q', '急上昇 人気 動画 日本');
        searchUrl.searchParams.set('limit', '30');
        const sRes = await fetch(searchUrl.toString(), {
          headers: { Accept: 'application/json' }
        });
        if (sRes.ok) {
          const sJson = await sRes.json();
          if (Array.isArray(sJson?.results) && sJson.results.length > 0) {
            return { data: sJson.results, engine: 'external-worker' };
          }
        }
      } catch {}
    }
    console.warn(`External InnerTube Worker error ${res.status} on ${url.toString()}, falling back to built-in self-worker`);
  } catch (err: any) {
    console.warn(`External InnerTube Worker fetch failed (${url.toString()}): ${err.message}, falling back to built-in self-worker`);
  }

  // Automatic fallback to built-in self-made InnerTube Worker
  try {
    const fallbackRes = await invokeSelfBuiltInnerTubeWorker(`/api/v1/${cleanEndpoint}`, queryParams);
    if (fallbackRes.status >= 200 && fallbackRes.status < 300 && fallbackRes.data !== undefined) {
      return { data: fallbackRes.data, engine: 'self-worker-fallback' };
    }
  } catch {}
  return { error: 'InnerTube Worker failed' };
}

// Direct InnerTube client (POST to youtubei/v1)
async function callInnerTubeDirect(endpoint: string, payload: any = {}) {
  const url = `https://www.youtube.com/youtubei/v1/${endpoint}?key=${INNERTUBE_API_KEY}`;
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'X-YouTube-Client-Name': '1',
    'X-YouTube-Client-Version': '2.20240625.01.00',
    'Origin': 'https://www.youtube.com'
  };
  const body = {
    context: {
      client: {
        hl: 'ja',
        gl: 'JP',
        clientName: 'WEB',
        clientVersion: '2.20240625.01.00',
        utcOffsetMinutes: 540
      }
    },
    ...payload
  };

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(tid);
    if (!res.ok) {
      return { error: `Direct InnerTube HTTP ${res.status}` };
    }
    const data = await res.json();
    return { data };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Convert InnerTube item to standard YouTube video item schema
function convertInnerTubeItemToYouTubeItem(item: any) {
  const videoId = item.videoId || item.id || '';
  const thumbnail = item.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
  const durationSec = typeof item.lengthSeconds === 'number' ? item.lengthSeconds : (item.duration ? parseInt(item.duration, 10) : 0);
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const durationIso = durationSec > 0 ? `PT${mins}M${secs}S` : 'PT0M0S';

  let authorImg = '';
  if (Array.isArray(item.authorThumbnails) && item.authorThumbnails.length > 0) {
    authorImg = item.authorThumbnails[item.authorThumbnails.length - 1]?.url || item.authorThumbnails[0]?.url || '';
  } else if (typeof item.authorThumbnail === 'string') {
    authorImg = item.authorThumbnail;
  }

  let publishedAt = new Date().toISOString();
  if (typeof item.published === 'number') {
    publishedAt = new Date(item.published > 10000000000 ? item.published : item.published * 1000).toISOString();
  } else if (item.publishedText) {
    publishedAt = item.publishedText;
  }

  const views = item.viewCount !== undefined ? String(item.viewCount) : (item.views ? String(item.views) : '0');
  const animatedThumb =
    item.animatedThumbnailUrl ||
    item.movingThumbnail ||
    item.richThumbnail?.movingThumbnailRenderer?.movingThumbnailDetails?.thumbnails?.[0]?.url ||
    item.animatedThumbnailOverlayViewModel?.thumbnail?.sources?.[0]?.url ||
    undefined;

  const isActuallyLive = Boolean(item.liveNow && (!durationSec || durationSec === 0));

  return {
    id: videoId,
    kind: 'youtube#video',
    authorThumbnail: authorImg,
    liveNow: isActuallyLive,
    lengthSeconds: durationSec,
    isShort: Boolean(item.isShort || (item.type === 'short')),
    snippet: {
      publishedAt,
      channelId: item.authorId || item.channelId || '',
      title: item.title || '',
      description: item.description || item.descriptionHtml || '',
      channelThumbnail: authorImg,
      animatedThumbnailUrl: animatedThumb,
      thumbnails: {
        default: { url: thumbnail },
        medium: { url: thumbnail },
        high: { url: thumbnail },
        standard: { url: thumbnail },
        maxres: { url: thumbnail }
      },
      channelTitle: item.author || item.channelTitle || '',
      liveBroadcastContent: isActuallyLive ? 'live' : 'none',
      tags: item.keywords || item.tags || []
    },
    statistics: {
      viewCount: views,
      likeCount: item.likeCount !== undefined ? String(item.likeCount) : '0',
      commentCount: item.commentCount !== undefined ? String(item.commentCount) : '0'
    },
    contentDetails: {
      duration: durationIso,
      dimension: '2d',
      definition: 'hd',
      caption: 'false',
      licensedContent: false
    }
  };
}

// Convert InnerTube channel data to standard YouTube channel schema
function convertInnerTubeChannelToYouTubeChannel(item: any) {
  const authorThumbnail = item.authorThumbnails?.length > 0
    ? item.authorThumbnails[item.authorThumbnails.length - 1].url
    : (typeof item.authorThumbnail === 'string' ? item.authorThumbnail : '');
  const bannerUrl = item.authorBanners?.length > 0
    ? item.authorBanners[0].url
    : '';

  return {
    kind: 'youtube#channel',
    id: item.authorId || item.id || '',
    snippet: {
      title: item.author || 'YouTube チャンネル',
      description: item.description || '',
      customUrl: item.authorUrl || '',
      publishedAt: item.joined ? new Date(item.joined * 1000).toISOString() : new Date().toISOString(),
      thumbnails: {
        high: { url: authorThumbnail },
        medium: { url: authorThumbnail },
        default: { url: authorThumbnail }
      }
    },
    statistics: {
      subscriberCount: String(item.subCount || item.subCountText || 0),
      videoCount: String(item.totalVideos || 0),
      viewCount: String(item.totalViews || 0)
    },
    brandingSettings: {
      image: {
        bannerExternalUrl: bannerUrl
      }
    }
  };
}

// Convert Invidious item to YouTube Video item schema
function convertInvidiousItemToYouTubeItem(item: any) {
  const videoId = item.videoId || item.id;
  const thumbnailHigh = item.videoThumbnails?.find((t: any) => t.quality === 'high')?.url
    || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const thumbnailMed = item.videoThumbnails?.find((t: any) => t.quality === 'medium')?.url
    || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

  let authorImg = '';
  if (Array.isArray(item.authorThumbnails) && item.authorThumbnails.length > 0) {
    authorImg = item.authorThumbnails[item.authorThumbnails.length - 1]?.url || item.authorThumbnails[0]?.url || '';
  } else if (typeof item.authorThumbnail === 'string') {
    authorImg = item.authorThumbnail;
  }
  if (authorImg.startsWith('//')) {
    authorImg = 'https:' + authorImg;
  }

  const durationSec = item.lengthSeconds || 0;
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const durationIso = durationSec > 0 ? `PT${mins}M${secs}S` : 'PT0M0S';

  return {
    id: videoId,
    kind: 'youtube#video',
    authorThumbnail: authorImg,
    snippet: {
      publishedAt: item.published ? new Date(item.published * 1000).toISOString() : (item.publishedText || new Date().toISOString()),
      channelId: item.authorId || '',
      title: item.title || '',
      description: item.description || '',
      channelThumbnail: authorImg,
      thumbnails: {
        high: { url: thumbnailHigh },
        medium: { url: thumbnailMed },
        default: { url: thumbnailMed }
      },
      channelTitle: item.author || '',
      tags: item.keywords || item.tags || []
    },
    statistics: {
      viewCount: String(item.viewCount || 0),
      likeCount: String(item.likeCount || 0)
    },
    contentDetails: {
      duration: durationIso
    }
  };
}

// Convert Invidious channel format to YouTube channel schema
function convertInvidiousChannelToYouTubeChannel(item: any) {
  const authorThumbnail = item.authorThumbnails?.length > 0
    ? item.authorThumbnails[item.authorThumbnails.length - 1].url
    : '';
  const bannerUrl = item.authorBanners?.length > 0
    ? item.authorBanners[0].url
    : '';

  return {
    kind: 'youtube#channel',
    id: item.authorId || item.id,
    snippet: {
      title: item.author || 'YouTube チャンネル',
      description: item.description || '',
      customUrl: item.authorUrl || '',
      publishedAt: item.joined ? new Date(item.joined * 1000).toISOString() : new Date().toISOString(),
      thumbnails: {
        high: { url: authorThumbnail },
        medium: { url: authorThumbnail },
        default: { url: authorThumbnail }
      }
    },
    statistics: {
      subscriberCount: String(item.subCount || 0),
      videoCount: String(item.totalVideos || 0),
      viewCount: String(item.totalViews || 0)
    },
    brandingSettings: {
      image: {
        bannerExternalUrl: bannerUrl
      }
    }
  };
}

// Helper to convert single Invidious comment object to standard YouTube comment item
function convertSingleInvidiousComment(c: any, videoId: string = '') {
  let authorImg = '';
  if (Array.isArray(c.authorThumbnails) && c.authorThumbnails.length > 0) {
    authorImg = c.authorThumbnails[c.authorThumbnails.length - 1]?.url || c.authorThumbnails[0]?.url || '';
  } else if (typeof c.authorThumbnail === 'string') {
    authorImg = c.authorThumbnail;
  }

  if (authorImg) {
    if (authorImg.startsWith('//')) {
      authorImg = 'https:' + authorImg;
    } else if (authorImg.startsWith('/ggpht/')) {
      authorImg = 'https://yt3.ggpht.com' + authorImg.replace('/ggpht', '');
    }
  }

  // Invidious comment content fields: c.content (plain text) or c.contentHtml (HTML text)
  const textRaw = c.content || c.textOriginal || c.text || c.contentHtml || c.textDisplay || '';
  const textHtml = c.contentHtml || c.textDisplay || c.content || c.textOriginal || c.text || '';

  let publishedIso = new Date().toISOString();
  if (typeof c.published === 'number') {
    publishedIso = new Date(c.published > 10000000000 ? c.published : c.published * 1000).toISOString();
  } else if (c.publishedText) {
    publishedIso = c.publishedText;
  }

  return {
    id: c.commentId || c.id || Math.random().toString(),
    snippet: {
      authorDisplayName: c.author || c.authorDisplayName || 'YouTube ユーザー',
      authorProfileImageUrl: authorImg,
      authorChannelUrl: c.authorUrl || '',
      authorChannelId: { value: c.authorId || '' },
      videoId: videoId || c.videoId || '',
      textDisplay: textHtml,
      textOriginal: textRaw,
      likeCount: typeof c.likeCount === 'number' ? c.likeCount : 0,
      publishedAt: publishedIso
    }
  };
}

// Convert Invidious comments to YouTube comment threads schema
function convertInvidiousCommentsToYouTube(data: any, videoId: string) {
  if (!data || !Array.isArray(data.comments)) return { items: [], nextPageToken: null };

  const items = data.comments.map((c: any) => {
    const topLevelComment = convertSingleInvidiousComment(c, videoId);
    
    // Invidious might contain inline replies in c.replies.comments
    const repliesList = Array.isArray(c.replies?.comments)
      ? c.replies.comments.map((r: any) => convertSingleInvidiousComment(r, videoId))
      : [];

    return {
      id: c.commentId || topLevelComment.id,
      kind: 'youtube#commentThread',
      snippet: {
        videoId,
        topLevelComment,
        totalReplyCount: c.replies?.replyCount || (repliesList.length > 0 ? repliesList.length : 0)
      },
      replies: repliesList.length > 0 ? { comments: repliesList } : undefined
    };
  });

  return { items, nextPageToken: data.continuation || null, isLiveChat: Boolean(data.isLiveChat) };
}

const INVIDIOUS_FALLBACK_INSTANCES = [
  'https://yt.omada.cafe',
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
  'https://invidious.private.coffee'
];

async function invidiousFallbackTrending(primaryUrl: string, region: string = 'JP') {
  const instances = Array.from(new Set([primaryUrl, ...INVIDIOUS_FALLBACK_INSTANCES].filter(Boolean)));
  for (const inst of instances) {
    try {
      const res = await fetchInvidious(inst, 'trending', { region });
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        const items = res.data.map(convertInvidiousItemToYouTubeItem);
        return { kind: 'youtube#videoListResponse', items };
      }
    } catch {
      // try next instance
    }
  }
  return { items: [] };
}

async function invidiousFallbackSearch(query: string, primaryUrl: string, page: number = 1) {
  const instances = Array.from(new Set([primaryUrl, ...INVIDIOUS_FALLBACK_INSTANCES].filter(Boolean)));
  for (const inst of instances) {
    try {
      const res = await fetchInvidious(inst, 'search', { q: query, type: 'video', page: String(page), region: 'JP' });
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        const items = res.data.map(convertInvidiousItemToYouTubeItem);
        return { kind: 'youtube#searchResponse', items, nextPageToken: `page_${page + 1}` };
      }
    } catch {
      // try next instance
    }
  }
  return { items: [] };
}

// 0. YouTube Education Dynamic Parameters & Widget API from Google Spreadsheet
interface CachedEduData {
  parameterText: string;
  widgetApiSource: string;
  expiresAt: number;
}

let cachedEduData: CachedEduData | null = null;

async function getSpreadsheetEduConfig(force = false): Promise<CachedEduData> {
  if (!force && cachedEduData && cachedEduData.expiresAt > Date.now()) {
    return cachedEduData;
  }

  const sheetId = '1dily2wiik92TAyK3zyIsu8TDuyYNoF20IM1iMk_X-pg';
  const sheetName = 'Youtube-education-parameter';
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&range=A1:A2&headers=0`;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(tid);

    if (!response.ok) {
      throw new Error(`Spreadsheet fetch failed: ${response.status}`);
    }

    const text = await response.text();
    const prefix = 'google.visualization.Query.setResponse(';
    const n = text.indexOf(prefix);
    const r = text.lastIndexOf(');');
    if (n < 0 || r < n) {
      throw new Error('Invalid spreadsheet response format');
    }

    const data = JSON.parse(text.slice(n + prefix.length, r));
    const paramRaw = data.table?.rows?.[0]?.c?.[0]?.v || '';
    const widgetApiRaw = data.table?.rows?.[1]?.c?.[0]?.v || '';

    let parameterText = String(paramRaw).replace(/&amp;/g, '&').trim();
    if (parameterText && !parameterText.startsWith('?')) {
      parameterText = '?' + parameterText;
    }
    if (!parameterText) {
      parameterText = '?enablejsapi=1&rel=0&controls=1&showinfo=0&start=0&autoplay=1&playsinline=1&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1';
    }
    if (/autoplay=\d+/.test(parameterText)) {
      parameterText = parameterText.replace(/autoplay=\d+/g, 'autoplay=1');
    } else {
      parameterText += '&autoplay=1';
    }
    if (!parameterText.includes('enablejsapi=1')) {
      parameterText += '&enablejsapi=1';
    }
    if (!parameterText.includes('playsinline=1')) {
      parameterText += '&playsinline=1';
    }

    cachedEduData = {
      parameterText,
      widgetApiSource: String(widgetApiRaw || ''),
      expiresAt: Date.now() + 60 * 60 * 1000 // 1 hour cache
    };
    return cachedEduData;
  } catch (err: any) {
    console.warn('Failed to fetch education param from spreadsheet:', err.message);
    if (cachedEduData) {
      return cachedEduData;
    }
    return {
      parameterText: '?enablejsapi=1&rel=0&controls=1&showinfo=0&start=0&autoplay=1&playsinline=1&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1',
      widgetApiSource: '',
      expiresAt: Date.now() + 60 * 1000
    };
  }
}

// 0-1. YouTube Education Stream URL Generator (/api/stream/youtubeeducation/:videoId)
app.get('/api/stream/youtubeeducation/:videoId', async (req, res) => {
  const { videoId } = req.params;
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'videoId must be an 11-character YouTube video ID' });
  }

  try {
    const config = await getSpreadsheetEduConfig();
    const param = config.parameterText || '?enablejsapi=1&rel=0&controls=1&showinfo=0&start=0&autoplay=1&playsinline=1&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1';
    
    // YouTube Education / restriction bypass embed URL
    const embedUrl = `https://www.youtubeeducation.com/embed/${videoId}${param}`;

    return res.json({
      url: embedUrl,
      videoId,
      param
    });
  } catch (err: any) {
    console.error('Error generating youtubeeducation stream url:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate YouTube Education URL' });
  }
});

// 0-2. YouTube Education Dynamic Parameters & Widget API
app.get('/api/education-param', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const config = await getSpreadsheetEduConfig(force);
    return res.json({
      success: true,
      param: config.parameterText,
      widgetApiSource: config.widgetApiSource,
      hasWidgetApi: Boolean(config.widgetApiSource && config.widgetApiSource.length > 100)
    });
  } catch (err: any) {
    return res.json({
      success: false,
      param: '?enablejsapi=1&rel=0&control=1&showinfo=0&start=0&autoplay=0&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1',
      widgetApiSource: '',
      hasWidgetApi: false
    });
  }
});

// 0-3. Self-Hosted Stream Status & Worker PoW Guard Session Endpoints
app.get(['/api/__guard/challenge', '/api/v1/guard/challenge'], async (req, res) => {
  try {
    const existingSid = String(req.query.guard_sid || '').trim();
    const difficulty = String(req.query.difficulty || '').trim();
    const workerRes = await invokeSelfBuiltInnerTubeWorker('/api/__guard/challenge', {
      guard_sid: existingSid,
      difficulty
    });
    return res.status(workerRes.status || 200).json(workerRes.data);
  } catch (err: any) {
    const existingSid = String(req.query.guard_sid || '').trim();
    const sessionId =
      /^[A-Za-z0-9_-]{43}$/.test(existingSid)
        ? existingSid
        : crypto.randomBytes(32).toString('base64url');
    const challengeId = crypto.randomBytes(16).toString('base64url');
    const nonce = crypto.randomBytes(12).toString('base64url');
    return res.json({
      version: 1,
      sessionId,
      challengeId,
      nonce,
      difficultyBits: 12,
      expiresAt: Math.floor((Date.now() + 120_000) / 1000)
    });
  }
});

app.get(['/api/__guard/verify', '/api/v1/guard/verify'], async (req, res) => {
  try {
    const sid = String(req.query.guard_sid || '').trim();
    const cid = String(req.query.challenge_id || '').trim();
    const counter = String(req.query.counter ?? '').trim();
    const workerRes = await invokeSelfBuiltInnerTubeWorker('/api/__guard/verify', {
      guard_sid: sid,
      challenge_id: cid,
      counter
    });
    return res.status(workerRes.status || 200).json(workerRes.data);
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      code: 'VERIFY_ERROR',
      message: err?.message || 'PoW verification error'
    });
  }
});

app.get(['/api/__guard/status', '/api/v1/guard/status'], async (req, res) => {
  try {
    const sid = String(req.query.guard_sid || '').trim();
    const workerRes = await invokeSelfBuiltInnerTubeWorker('/api/__guard/status', {
      guard_sid: sid
    });
    return res.status(workerRes.status || 200).json(workerRes.data);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Status error' });
  }
});

// 0-4. Google Apps Script (GAS) Sync & Code Generator (Serves latest gas/Code.gs and gas/index.html)
app.get('/api/gas/code', (req, res) => {
  let gasScript = '';
  let gasHtml = '';
  try {
    gasScript = fs.readFileSync(path.join(process.cwd(), 'gas', 'Code.gs'), 'utf8');
  } catch (err) {
    console.warn('Failed to read gas/Code.gs:', err);
  }
  try {
    gasHtml = fs.readFileSync(path.join(process.cwd(), 'gas', 'index.html'), 'utf8');
  } catch (err) {
    console.warn('Failed to read gas/index.html:', err);
  }

  if (req.query.format === 'text') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(gasScript);
  }
  if (req.query.format === 'html') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(gasHtml);
  }
  return res.json({
    success: true,
    code: gasScript,
    html: gasHtml,
    updatedAt: new Date().toISOString(),
    functionNames: ['doGet', 'doPost', 'handleGasApiRequest', 'handleProxy', 'fetchAsBase64', 'refreshHtmlToDocs']
  });
});

// Student Accounts & Study History Store (Sender email: t74442416@gmail.com -> Recipient: registered email)
const SENDER_AUTH_EMAIL = 't74442416@gmail.com';
const STUDENT_DATA_FILE = path.join(process.cwd(), 'data', 'student_accounts.json');

interface StudyActivityLogItem {
  id: string;
  timestamp: string;
  type: 'problem' | 'mockexam' | 'flashcard';
  subjectLabel: string;
  unitName: string;
  title: string;
  isCorrect: boolean;
  scoreDetail?: string;
}

interface MockExamRecord {
  id: string;
  date: string;
  score: number;
  correct: number;
  total: number;
  deviation: number;
  rank: string;
  wrongUnits: string[];
}

interface StudentStudyProgress {
  solvedIds: Record<string, boolean>;
  attemptCount: number;
  correctCount: number;
  streakCount: number;
  studySeconds: number;
  masteredCards: Record<string, boolean>;
  exams: any[];
  activityLogs: StudyActivityLogItem[];
  mockExamHistory: MockExamRecord[];
  updatedAt: string;
}

interface RegisteredStudentAccount {
  username: string;
  email: string;
  password: string;
  createdAt: string;
  progress?: StudentStudyProgress;
}

interface PendingVerificationCode {
  username: string;
  email: string;
  password: string;
  code: string;
  expiresAt: number;
}

const registeredStudents = new Map<string, RegisteredStudentAccount>();
const pendingVerifications = new Map<string, PendingVerificationCode>();

function createDefaultProgress(partial?: Partial<StudentStudyProgress>): StudentStudyProgress {
  return {
    solvedIds: partial?.solvedIds || {},
    attemptCount: typeof partial?.attemptCount === 'number' ? partial.attemptCount : 0,
    correctCount: typeof partial?.correctCount === 'number' ? partial.correctCount : 0,
    streakCount: typeof partial?.streakCount === 'number' ? partial.streakCount : 0,
    studySeconds: typeof partial?.studySeconds === 'number' ? partial.studySeconds : 1455,
    masteredCards: partial?.masteredCards || {},
    exams: Array.isArray(partial?.exams) ? partial.exams : [],
    activityLogs: Array.isArray(partial?.activityLogs) ? partial.activityLogs.slice(0, 100) : [],
    mockExamHistory: Array.isArray(partial?.mockExamHistory) ? partial.mockExamHistory.slice(0, 50) : [],
    updatedAt: new Date().toISOString()
  };
}

function loadStudentAccountsFromDisk() {
  try {
    if (fs.existsSync(STUDENT_DATA_FILE)) {
      const raw = fs.readFileSync(STUDENT_DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.email) {
            registeredStudents.set(String(item.email).toLowerCase(), {
              username: String(item.username || item.email),
              email: String(item.email),
              password: String(item.password || ''),
              createdAt: String(item.createdAt || new Date().toISOString()),
              progress: createDefaultProgress(item.progress)
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load student accounts from disk:', err);
  }
}

function saveStudentAccountsToDisk() {
  try {
    const dir = path.dirname(STUDENT_DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const arr = Array.from(registeredStudents.values());
    fs.writeFileSync(STUDENT_DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save student accounts to disk:', err);
  }
}

loadStudentAccountsFromDisk();

// Outer Disguise Gate Authentication (ONLY allows kaito/@0726kaito for media OR education/matheducation for study portal)
app.post('/api/auth/verify', (req, res) => {
  const expectedId = (process.env.PREMIUM_ID || process.env.KAITO_ID || 'kaito').trim();
  const expectedPassword = (process.env.PREMIUM_PASSWORD || process.env.KAITO_PASSWORD || '@0726kaito').trim();

  const { username = '', password = '' } = req.body || {};
  const trimmedUser = String(username).trim();
  const trimmedPass = String(password).trim();

  if (trimmedUser === expectedId && trimmedPass === expectedPassword) {
    return res.json({ success: true, mode: 'media' });
  }

  if (trimmedUser === 'education' && trimmedPass === 'matheducation') {
    return res.json({
      success: true,
      mode: 'study',
      studentId: 'education'
    });
  }

  return res.status(401).json({
    success: false,
    message: '受講生IDまたはパスワードが正しくありません。'
  });
});

// Inside-Study-Portal Personal Account Login (by registered email e.g. a22621917@gmail.com or username)
app.post('/api/auth/student-login', (req, res) => {
  const { identifier = '', password = '' } = req.body || {};
  const cleanId = String(identifier).trim().toLowerCase();
  const cleanPass = String(password).trim();

  if (!cleanId || !cleanPass) {
    return res.status(400).json({
      success: false,
      message: '登録メールアドレス（または受講生ID）とパスワードを入力してください。'
    });
  }

  for (const acc of registeredStudents.values()) {
    if (
      (acc.email.toLowerCase() === cleanId || acc.username.toLowerCase() === cleanId) &&
      acc.password === cleanPass
    ) {
      return res.json({
        success: true,
        studentId: acc.username,
        email: acc.email,
        createdAt: acc.createdAt,
        progress: createDefaultProgress(acc.progress),
        message: `${acc.email} の個人学習アカウントにログインしました（学習履歴を復元しました）。`
      });
    }
  }

  return res.status(401).json({
    success: false,
    message: 'メールアドレス（または受講生ID）またはパスワードが正しくありません。'
  });
});

// Issue 6-digit verification code and send FROM t74442416@gmail.com TO the registered email (e.g. a22621917@gmail.com)
app.post('/api/auth/send-code', async (req, res) => {
  const { username = '', email = '', password = '', gasRelayUrl = '' } = req.body || {};
  const cleanUser = String(username).trim();
  const cleanEmail = String(email).trim();
  const cleanPass = String(password).trim();

  if (!cleanUser || !cleanEmail || !cleanPass) {
    return res.status(400).json({
      success: false,
      message: '受講生ID・メールアドレス・パスワードをすべて入力してください。'
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({
      success: false,
      message: '有効なメールアドレスを入力してください。'
    });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 15 * 60 * 1000;
  pendingVerifications.set(cleanEmail.toLowerCase(), {
    username: cleanUser,
    email: cleanEmail,
    password: cleanPass,
    code,
    expiresAt
  });

  // Optional GAS relay if a script.google.com URL is provided or configured in env
  let gasMailSent = false;
  const candidateGasUrl = String(
    gasRelayUrl ||
      req.headers['x-custom-proxy-url'] ||
      process.env.GAS_WEBAPP_URL ||
      ''
  ).trim();

  if (candidateGasUrl.startsWith('https://script.google.com/macros/s/')) {
    try {
      const sep = candidateGasUrl.includes('?') ? '&' : '?';
      const relayTarget = `${candidateGasUrl}${sep}action=send_verify_email&to=${encodeURIComponent(
        cleanEmail
      )}&username=${encodeURIComponent(cleanUser)}&code=${encodeURIComponent(code)}`;
      const relayRes = await fetch(relayTarget, { method: 'GET' });
      if (relayRes.ok) {
        gasMailSent = true;
      }
    } catch (err) {
      console.warn('GAS mail relay warning:', err);
    }
  }

  return res.json({
    success: true,
    mailSent: gasMailSent,
    senderEmail: SENDER_AUTH_EMAIL,
    recipientEmail: cleanEmail,
    verificationCode: code,
    message: `差出人 ${SENDER_AUTH_EMAIL} から ${cleanEmail} 宛に6桁の認証コードを送信しました。`
  });
});

// Verify 6-digit code sent to cleanEmail (from t74442416@gmail.com) and complete student account registration
app.post('/api/auth/register', (req, res) => {
  const { username = '', email = '', password = '', code = '', progress } = req.body || {};
  const cleanUser = String(username).trim();
  const cleanEmail = String(email).trim();
  const cleanPass = String(password).trim();
  const cleanCode = String(code).trim();

  const pending = pendingVerifications.get(cleanEmail.toLowerCase());
  if (!pending) {
    return res.status(400).json({
      success: false,
      message: '認証コードが発行されていないか、有効期限が切れています。再度コードを発行してください。'
    });
  }
  if (Date.now() > pending.expiresAt) {
    pendingVerifications.delete(cleanEmail.toLowerCase());
    return res.status(400).json({
      success: false,
      message: '認証コードの有効期限（15分）が切れています。再度発行してください。'
    });
  }
  if (pending.code !== cleanCode) {
    return res.status(400).json({
      success: false,
      message: '認証コードが一致しません。6桁のコードを正しく入力してください。'
    });
  }

  const existing = registeredStudents.get(cleanEmail.toLowerCase());
  const newAccount: RegisteredStudentAccount = {
    username: cleanUser || pending.username,
    email: cleanEmail,
    password: cleanPass || pending.password,
    createdAt: existing?.createdAt || new Date().toISOString(),
    progress: createDefaultProgress(progress || existing?.progress)
  };
  registeredStudents.set(cleanEmail.toLowerCase(), newAccount);
  pendingVerifications.delete(cleanEmail.toLowerCase());
  saveStudentAccountsToDisk();

  return res.json({
    success: true,
    mode: 'study',
    studentId: newAccount.username,
    email: newAccount.email,
    senderEmail: SENDER_AUTH_EMAIL,
    progress: newAccount.progress,
    message: `${newAccount.email} の受講生アカウント本登録が完了し、学習履歴データを保存しました。`
  });
});

// Get or Save Student Account Study Progress & History
app.get('/api/auth/student-progress', (req, res) => {
  const identifier = String(req.query.identifier || req.query.email || req.query.studentId || '').trim().toLowerCase();
  if (!identifier) {
    return res.status(400).json({ success: false, message: 'identifier is required' });
  }
  for (const acc of registeredStudents.values()) {
    if (acc.email.toLowerCase() === identifier || acc.username.toLowerCase() === identifier) {
      return res.json({
        success: true,
        studentId: acc.username,
        email: acc.email,
        progress: createDefaultProgress(acc.progress)
      });
    }
  }
  return res.status(404).json({ success: false, message: 'Account not found' });
});

app.post('/api/auth/student-progress', (req, res) => {
  const { identifier = '', email = '', studentId = '', progress = {} } = req.body || {};
  const lookup = String(email || identifier || studentId).trim().toLowerCase();
  if (!lookup) {
    return res.status(400).json({ success: false, message: 'identifier is required' });
  }

  let targetAcc: RegisteredStudentAccount | undefined;
  for (const acc of registeredStudents.values()) {
    if (acc.email.toLowerCase() === lookup || acc.username.toLowerCase() === lookup) {
      targetAcc = acc;
      break;
    }
  }

  if (!targetAcc) {
    // Also allow auto-creating a record if the student registered locally
    const fallbackEmail = String(email || (lookup.includes('@') ? lookup : `${lookup}@student.local`));
    targetAcc = {
      username: String(studentId || identifier || fallbackEmail),
      email: fallbackEmail,
      password: '',
      createdAt: new Date().toISOString(),
      progress: createDefaultProgress(progress)
    };
    registeredStudents.set(fallbackEmail.toLowerCase(), targetAcc);
  } else {
    const prev = createDefaultProgress(targetAcc.progress);
    targetAcc.progress = createDefaultProgress({
      solvedIds: { ...prev.solvedIds, ...(progress.solvedIds || {}) },
      attemptCount: typeof progress.attemptCount === 'number' ? progress.attemptCount : prev.attemptCount,
      correctCount: typeof progress.correctCount === 'number' ? progress.correctCount : prev.correctCount,
      streakCount: typeof progress.streakCount === 'number' ? progress.streakCount : prev.streakCount,
      studySeconds: typeof progress.studySeconds === 'number' ? progress.studySeconds : prev.studySeconds,
      masteredCards: { ...prev.masteredCards, ...(progress.masteredCards || {}) },
      exams: Array.isArray(progress.exams) ? progress.exams : prev.exams,
      activityLogs: Array.isArray(progress.activityLogs) ? progress.activityLogs.slice(0, 100) : prev.activityLogs,
      mockExamHistory: Array.isArray(progress.mockExamHistory)
        ? progress.mockExamHistory.slice(0, 50)
        : prev.mockExamHistory
    });
  }

  saveStudentAccountsToDisk();
  return res.json({
    success: true,
    studentId: targetAcc.username,
    email: targetAcc.email,
    progress: targetAcc.progress
  });
});

// ============================================================================
// 自作ニコニコ動画エンジン (100% In-House Niconico Engine — 外部個人サーバー依存ゼロ)
// - 検索・おすすめ: ニコニコ公式 Snapshot Search API v2 直接通信
// - 動画情報・実コメント: www.nicovideo.jp/watch?responseType=json + nvComment API 直接通信
// - 映像・音声ストリーム & DL: Domand HLS アクセス権取得 + Node.js AES-128-CBC 並列復号 + FFmpeg 無劣化高速結合
// - レビュー・アクセスカウンター: 自前サーバー永続保存 (data/nico_reviews.json)
// ============================================================================

const NICO_DATA_FILE = path.join(process.cwd(), 'data', 'nico_reviews.json');

interface NicoReviewEntry {
  deviceId: string;
  iconInitial: string;
  displayName: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

interface NicoLocalStore {
  visitCount: number;
  reviews: NicoReviewEntry[];
}

const nicoStore: NicoLocalStore = {
  visitCount: 1280,
  reviews: []
};

function loadNicoStoreFromDisk(): void {
  try {
    if (fs.existsSync(NICO_DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(NICO_DATA_FILE, 'utf8'));
      if (typeof parsed.visitCount === 'number') nicoStore.visitCount = parsed.visitCount;
      if (Array.isArray(parsed.reviews)) nicoStore.reviews = parsed.reviews;
    }
  } catch (err) {
    console.warn('Failed to load nico_reviews.json:', err);
  }
}

function saveNicoStoreToDisk(): void {
  try {
    const dir = path.dirname(NICO_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(NICO_DATA_FILE, JSON.stringify(nicoStore, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save nico_reviews.json:', err);
  }
}

loadNicoStoreFromDisk();

function formatNicoDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function extractNicoIdFromInput(raw: string): string {
  const str = String(raw || '').trim();
  const match = str.match(/((?:sm|nm|so)\d+)/i);
  return match ? match[1].toLowerCase() : str;
}

async function searchNicoSnapshotDirect(query: string, limit = 24, sort = '-viewCounter') {
  const q = query.trim() || 'VOCALOID OR 歌ってみた OR ゆっくり実況 OR ゲーム OR アニメ OR 音楽';
  const params = new URLSearchParams({
    q,
    targets: 'title,tags',
    fields:
      'contentId,title,description,viewCounter,mylistCounter,likeCounter,lengthSeconds,thumbnailUrl,startTime,commentCounter,userId,channelId',
    _sort: sort,
    _limit: String(limit),
    _context: 'kaitotube-self-engine'
  });
  const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'KaitoTube/3.0 (Self-Built Niconico Engine)',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    throw new Error(`Niconico Snapshot API HTTP ${res.status}`);
  }
  const json: any = await res.json();
  const items = Array.isArray(json?.data) ? json.data : [];
  return items.map((item: any) => ({
    id: item.contentId,
    title: item.title || item.contentId,
    thumbnail: item.thumbnailUrl || '',
    url: `https://www.nicovideo.jp/watch/${item.contentId}`,
    duration: formatNicoDuration(item.lengthSeconds || 0),
    channel: 'ニコニコ動画',
    channel_url: item.userId ? `https://www.nicovideo.jp/user/${item.userId}` : '',
    views: Number(item.viewCounter) || 0,
    commentsCount: Number(item.commentCounter) || 0,
    mylistCount: Number(item.mylistCounter) || 0,
    publishedAt: item.startTime || ''
  }));
}

async function fetchNicoWatchDataDirect(videoId: string) {
  const cleanId = extractNicoIdFromInput(videoId);
  const watchUrl = `https://www.nicovideo.jp/watch/${encodeURIComponent(cleanId)}?responseType=json`;
  const res = await fetch(watchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'X-Frontend-Id': '6',
      'X-Frontend-Version': '0'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    throw new Error(`Niconico Watch API HTTP ${res.status}`);
  }
  const setCookies: string[] =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
  const json: any = await res.json();
  return {
    response: json?.data?.response,
    cookies: setCookies.map((c) => String(c).split(';')[0]).filter(Boolean)
  };
}

interface NicoStreamJob {
  id: string;
  videoId: string;
  status: 'processing' | 'completed' | 'error' | 'cancelled';
  progress: number;
  totalSize: string;
  filePath: string;
  videoOnlyPath?: string;
  audioOnlyPath?: string;
  title?: string;
  description?: string;
  ownerName?: string;
  ownerIcon?: string;
  resolution?: string;
  error?: string;
  createdAt: number;
}

const nicoSelfJobs = new Map<string, NicoStreamJob>();
const nicoCompletedCache = new Map<string, { filePath: string; totalSize: string; resolution: string; updatedAt: number }>();

async function downloadAndDecryptDomandTrack(
  m3u8Url: string,
  cookieHeader: string,
  onSegmentProgress: (doneSegs: number, totalSegs: number, bytesSoFar: number) => void,
  isCancelled: () => boolean
): Promise<Buffer> {
  const plRes = await fetch(m3u8Url, {
    headers: {
      Cookie: cookieHeader,
      Origin: 'https://www.nicovideo.jp',
      Referer: 'https://www.nicovideo.jp/',
      'User-Agent': 'Mozilla/5.0'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!plRes.ok) {
    throw new Error(`Failed to fetch Domand variant playlist (${plRes.status})`);
  }
  const txt = await plRes.text();
  const lines = txt.split('\n').map((l) => l.trim());
  const mapUri = lines.find((l) => l.startsWith('#EXT-X-MAP:'))?.match(/URI="([^"]+)"/)?.[1];
  const keyLine = lines.find((l) => l.startsWith('#EXT-X-KEY:'));
  const keyUri = keyLine?.match(/URI="([^"]+)"/)?.[1];
  const ivHex = keyLine?.match(/IV=0x([0-9a-fA-F]+)/)?.[1];
  const segUris = lines.filter((l) => l.startsWith('https://'));

  if (!mapUri || !keyUri || segUris.length === 0) {
    throw new Error('Invalid Domand HLS playlist structure');
  }

  const [initBuf, keyBuf] = await Promise.all([
    fetch(mapUri, { headers: { Cookie: cookieHeader } })
      .then((r) => r.arrayBuffer())
      .then((b) => Buffer.from(b)),
    fetch(keyUri, { headers: { Cookie: cookieHeader } })
      .then((r) => r.arrayBuffer())
      .then((b) => Buffer.from(b))
  ]);

  const ivBuf = ivHex ? Buffer.from(ivHex, 'hex') : Buffer.alloc(16, 0);
  const decryptedSegments: Buffer[] = new Array(segUris.length);
  let completedCount = 0;
  let totalBytes = initBuf.length;

  // Download & AES-128-CBC decrypt in parallel batches of 6
  const concurrency = 6;
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < segUris.length) {
      if (isCancelled()) throw new Error('Job cancelled');
      const idx = nextIdx++;
      const segUrl = segUris[idx];
      const segRes = await fetch(segUrl, {
        headers: { Cookie: cookieHeader },
        signal: AbortSignal.timeout(12000)
      });
      if (!segRes.ok) {
        throw new Error(`Segment ${idx} HTTP ${segRes.status}`);
      }
      const encBuf = Buffer.from(await segRes.arrayBuffer());
      const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuf, ivBuf);
      const decBuf = Buffer.concat([decipher.update(encBuf), decipher.final()]);
      decryptedSegments[idx] = decBuf;
      completedCount++;
      totalBytes += decBuf.length;
      onSegmentProgress(completedCount, segUris.length, totalBytes);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, segUris.length) }, () => worker()));
  return Buffer.concat([initBuf, ...decryptedSegments]);
}

async function runSelfBuiltNicoJob(job: NicoStreamJob): Promise<void> {
  try {
    const { response: resp, cookies: watchCookies } = await fetchNicoWatchDataDirect(job.videoId);
    if (!resp) throw new Error('動画データの取得に失敗しました');

    job.title = resp.video?.title || job.videoId;
    job.description = resp.video?.description || '';
    job.ownerName = resp.owner?.nickname || resp.channel?.name || 'ニコニコ動画';
    job.ownerIcon = resp.owner?.iconUrl || resp.channel?.thumbnail?.url || '';

    const domand = resp.media?.domand;
    const trackId = resp.client?.watchTrackId;
    if (!domand || !domand.accessRightKey || !trackId) {
      throw new Error('Domandストリーム情報の取得に失敗しました');
    }

    const availVideos = (domand.videos || []).filter((v: any) => v.isAvailable);
    const availAudios = (domand.audios || []).filter((a: any) => a.isAvailable);
    const bestVideo = availVideos[0]?.id;
    const bestAudio = availAudios[0]?.id;
    if (!bestVideo || !bestAudio) {
      throw new Error('利用可能な映像または音声トラックがありません');
    }
    job.resolution = bestVideo.replace('video-h264-', '');

    const watchCookieHeader = watchCookies.join('; ');
    const hlsRes = await fetch(
      `https://nvapi.nicovideo.jp/v1/watch/${encodeURIComponent(job.videoId)}/access-rights/hls?actionTrackId=${encodeURIComponent(trackId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'X-Request-With': 'https://www.nicovideo.jp',
          'X-Access-Right-Key': domand.accessRightKey,
          Origin: 'https://www.nicovideo.jp',
          Referer: `https://www.nicovideo.jp/watch/${job.videoId}`,
          Cookie: watchCookieHeader,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({ outputs: [[bestVideo, bestAudio]] }),
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!hlsRes.ok) {
      throw new Error(`HLSアクセス権の取得に失敗しました (HTTP ${hlsRes.status})`);
    }

    const hlsCookies: string[] =
      typeof (hlsRes.headers as any).getSetCookie === 'function'
        ? (hlsRes.headers as any).getSetCookie()
        : [hlsRes.headers.get('set-cookie')].filter(Boolean);
    const allCookies = [...watchCookies, ...hlsCookies.map((c) => String(c).split(';')[0]).filter(Boolean)].join('; ');

    const hlsJson: any = await hlsRes.json();
    const masterUrl = hlsJson?.data?.contentUrl;
    if (!masterUrl) throw new Error('マスターM3U8 URLが見つかりません');

    const masterRes = await fetch(masterUrl, {
      headers: { Cookie: allCookies, 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });
    const masterText = await masterRes.text();
    const masterLines = masterText.split('\n').map((l) => l.trim());
    const videoM3u8Url = masterLines.find((l) => l.startsWith('https://'));
    const audioM3u8Url = masterLines
      .find((l) => l.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'))
      ?.match(/URI="([^"]+)"/)?.[1];

    if (!videoM3u8Url || !audioM3u8Url) {
      throw new Error('映像・音声M3U8の解析に失敗しました');
    }

    job.progress = 5;
    let vProgress = 0;
    let aProgress = 0;
    let vBytes = 0;
    let aBytes = 0;

    const updateCombinedProgress = () => {
      const combinedRatio = vProgress * 0.75 + aProgress * 0.25;
      job.progress = Math.min(94, Math.max(5, Math.round(5 + combinedRatio * 89)));
      const estTotalBytes =
        combinedRatio > 0.05 ? (vBytes + aBytes) / combinedRatio : vBytes + aBytes;
      if (estTotalBytes > 0) {
        job.totalSize = `${(estTotalBytes / 1024 / 1024).toFixed(2)}MiB`;
      }
    };

    const isCancelled = () => job.status === 'cancelled';

    const [vBuf, aBuf] = await Promise.all([
      downloadAndDecryptDomandTrack(
        videoM3u8Url,
        allCookies,
        (done, total, bytes) => {
          vProgress = done / Math.max(1, total);
          vBytes = bytes;
          updateCombinedProgress();
        },
        isCancelled
      ),
      downloadAndDecryptDomandTrack(
        audioM3u8Url,
        allCookies,
        (done, total, bytes) => {
          aProgress = done / Math.max(1, total);
          aBytes = bytes;
          updateCombinedProgress();
        },
        isCancelled
      )
    ]);

    if (isCancelled()) return;

    const tmpV = `/tmp/kaito_nico_${job.id}_v.mp4`;
    const tmpA = `/tmp/kaito_nico_${job.id}_a.m4a`;
    const finalMp4 = `/tmp/kaito_nico_${job.videoId}.mp4`;

    fs.writeFileSync(tmpV, vBuf);
    fs.writeFileSync(tmpA, aBuf);

    job.progress = 96;

    await new Promise<void>((resolve, reject) => {
      execFile(
        'ffmpeg',
        ['-y', '-i', tmpV, '-i', tmpA, '-c', 'copy', '-movflags', '+faststart', finalMp4],
        { timeout: 25000 },
        (err) => {
          try {
            if (fs.existsSync(tmpV)) fs.unlinkSync(tmpV);
            if (fs.existsSync(tmpA)) fs.unlinkSync(tmpA);
          } catch {}
          if (err) return reject(err);
          resolve();
        }
      );
    });

    const stat = fs.statSync(finalMp4);
    const finalSizeStr = `${(stat.size / 1024 / 1024).toFixed(2)}MiB`;
    job.filePath = finalMp4;
    job.totalSize = finalSizeStr;
    job.progress = 100;
    job.status = 'completed';

    nicoCompletedCache.set(job.videoId, {
      filePath: finalMp4,
      totalSize: finalSizeStr,
      resolution: job.resolution || '360p',
      updatedAt: Date.now()
    });
  } catch (err: any) {
    if (job.status !== 'cancelled') {
      console.error(`[Self-Built Nico Job Error] (${job.videoId}):`, err?.message || err);
      job.status = 'error';
      job.error = err?.message || '動画の処理に失敗しました';
    }
  }
}

// Stream completed MP4 file from local disk with full HTTP 206 Range support
app.get('/api/nico/job-file', (req, res) => {
  const id = String(req.query.id || '').trim();
  const job = nicoSelfJobs.get(id);
  const filePath = job?.filePath;

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: '動画ファイルが見つかりません' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'video/mp4');
  if (req.query.download === '1') {
    const dlName = `${job?.videoId || id}.mp4`;
    res.setHeader('Content-Disposition', `attachment; filename="${dlName}"`);
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (start >= fileSize || end >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }
    const chunksize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', String(chunksize));
    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    res.status(200);
    res.setHeader('Content-Length', String(fileSize));
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
});

// Self-Built Niconico API Handler (/api/nico/:action)
app.all('/api/nico/:action', async (req, res) => {
  const action = String(req.params.action || '').trim();

  try {
    // 1. Visitor Counter
    if (action === 'visit') {
      nicoStore.visitCount += 1;
      saveNicoStoreToDisk();
      return res.json({ count: nicoStore.visitCount });
    }

    // 2. Thumbnail Base64 Proxy
    if (action === 'thumb-base64') {
      const targetUrl = String(req.query.url || '').trim();
      if (!targetUrl) return res.status(400).json({ error: 'Missing url' });
      const imgRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://www.nicovideo.jp/'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!imgRes.ok) return res.status(502).json({ error: 'Thumbnail fetch failed' });
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const arrayBuf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(arrayBuf).toString('base64');
      return res.json({ base64: `data:${contentType};base64,${b64}` });
    }

    // 3. Recommend (Trending / Popular Niconico Videos via Official Snapshot API v2)
    if (action === 'recommend') {
      const items = await searchNicoSnapshotDirect(
        'VOCALOID OR 歌ってみた OR ゆっくり実況 OR ゲーム実況 OR アニメ OR ボカロ OR 東方 OR 音楽',
        28,
        '-viewCounter'
      );
      return res.json(items);
    }

    // 4. Search (Keyword Search via Official Snapshot API v2)
    if (action === 'search') {
      const q = String(req.query.q || '').trim();
      const sort = String(req.query.sort || '-viewCounter').trim();
      const items = await searchNicoSnapshotDirect(q, 32, sort);
      return res.json(items);
    }

    // 5. Real Niconico Comments & Video Details (Direct Watch JSON + nvComment API)
    if (action === 'nico-comments') {
      const rawId = String(req.query.id || '').trim();
      if (!rawId) return res.status(400).json({ error: 'Missing video id' });
      const { response: resp } = await fetchNicoWatchDataDirect(rawId);
      const nvComment = resp?.comment?.nvComment;
      const details = {
        id: resp?.video?.id || rawId,
        title: resp?.video?.title || '',
        description: resp?.video?.description || '',
        views: resp?.video?.count?.view || 0,
        commentsCount: resp?.video?.count?.comment || 0,
        mylistCount: resp?.video?.count?.mylist || 0,
        likeCount: resp?.video?.count?.like || 0,
        duration: formatNicoDuration(resp?.video?.duration || 0),
        registeredAt: resp?.video?.registeredAt || '',
        ownerName: resp?.owner?.nickname || resp?.channel?.name || 'ニコニコ動画',
        ownerIcon: resp?.owner?.iconUrl || resp?.channel?.thumbnail?.url || '',
        ownerId: resp?.owner?.id || resp?.channel?.id || ''
      };

      if (!nvComment || !nvComment.server) {
        return res.json({ comments: [], details });
      }

      const commRes = await fetch(`${nvComment.server}/v1/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify({
          params: nvComment.params,
          threadKey: nvComment.threadKey,
          additionals: {}
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!commRes.ok) {
        return res.json({ comments: [], details });
      }

      const commJson: any = await commRes.json();
      const threads = Array.isArray(commJson?.data?.threads) ? commJson.data.threads : [];
      const mergedComments: { text: string; timeMs: number; commands: string[]; postedAt?: string }[] = [];
      for (const t of threads) {
        if (Array.isArray(t.comments)) {
          for (const c of t.comments) {
            if (c && typeof c.body === 'string' && c.body.trim()) {
              mergedComments.push({
                text: c.body,
                timeMs: Number(c.vposMs) || 0,
                commands: Array.isArray(c.commands) ? c.commands : [],
                postedAt: c.postedAt || ''
              });
            }
          }
        }
      }
      mergedComments.sort((a, b) => a.timeMs - b.timeMs);
      return res.json({ comments: mergedComments, details });
    }

    // 6. Start Self-Built Stream / Download Job
    if (action === 'job-start') {
      const rawUrl = String(req.query.url || req.query.id || '').trim();
      const videoId = extractNicoIdFromInput(rawUrl);
      if (!videoId) {
        return res.status(400).json({ error: '有効なニコニコ動画ID (sm〜) が指定されていません' });
      }

      const jobId = crypto.randomBytes(8).toString('hex');
      const cached = nicoCompletedCache.get(videoId);
      if (cached && fs.existsSync(cached.filePath) && Date.now() - cached.updatedAt < 30 * 60 * 1000) {
        nicoSelfJobs.set(jobId, {
          id: jobId,
          videoId,
          status: 'completed',
          progress: 100,
          totalSize: cached.totalSize,
          filePath: cached.filePath,
          resolution: cached.resolution,
          createdAt: Date.now()
        });
        return res.json({ jobId, cached: true });
      }

      const newJob: NicoStreamJob = {
        id: jobId,
        videoId,
        status: 'processing',
        progress: 2,
        totalSize: '計算中...',
        filePath: '',
        createdAt: Date.now()
      };
      nicoSelfJobs.set(jobId, newJob);
      runSelfBuiltNicoJob(newJob);
      return res.json({ jobId });
    }

    // 7. Poll Job Progress
    if (action === 'job-progress') {
      const id = String(req.query.id || '').trim();
      const job = nicoSelfJobs.get(id);
      if (!job) {
        return res.status(404).json({ status: 'error', error: 'Job not found' });
      }
      return res.json({
        status: job.status,
        progress: job.progress,
        totalSize: job.totalSize,
        title: job.title,
        description: job.description,
        ownerName: job.ownerName,
        ownerIcon: job.ownerIcon,
        resolution: job.resolution,
        error: job.error
      });
    }

    // 8. Cancel Job
    if (action === 'job-cancel') {
      const id = String(req.query.id || '').trim();
      const job = nicoSelfJobs.get(id);
      if (job && job.status === 'processing') {
        job.status = 'cancelled';
      }
      return res.json({ ok: true });
    }

    // 9. Site Reviews List
    if (action === 'reviews') {
      const deviceId = String(req.query.deviceId || '').trim();
      const total = nicoStore.reviews.length;
      const average =
        total > 0
          ? nicoStore.reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / total
          : 0;
      const myReview = deviceId ? nicoStore.reviews.find((r) => r.deviceId === deviceId) || null : null;
      return res.json({
        total,
        average,
        myReview,
        reviews: nicoStore.reviews.slice(0, 50)
      });
    }

    // 10. Save Site Review
    if (action === 'review-save') {
      const deviceId = String(req.query.deviceId || req.body?.deviceId || '').trim();
      const rating = Math.max(1, Math.min(5, Number(req.query.rating || req.body?.rating) || 5));
      const comment = Array.from(String(req.query.comment ?? req.body?.comment ?? '').trim())
        .slice(0, 20)
        .join('');
      if (!deviceId) {
        return res.status(400).json({ error: '端末IDが不足しています' });
      }
      const nowIso = new Date().toISOString();
      const existingIdx = nicoStore.reviews.findIndex((r) => r.deviceId === deviceId);
      let updated = false;
      if (existingIdx >= 0) {
        nicoStore.reviews[existingIdx].rating = rating;
        nicoStore.reviews[existingIdx].comment = comment;
        nicoStore.reviews[existingIdx].updatedAt = nowIso;
        updated = true;
      } else {
        const suffix = deviceId.slice(0, 4).toUpperCase();
        nicoStore.reviews.unshift({
          deviceId,
          iconInitial: suffix[0] || 'U',
          displayName: `ユーザー #${suffix}`,
          rating,
          comment,
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }
      saveNicoStoreToDisk();
      return res.json({ ok: true, updated });
    }

    return res.status(404).json({ error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error(`[Self-Built Nico API Error] (${action}):`, err?.message || err);
    return res.status(500).json({ error: err?.message || 'ニコニコ自作エンジンでエラーが発生しました' });
  }
});

// 1. Trending / Most Popular Videos (LuanRT/YouTube.js Multi-Query Feed + Pagination + InnerTube Worker Fallback)
app.get('/api/youtube/trending', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { videoCategoryId = '', pageToken = '' } = req.query;

  const categoryQueriesMap: Record<string, string[][]> = {
    '10': [
      ['人気 音楽 MV 公式 新曲', 'J-POP ランキング 公式 MV', 'ボカロ 人気 MV 曲', 'アニソン 人気 公式 MV'],
      ['邦楽 ヒット曲 メドレー MV', 'YOASOBI 米津玄師 Mrs. GREEN APPLE 公式', 'Official髭男dism Vaundy Ado MV', '作業用BGM 人気 プレイリスト']
    ],
    '20': [
      ['ゲーム実況 人気 トレンド', 'マインクラフト 実況 人気', 'ポケモン スプラトゥーン 実況 人気', '最新ゲーム トレーラー 公式'],
      ['APEX ヴァロラント 実況 人気', 'ホラーゲーム 実況 人気', 'RTA 解説 人気 動画', 'インディーゲーム 実況 人気']
    ],
    '27': [
      ['教育 解説 わかりやすい 授業', '歴史 科学 雑学 解説 人気', '英語 学習 フレーズ 人気', '数学 物理 解説 講義'],
      ['プログラミング 入門 解説', 'IT パスポート 基本情報 解説', '経済 ニュース わかりやすい 解説', '宇宙 科学 ドキュメンタリー']
    ],
    '28': [
      ['ガジェット レビュー 人気 最新', 'AI 最新技術 解説 動画', '自作PC スマホ レビュー 人気', '科学 技術 解説 トレンド'],
      ['プログラミング Web開発 解説', '最新テクノロジー ニュース', 'ロボット 宇宙開発 解説', 'Apple iPhone Mac レビュー']
    ],
    '24': [
      ['エンタメ バラエティ 人気 動画', 'お笑い コント 人気 公式', '企画 検証 人気 YouTuber', '話題 急上昇 トレンド 動画'],
      ['ドッキリ 企画 人気 動画', 'コラボ 企画 人気 動画', '大食い グルメ 人気 動画', 'トーク バラエティ 公式']
    ],
    '17': [
      ['スポーツ ハイライト 公式 人気', 'サッカー 日本代表 ハイライト', 'プロ野球 メジャーリーグ 大谷翔平 ハイライト', 'バスケットボール バレーボール ハイライト'],
      ['格闘技 ボクシング ハイライト', '陸上 マラソン 駅伝 ハイライト', 'テニス ゴルフ ハイライト', 'スーパープレイ スポーツ 名場面']
    ],
    '25': [
      ['最新ニュース 解説 公式', '経済 国際ニュース 解説', '天気 防災 ニュース 公式', '話題 ニュース 特集 報道'],
      ['ビジネス トレンド 解説', '時事問題 わかりやすい 解説', 'テクノロジー 経済 ニュース', '国会 政治 ニュース 解説']
    ],
    '26': [
      ['料理 レシピ 簡単 人気', 'DIY ライフハック 作り方', 'メイク ファッション トレンド', '筋トレ ストレッチ ルーティン'],
      ['お菓子作り 簡単 レシピ', '部屋紹介 インテリア ルームツアー', '収納 掃除 ライフハック', 'イラスト 描き方 メイキング']
    ]
  };

  const defaultPages: string[][] = [
    [
      '急上昇 トレンド 人気 動画 公式',
      '人気 音楽 MV 公式 新曲 2026',
      'ゲーム実況 人気 トレンド 話題',
      'バラエティ エンタメ 人気 動画',
      '話題 解説 雑学 人気 動画'
    ],
    [
      'J-POP 人気 MV ランキング 公式',
      'アニメ 公式 PV 人気 動画',
      '料理 レシピ 簡単 人気 動画',
      'ガジェット レビュー 最新 人気',
      'スポーツ ハイライト 公式 人気'
    ],
    [
      'マインクラフト 実況 人気 動画',
      'VTuber 切り抜き 配信 人気',
      'お笑い コント 公式 人気 動画',
      '旅行 Vlog 絶景 人気 動画',
      '作業用BGM プレイリスト 人気'
    ],
    [
      '映画 予告 公式 最新 人気',
      '科学 宇宙 歴史 解説 人気',
      'キャンプ アウトドア 人気 動画',
      '猫 犬 ペット 癒し 人気 動画',
      'プログラミング AI 解説 人気'
    ]
  ];

  let pageIndex = 0;
  if (typeof pageToken === 'string' && pageToken.startsWith('page_')) {
    const parsed = parseInt(pageToken.replace('page_', ''), 10);
    if (!isNaN(parsed) && parsed >= 2) {
      pageIndex = parsed - 1;
    }
  }

  const catKey = String(videoCategoryId || '').trim();
  const pagesForRequest = categoryQueriesMap[catKey] || defaultPages;
  const queries = pagesForRequest[pageIndex % pagesForRequest.length];
  const nextPageToken = `page_${pageIndex + 2}`;

  // 1. Primary: LuanRT/YouTube.js Parallel Multi-Query Feed
  try {
    const yt = await getInnertubeClient();
    const collected: any[] = [];
    const seen = new Set<string>();

    const addUnique = (item: any) => {
      if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(item.id) || seen.has(item.id)) return;
      if (!item.snippet?.title) return;
      // Avoid flooding the main home feed with vertical Shorts or unplayable 0-second scheduled premieres
      if (item.isShort) return;
      if (item.lengthSeconds === 0 && item.snippet?.liveBroadcastContent !== 'live') return;
      seen.add(item.id);
      collected.push(item);
    };

    // Also try getHomeFeed on first page if available
    if (pageIndex === 0 && !catKey) {
      try {
        const homeFeed = await yt.getHomeFeed();
        const homeItems = extractAllYouTubeJsItems(homeFeed);
        for (const it of homeItems) addUnique(it);
      } catch {}
    }

    const searchResultsList = await Promise.all(
      queries.map((q) => yt.search(q).catch(() => null))
    );

    // Interleave results across the diverse queries for a rich, balanced recommendation feed
    const extractedLists = searchResultsList.map((res) => (res ? extractAllYouTubeJsItems(res) : []));
    const maxLen = Math.max(0, ...extractedLists.map((l) => l.length));
    for (let i = 0; i < maxLen; i++) {
      for (const list of extractedLists) {
        if (i < list.length) {
          addUnique(list[i]);
        }
      }
    }

    if (collected.length > 0) {
      return res.json({
        kind: 'youtube#videoListResponse',
        items: collected,
        nextPageToken
      });
    }
  } catch (err) {
    console.warn('YouTube.js trending error:', err);
  }

  // 2. Fallback: InnerTube Worker (https://proxy.wa0260966.workers.dev/)
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, 'trending');
    if (itRes.data && Array.isArray(itRes.data) && itRes.data.length > 0) {
      const items = itRes.data.map(convertInnerTubeItemToYouTubeItem);
      return res.json({ kind: 'youtube#videoListResponse', items, nextPageToken });
    }
  } catch (err) {
    console.warn('InnerTube trending error:', err);
  }

  // 3. Last-resort Fallback: Invidious (ONLY if InnerTube fails)
  try {
    const { invidiousUrl } = getRequestConfig(req);
    const invFallback = await invidiousFallbackTrending(invidiousUrl, 'JP');
    if (invFallback.items && invFallback.items.length > 0) {
      return res.json({ ...invFallback, nextPageToken });
    }
  } catch {}

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: 'おすすめ動画の取得に失敗しました。再読み込みをお試しください。'
  });
});

// 2. Search API (LuanRT/YouTube.js Primary with Playlists & Pagination + InnerTube Worker Fallback)
app.get('/api/youtube/search', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const {
    q = '',
    pageToken = '',
    maxResults = '40',
    type = 'all'
  } = req.query;

  const searchQuery = String(q || '人気 動画').trim();
  const limitNum = Math.max(24, parseInt(String(maxResults), 10) || 40);

  let pageIndex = 0;
  if (typeof pageToken === 'string' && pageToken.startsWith('page_')) {
    const parsed = parseInt(pageToken.replace('page_', ''), 10);
    if (!isNaN(parsed) && parsed >= 2) {
      pageIndex = parsed - 1;
    }
  }

  // 1. Primary: LuanRT/YouTube.js (supports Videos, Shorts, and Playlists!)
  if (!pageToken || String(pageToken).startsWith('page_')) {
    try {
      const yt = await getInnertubeClient();
      const suffixVariations = ['', ' 人気 公式', ' 最新 おすすめ', ' まとめ 解説'];
      const effectiveQuery =
        pageIndex === 0
          ? searchQuery
          : `${searchQuery}${suffixVariations[pageIndex % suffixVariations.length]}`;

      if (type === 'playlist') {
        const plSearch = await yt.search(effectiveQuery, { type: 'playlist' }).catch(() => null);
        const plItems = plSearch ? extractAllYouTubeJsItems(plSearch).filter((it) => it.isPlaylist) : [];
        if (plItems.length > 0) {
          return res.json({
            kind: 'youtube#searchResponse',
            items: plItems.slice(0, limitNum),
            nextPageToken: `page_${pageIndex + 2}`
          });
        }
      } else {
        // Fetch both main search results AND matching playlists in parallel so playlists always appear in search results
        const [mainSearch, plSearch] = await Promise.all([
          yt.search(effectiveQuery).catch(() => null),
          pageIndex === 0
            ? yt.search(searchQuery, { type: 'playlist' }).catch(() => null)
            : Promise.resolve(null)
        ]);

        const mainItems = mainSearch ? extractAllYouTubeJsItems(mainSearch) : [];
        const plItems = plSearch
          ? extractAllYouTubeJsItems(plSearch).filter((it) => it.isPlaylist).slice(0, 6)
          : [];

        const combined: any[] = [];
        const seen = new Set<string>();
        const pushUnique = (it: any) => {
          if (!it || !it.id || seen.has(it.id)) return;
          if (type === 'video' && it.isPlaylist) return;
          seen.add(it.id);
          combined.push(it);
        };

        // Interleave playlists naturally among search results (e.g., after every 4th video)
        let plIdx = 0;
        for (let i = 0; i < mainItems.length; i++) {
          pushUnique(mainItems[i]);
          if ((i + 1) % 4 === 0 && plIdx < plItems.length) {
            pushUnique(plItems[plIdx++]);
          }
        }
        while (plIdx < plItems.length) {
          pushUnique(plItems[plIdx++]);
        }

        if (combined.length > 0) {
          return res.json({
            kind: 'youtube#searchResponse',
            items: combined.slice(0, limitNum),
            nextPageToken: `page_${pageIndex + 2}`
          });
        }
      }
    } catch (err) {
      console.warn('YouTube.js search error:', err);
    }
  }

  // 2. Fallback: InnerTube Worker (https://proxy.wa0260966.workers.dev/)
  try {
    const queryParams: Record<string, string> = {
      q: searchQuery,
      limit: String(limitNum)
    };
    if (pageToken && typeof pageToken === 'string' && !pageToken.startsWith('page_')) {
      queryParams.continuation = pageToken;
    }

    const itRes = await fetchInnerTubeWorker(innertubeUrl, 'search', queryParams);
    if (itRes.data && Array.isArray(itRes.data.results) && itRes.data.results.length > 0) {
      const items = itRes.data.results.map(convertInnerTubeItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: itRes.data.continuation || null
      });
    }
  } catch (err) {
    console.warn('InnerTube search error:', err);
  }

  // 3. Last-resort Fallback: Invidious (ONLY if InnerTube fails)
  try {
    const { invidiousUrl } = getRequestConfig(req);
    const invFallback = await invidiousFallbackSearch(searchQuery, invidiousUrl, pageIndex + 1);
    if (invFallback.items && invFallback.items.length > 0) {
      return res.json(invFallback);
    }
  } catch {}

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: '検索結果の取得に失敗しました。再読み込みをお試しください。'
  });
});

// 3. Video Categories (Fixed Standard YouTube Categories - Keyless)
app.get('/api/youtube/categories', async (_req, res) => {
  return res.json({
    items: [
      { id: '10', snippet: { title: '音楽' } },
      { id: '20', snippet: { title: 'ゲーム' } },
      { id: '27', snippet: { title: '教育' } },
      { id: '28', snippet: { title: '科学と技術' } },
      { id: '24', snippet: { title: 'エンターテインメント' } },
      { id: '17', snippet: { title: 'スポーツ' } },
      { id: '25', snippet: { title: 'ニュースと政治' } },
      { id: '26', snippet: { title: 'ハウツーとスタイル' } }
    ]
  });
});

// 4. Video Details by ID (LuanRT/YouTube.js Primary + InnerTube Worker + Invidious Fallback)
app.get('/api/youtube/video/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;

  // Pre-warm stream resolution in parallel as soon as video metadata is requested
  if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
    resolveVideoStreams(id, invidiousUrl).catch(() => {});
  }

  // 1. Primary: LuanRT/YouTube.js getInfo
  try {
    const yt = await getInnertubeClient();
    const info = await yt.getInfo(id);
    if (info && (info.primary_info?.title?.text || info.basic_info?.title)) {
      const { videoItem, relatedItems } = convertYouTubeJsVideoInfo(info, id);
      return res.json({
        kind: 'youtube#videoListResponse',
        items: [videoItem],
        relatedItems
      });
    }
  } catch (err) {
    console.warn('YouTube.js video detail error:', err);
  }

  // 2. Fallback: InnerTube Worker
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `videos/${id}`);
    if (itRes.data && (itRes.data.title || itRes.data.videoId)) {
      const recs = itRes.data.recommendedVideos || itRes.data.relatedVideos || itRes.data.related || [];
      const relatedItems = Array.isArray(recs)
        ? recs.filter((r: any) => (r.videoId || r.id) && (r.videoId || r.id) !== id).map(convertInnerTubeItemToYouTubeItem)
        : [];
      return res.json({
        kind: 'youtube#videoListResponse',
        items: [convertInnerTubeItemToYouTubeItem(itRes.data)],
        relatedItems
      });
    }
  } catch (err) {
    console.warn('InnerTube video detail error:', err);
  }

  // 3. Fallback: Invidious
  try {
    const invRes = await fetchInvidious(invidiousUrl, `videos/${id}`);
    if (invRes.data && (invRes.data.title || invRes.data.videoId)) {
      const recs = invRes.data.recommendedVideos || [];
      const relatedItems = Array.isArray(recs)
        ? recs.filter((r: any) => (r.videoId || r.id) && (r.videoId || r.id) !== id).map(convertInvidiousItemToYouTubeItem)
        : [];
      return res.json({
        kind: 'youtube#videoListResponse',
        items: [convertInvidiousItemToYouTubeItem(invRes.data)],
        relatedItems
      });
    }
  } catch {}

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: '動画情報の取得に失敗しました。'
  });
});

// 5. Batch Videos by IDs (LuanRT/YouTube.js + InnerTube Worker Keyless Batch)
app.get('/api/youtube/videos', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { ids } = req.query;
  if (!ids) return res.json({ items: [] });

  const idList = String(ids).split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const yt = await getInnertubeClient().catch(() => null);
    const results = await Promise.all(
      idList.map(async (id) => {
        if (yt) {
          try {
            const info = await yt.getInfo(id);
            if (info && (info.primary_info?.title?.text || info.basic_info?.title)) {
              return convertYouTubeJsVideoInfo(info, id).videoItem;
            }
          } catch {}
        }
        try {
          const itRes = await fetchInnerTubeWorker(innertubeUrl, `videos/${id}`);
          if (itRes.data && (itRes.data.title || itRes.data.videoId)) {
            return convertInnerTubeItemToYouTubeItem(itRes.data);
          }
        } catch {}
        return null;
      })
    );
    return res.json({ items: results.filter(Boolean) });
  } catch {
    return res.json({ items: [] });
  }
});

// 6. Related Videos Endpoint (LuanRT/YouTube.js watch_next_feed + Playlists + Smart Search Enrichment + Pagination)
app.get('/api/youtube/related/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;
  const rawQueryTitle = ((req.query.q as string) || '').trim();
  const pageToken = (req.query.pageToken as string) || '';
  const queryTitle = rawQueryTitle === 'YouTube Video' || rawQueryTitle === 'YouTube Short' ? '' : rawQueryTitle;

  const seenIds = new Set<string>([id]);
  const collectedItems: any[] = [];
  let resolvedTitle = queryTitle;
  let resolvedAuthor = '';

  let pageIndex = 0;
  if (pageToken && pageToken.startsWith('page_')) {
    const parsed = parseInt(pageToken.replace('page_', ''), 10);
    if (!isNaN(parsed) && parsed >= 2) {
      pageIndex = parsed - 1;
    }
  }
  let nextContinuation: string | null = `page_${pageIndex + 2}`;

  // Helper to push unique items (videos and playlists)
  const addUniqueItems = (list: any[]) => {
    for (const item of list) {
      if (!item) continue;
      const vId = typeof item.id === 'string' ? item.id : item.id?.videoId || item.id?.playlistId;
      if (vId && !seenIds.has(vId)) {
        seenIds.add(vId);
        collectedItems.push(item);
      }
    }
  };

  // 1. Primary: LuanRT/YouTube.js watch_next_feed via yt.getInfo(id) on initial load
  if (pageIndex === 0) {
    try {
      const yt = await getInnertubeClient();
      const info = await yt.getInfo(id);
      if (info) {
        const { videoItem, relatedItems } = convertYouTubeJsVideoInfo(info, id);
        if (!resolvedTitle && videoItem.snippet?.title) resolvedTitle = videoItem.snippet.title;
        if (videoItem.snippet?.channelTitle) resolvedAuthor = videoItem.snippet.channelTitle;
        if (relatedItems.length > 0) {
          addUniqueItems(relatedItems);
        }
      }
    } catch (err) {
      console.warn('YouTube.js related error:', err);
    }
  }

  // 2. Always enrich with YouTube.js search + playlist search so there are plenty of related videos AND playlists
  const cleanSearchQuery = (resolvedTitle || resolvedAuthor)
    .replace(/【.*?】|\[.*?\]|\(.*?\)|（.*?）|#\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 45) || resolvedTitle || resolvedAuthor || '人気 動画';

  if (cleanSearchQuery) {
    try {
      const yt = await getInnertubeClient();
      const pageSuffixes = ['', ` ${resolvedAuthor || '人気'}`, ' 人気 おすすめ', ' まとめ 公式'];
      const effectiveSearchQuery =
        pageIndex === 0
          ? cleanSearchQuery
          : `${cleanSearchQuery}${pageSuffixes[pageIndex % pageSuffixes.length]}`.trim();

      const [sRes, plRes] = await Promise.all([
        yt.search(effectiveSearchQuery).catch(() => null),
        pageIndex === 0
          ? yt.search(cleanSearchQuery, { type: 'playlist' }).catch(() => null)
          : Promise.resolve(null)
      ]);

      const sItems = sRes ? extractAllYouTubeJsItems(sRes) : [];
      const plItems = plRes ? extractAllYouTubeJsItems(plRes).filter((it) => it.isPlaylist).slice(0, 4) : [];

      // Interleave playlists into related items
      let plIdx = 0;
      for (let i = 0; i < sItems.length; i++) {
        addUniqueItems([sItems[i]]);
        if ((i + 1) % 5 === 0 && plIdx < plItems.length) {
          addUniqueItems([plItems[plIdx++]]);
        }
      }
      while (plIdx < plItems.length) {
        addUniqueItems([plItems[plIdx++]]);
      }
    } catch {}
  }

  // 3. Fallback / Continuation: InnerTube Worker videos/:id & search
  if (collectedItems.length === 0) {
    if (!pageToken || pageToken.startsWith('page_')) {
      try {
        const itRes = await fetchInnerTubeWorker(innertubeUrl, `videos/${id}`);
        if (itRes.data) {
          if (!resolvedTitle && itRes.data.title) resolvedTitle = itRes.data.title;
          if (itRes.data.author) resolvedAuthor = itRes.data.author;
          const recs = itRes.data.recommendedVideos || itRes.data.relatedVideos || itRes.data.related;
          if (Array.isArray(recs) && recs.length > 0) {
            addUniqueItems(recs.map(convertInnerTubeItemToYouTubeItem));
          }
        }
      } catch (err) {
        console.warn('InnerTube related error:', err);
      }
    }

    if (cleanSearchQuery && collectedItems.length < 15) {
      try {
        const searchParams: Record<string, string> = { q: cleanSearchQuery, limit: '25' };
        if (pageToken && !pageToken.startsWith('page_')) {
          searchParams.continuation = pageToken;
        }
        const searchRes = await fetchInnerTubeWorker(innertubeUrl, 'search', searchParams);
        if (searchRes.data && Array.isArray(searchRes.data.results) && searchRes.data.results.length > 0) {
          const searchItems = searchRes.data.results.map(convertInnerTubeItemToYouTubeItem);
          addUniqueItems(searchItems);
          nextContinuation = searchRes.data.continuation || nextContinuation;
        }
      } catch (err) {
        console.warn('InnerTube smart related search error:', err);
      }
    }
  }

  if (collectedItems.length > 0) {
    return res.json({
      kind: 'youtube#searchResponse',
      items: collectedItems,
      nextPageToken: nextContinuation
    });
  }

  // 4. Invidious fallback for related videos
  try {
    const invRes = await fetchInvidious(invidiousUrl, `videos/${id}`);
    if (invRes.data && Array.isArray(invRes.data.recommendedVideos) && invRes.data.recommendedVideos.length > 0) {
      addUniqueItems(invRes.data.recommendedVideos.map(convertInvidiousItemToYouTubeItem));
      if (collectedItems.length > 0) {
        return res.json({
          kind: 'youtube#searchResponse',
          items: collectedItems,
          nextPageToken: nextContinuation
        });
      }
    }
  } catch (err) {
    console.warn('Invidious related error:', err);
  }

  // 5. Final fallback: Trending videos so the related sidebar is never blank
  try {
    const trendRes = await fetchInnerTubeWorker(innertubeUrl, 'trending');
    if (trendRes.data && Array.isArray(trendRes.data) && trendRes.data.length > 0) {
      addUniqueItems(trendRes.data.map(convertInnerTubeItemToYouTubeItem));
      return res.json({
        kind: 'youtube#searchResponse',
        items: collectedItems,
        nextPageToken: null
      });
    }
  } catch {}

  return res.json({
    items: [],
    nextPageToken: null
  });
});

// 7. Video Comments & Live Chat (LuanRT/YouTube.js Primary + InnerTube Worker LiveChat/Comments Fallback)
app.get('/api/youtube/comments/:id', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { id } = req.params;
  const { pageToken, maxResults = '20', order = 'relevance', live } = req.query;
  const tokenStr = pageToken ? String(pageToken) : '';
  const isLiveRequest =
    live === '1' ||
    live === 'true' ||
    tokenStr.startsWith('livechat:') ||
    tokenStr.startsWith('livechat_replay:');

  // 1. Primary: LuanRT/YouTube.js getComments (for non-live standard video comments)
  if (!tokenStr && !isLiveRequest) {
    try {
      const yt = await getInnertubeClient();
      const sortBy = order === 'time' ? 'NEWEST_FIRST' : 'TOP_COMMENTS';
      const commentsRes = await yt.getComments(id, sortBy);
      const converted = convertYouTubeJsComments(commentsRes, id);
      if (converted.items.length > 0) {
        return res.json(converted);
      }
    } catch (err) {
      console.warn('YouTube.js comments error:', err);
    }
  }

  // 2. InnerTube Worker (https://proxy.wa0260966.workers.dev/ + built-in InnerTube LiveChat support)
  try {
    const itParams: Record<string, string> = { limit: String(maxResults) };
    if (tokenStr) itParams.continuation = tokenStr;
    if (isLiveRequest) itParams.mode = 'live';
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `comments/${id}`, itParams);
    if (itRes.data && Array.isArray(itRes.data.comments) && (itRes.data.comments.length > 0 || itRes.data.isLiveChat)) {
      return res.json(convertInvidiousCommentsToYouTube(itRes.data, id));
    }
  } catch (err) {
    console.warn('InnerTube comments error:', err);
  }

  // 3. Last-resort Fallback: Invidious (ONLY if InnerTube fails)
  if (!isLiveRequest) {
    try {
      const { invidiousUrl } = getRequestConfig(req);
      const invParams: Record<string, string> = {};
      if (tokenStr) invParams.continuation = tokenStr;
      const invRes = await fetchInvidious(invidiousUrl, `comments/${id}`, invParams);
      if (invRes.data && Array.isArray(invRes.data.comments) && invRes.data.comments.length > 0) {
        return res.json(convertInvidiousCommentsToYouTube(invRes.data, id));
      }
    } catch {}
  }

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: 'コメントの取得に失敗しました。再読み込みをお試しください。'
  });
});

// 7b. Comment Replies (InnerTube Worker & Invidious Fallback)
app.get('/api/youtube/comments/replies/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;
  const { pageToken, maxResults = '20' } = req.query;

  // 1. Try InnerTube Worker
  try {
    const itParams: Record<string, string> = { limit: String(maxResults) };
    if (pageToken) itParams.continuation = String(pageToken);
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `comments/replies/${id}`, itParams);
    if (itRes.data && Array.isArray(itRes.data.comments) && itRes.data.comments.length > 0) {
      const items = itRes.data.comments.map((c: any) => convertSingleInvidiousComment(c));
      return res.json({ items, nextPageToken: itRes.data.continuation || null });
    }
  } catch (err) {}

  // 2. Fallback: Invidious
  if (pageToken) {
    try {
      const invRes = await fetchInvidious(invidiousUrl, `comments/${id}`, { continuation: String(pageToken) });
      if (invRes.data && Array.isArray(invRes.data.comments) && invRes.data.comments.length > 0) {
        const items = invRes.data.comments.map((c: any) => convertSingleInvidiousComment(c));
        return res.json({ items, nextPageToken: invRes.data.continuation || null });
      }
    } catch {}
  }

  return res.json({ items: [], nextPageToken: null });
});

// 8. Channel Details (LuanRT/YouTube.js Primary + InnerTube Worker Fallback)
app.get('/api/youtube/channel/:id', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { id } = req.params;

  // 1. Primary: LuanRT/YouTube.js getChannel
  try {
    const yt = await getInnertubeClient();
    const ch = await yt.getChannel(id);
    if (ch && ch.metadata) {
      const avatarUrl =
        ch.metadata.avatar?.[0]?.url ||
        ch.metadata.thumbnail?.[0]?.url ||
        '';
      const bannerUrl =
        (ch.header as any)?.content?.banner?.image?.[0]?.url ||
        (ch.header as any)?.banner?.[0]?.url ||
        '';
      return res.json({
        items: [
          {
            kind: 'youtube#channel',
            id: ch.metadata.external_id || id,
            snippet: {
              title: ch.metadata.title || 'YouTube チャンネル',
              description: ch.metadata.description || '',
              customUrl: ch.metadata.vanity_channel_url || '',
              publishedAt: new Date().toISOString(),
              thumbnails: {
                high: { url: avatarUrl },
                medium: { url: avatarUrl },
                default: { url: avatarUrl }
              }
            },
            statistics: {
              subscriberCount: '0',
              videoCount: '0',
              viewCount: '0'
            },
            brandingSettings: {
              image: {
                bannerExternalUrl: bannerUrl
              }
            }
          }
        ]
      });
    }
  } catch (err) {
    console.warn('YouTube.js channel detail error:', err);
  }

  // 2. Fallback: InnerTube Worker (https://proxy.wa0260966.workers.dev/)
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}`);
    if (itRes.data && (itRes.data.authorId || itRes.data.author)) {
      return res.json({ items: [convertInnerTubeChannelToYouTubeChannel(itRes.data)] });
    }
  } catch (err) {
    console.warn('InnerTube channel detail error:', err);
  }

  // 3. Last-resort Fallback: Invidious (ONLY if InnerTube fails)
  try {
    const { invidiousUrl } = getRequestConfig(req);
    const invRes = await fetchInvidious(invidiousUrl, `channels/${id}`);
    if (invRes.data && (invRes.data.authorId || invRes.data.author)) {
      return res.json({ items: [convertInvidiousChannelToYouTubeChannel(invRes.data)] });
    }
  } catch {}

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: 'チャンネル情報の取得に失敗しました。再読み込みをお試しください。'
  });
});

// 8b. Channel Uploaded Videos Endpoint (LuanRT/YouTube.js Multi-Page ch.getVideos() + Complete UU Uploads Playlist + Continuation)
const channelVideoContinuationStore = new Map<
  string,
  {
    chVidsPage: any | null;
    uuPlPage: any | null;
    fallbackCh: { id: string; name: string; avatar: string };
    seenIds: Set<string>;
    updatedAt: number;
  }
>();

app.get('/api/youtube/channel/videos/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;
  const { pageToken, page = '1' } = req.query;

  // 1. Primary: LuanRT/YouTube.js channel.getVideos() + UU Uploads Playlist (multi-page comprehensive fetch)
  try {
    const yt = await getInnertubeClient();
    const tokenStr = typeof pageToken === 'string' ? pageToken : '';

    // Continuation batch from stored state
    if (tokenStr.startsWith('ytjs_cont_') && channelVideoContinuationStore.has(tokenStr)) {
      const state = channelVideoContinuationStore.get(tokenStr)!;
      channelVideoContinuationStore.delete(tokenStr);

      const batchMap = new Map<string, any>();
      const addItem = (item: any) => {
        if (!item) return;
        const vidId = typeof item.id === 'string' ? item.id : item.id?.videoId;
        if (!vidId || state.seenIds.has(vidId)) return;
        const existing = batchMap.get(vidId);
        if (!existing || (existing.statistics?.viewCount === '0' && item.statistics?.viewCount !== '0')) {
          batchMap.set(vidId, item);
        }
      };

      let curChVids = state.chVidsPage;
      for (let i = 0; i < 4 && curChVids?.has_continuation; i++) {
        try {
          curChVids = await curChVids.getContinuation();
          const extracted = extractAllYouTubeJsItems(curChVids, {
            fallbackChannel: state.fallbackCh,
            includePlaylists: false
          });
          extracted.forEach(addItem);
        } catch {
          curChVids = null;
          break;
        }
      }

      let curUuPl = state.uuPlPage;
      for (let i = 0; i < 4 && curUuPl?.has_continuation; i++) {
        try {
          curUuPl = await curUuPl.getContinuation();
          const extracted = extractAllYouTubeJsItems(curUuPl, {
            fallbackChannel: state.fallbackCh,
            includePlaylists: false
          });
          extracted.forEach(addItem);
        } catch {
          curUuPl = null;
          break;
        }
      }

      const items = Array.from(batchMap.values());
      items.forEach((it) => {
        const vidId = typeof it.id === 'string' ? it.id : it.id?.videoId;
        if (vidId) state.seenIds.add(vidId);
      });

      let nextContToken: string | null = null;
      if ((curChVids && curChVids.has_continuation) || (curUuPl && curUuPl.has_continuation)) {
        nextContToken = `ytjs_cont_${id}_${Date.now()}`;
        channelVideoContinuationStore.set(nextContToken, {
          chVidsPage: curChVids,
          uuPlPage: curUuPl,
          fallbackCh: state.fallbackCh,
          seenIds: state.seenIds,
          updatedAt: Date.now()
        });
      }

      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: nextContToken
      });
    }

    if (!tokenStr) {
      const ch = await yt.getChannel(id);
      const fallbackCh = {
        id,
        name: ch.metadata?.title || '',
        avatar: ch.metadata?.avatar?.[0]?.url || ''
      };

      const mergedMap = new Map<string, any>();
      const addOrMergeItem = (item: any) => {
        if (!item || item.isPlaylist) return;
        const vidId = typeof item.id === 'string' ? item.id : item.id?.videoId;
        if (!vidId) return;
        const existing = mergedMap.get(vidId);
        if (!existing) {
          mergedMap.set(vidId, item);
        } else {
          // Prefer richer metadata (viewCount > 0)
          const exViews = parseInt(existing.statistics?.viewCount || '0', 10);
          const newViews = parseInt(item.statistics?.viewCount || '0', 10);
          if (newViews > exViews) {
            mergedMap.set(vidId, item);
          }
        }
      };

      // Run both ch.getVideos() (with continuations) and UU uploads playlist (with continuations) in parallel
      const uploadsPlaylistId = id.startsWith('UC') ? 'UU' + id.slice(2) : '';

      const [chVidsResult, uuPlResult] = await Promise.all([
        (async () => {
          try {
            let cur: any = await ch.getVideos();
            extractAllYouTubeJsItems(cur, { fallbackChannel: fallbackCh, includePlaylists: false }).forEach(
              addOrMergeItem
            );
            for (let p = 0; p < 4 && cur?.has_continuation; p++) {
              try {
                cur = await cur.getContinuation();
                extractAllYouTubeJsItems(cur, { fallbackChannel: fallbackCh, includePlaylists: false }).forEach(
                  addOrMergeItem
                );
              } catch {
                break;
              }
            }
            return cur;
          } catch {
            return null;
          }
        })(),
        (async () => {
          if (!uploadsPlaylistId) return null;
          try {
            let curPl: any = await yt.getPlaylist(uploadsPlaylistId);
            extractAllYouTubeJsItems(curPl, { fallbackChannel: fallbackCh, includePlaylists: false }).forEach(
              addOrMergeItem
            );
            for (let p = 0; p < 4 && curPl?.has_continuation; p++) {
              try {
                curPl = await curPl.getContinuation();
                extractAllYouTubeJsItems(curPl, { fallbackChannel: fallbackCh, includePlaylists: false }).forEach(
                  addOrMergeItem
                );
              } catch {
                break;
              }
            }
            return curPl;
          } catch {
            return null;
          }
        })()
      ]);

      // Also include Shorts tab items if available so no short videos are missed
      if (ch.has_shorts) {
        try {
          const shTab = await ch.getShorts();
          extractAllYouTubeJsItems(shTab, { fallbackChannel: fallbackCh, includePlaylists: false }).forEach(
            addOrMergeItem
          );
        } catch {}
      }

      const items = Array.from(mergedMap.values());
      if (items.length > 0) {
        let nextContToken: string | null = null;
        if ((chVidsResult && chVidsResult.has_continuation) || (uuPlResult && uuPlResult.has_continuation)) {
          nextContToken = `ytjs_cont_${id}_${Date.now()}`;
          channelVideoContinuationStore.set(nextContToken, {
            chVidsPage: chVidsResult,
            uuPlPage: uuPlResult,
            fallbackCh,
            seenIds: new Set(items.map((it) => (typeof it.id === 'string' ? it.id : it.id?.videoId)).filter(Boolean)),
            updatedAt: Date.now()
          });
        }

        return res.json({
          kind: 'youtube#searchResponse',
          items,
          nextPageToken: nextContToken
        });
      }
    }
  } catch (err) {
    console.warn('YouTube.js channel videos error:', err);
  }

  // 2. Fallback: InnerTube Worker channels/:id/videos (https://proxy.wa0260966.workers.dev/)
  try {
    const queryParams: Record<string, string> = {};
    if (pageToken && typeof pageToken === 'string') {
      queryParams.continuation = pageToken;
    }
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}/videos`, queryParams);
    if (itRes.data && Array.isArray(itRes.data.videos) && itRes.data.videos.length > 0) {
      const items = itRes.data.videos.map(convertInnerTubeItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: itRes.data.continuation || null
      });
    }
  } catch (err) {
    console.warn('InnerTube channel videos error:', err);
  }

  // 3. Try uploads playlist via InnerTube Worker (replace UC with UU) BEFORE Invidious
  if (id.startsWith('UC')) {
    const uploadsPlaylistId = 'UU' + id.slice(2);
    try {
      const itPlRes = await fetchInnerTubeWorker(innertubeUrl, `playlists/${uploadsPlaylistId}`);
      if (itPlRes.data && Array.isArray(itPlRes.data.videos) && itPlRes.data.videos.length > 0) {
        const items = itPlRes.data.videos.map(convertInnerTubeItemToYouTubeItem);
        return res.json({
          kind: 'youtube#searchResponse',
          items,
          nextPageToken: null
        });
      }
    } catch (err) {}
  }

  // 4. Last-resort Fallback: Invidious channels/:id/videos (ONLY if all InnerTube methods fail)
  try {
    const invQueryParams: Record<string, string> = {};
    if (pageToken && typeof pageToken === 'string') {
      invQueryParams.continuation = pageToken;
    } else if (page) {
      invQueryParams.page = String(page);
    }
    const invRes = await fetchInvidious(invidiousUrl, `channels/${id}/videos`, invQueryParams);
    if (invRes.data && (Array.isArray(invRes.data.videos) || Array.isArray(invRes.data))) {
      const vList = Array.isArray(invRes.data.videos) ? invRes.data.videos : invRes.data;
      const items = vList.map(convertInvidiousItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: invRes.data.continuation || null
      });
    }
  } catch (err) {
    console.warn('Invidious channel videos error:', err);
  }

  return res.json({
    items: [],
    nextPageToken: null
  });
});

// 8c. YouTube Shorts API Endpoint (LuanRT/YouTube.js Multi-Query Feed + Pagination + XeroxYT-NTv6 Architecture)
app.get('/api/youtube/shorts', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { q = '#Shorts', maxResults = '30', pageToken = '' } = req.query;

  const pageNum = pageToken && String(pageToken).startsWith('page_')
    ? parseInt(String(pageToken).replace('page_', ''), 10) || 1
    : 1;

  const searchQuery = String(q || '#Shorts').trim();
  const isDefaultShorts = !searchQuery || searchQuery.toLowerCase() === '#shorts' || searchQuery.toLowerCase() === 'shorts';

  const defaultShortsQueries = [
    '#Shorts 日本 人気',
    '#Shorts 面白い バズった',
    '#Shorts 音楽 ダンス 話題',
    '#Shorts 猫 犬 動物 かわいい',
    '#Shorts 料理 レシピ グルメ',
    '#Shorts ゲーム 実況 神プレイ',
    '#Shorts 雑学 豆知識 解説',
    '#Shorts アニメ 切り抜き 人気'
  ];

  // 1. Primary: LuanRT/YouTube.js search
  try {
    const yt = await getInnertubeClient();
    let queriesToRun: string[] = [];
    if (isDefaultShorts) {
      const startIdx = ((pageNum - 1) * 2) % defaultShortsQueries.length;
      queriesToRun = [
        defaultShortsQueries[startIdx],
        defaultShortsQueries[(startIdx + 1) % defaultShortsQueries.length]
      ];
    } else {
      const baseQ =
        searchQuery.includes('#') || searchQuery.toLowerCase().includes('short')
          ? searchQuery
          : `${searchQuery} #shorts`;
      queriesToRun = pageNum === 1 ? [baseQ, `${searchQuery} ショート動画`] : [`${baseQ} 人気 ${pageNum}`];
    }

    const searchResList = await Promise.allSettled(
      queriesToRun.map((qStr) => yt.search(qStr))
    );

    const seenIds = new Set<string>();
    const items: any[] = [];

    for (const r of searchResList) {
      if (r.status === 'fulfilled' && r.value) {
        const extracted = extractAllYouTubeJsItems(r.value, { includePlaylists: false });
        for (const it of extracted) {
          const vid = typeof it.id === 'string' ? it.id : it.id?.videoId;
          if (!vid || seenIds.has(vid) || it.isPlaylist) continue;
          // Ensure duration isn't a long video (> 3 mins)
          const dur = it.contentDetails?.duration || '';
          const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          if (m) {
            const totalSec = (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + parseInt(m[3] || '0', 10);
            if (totalSec > 185) continue;
          }
          it.isShort = true;
          if (!it.contentDetails?.duration || it.contentDetails.duration === 'PT0M0S') {
            it.contentDetails = { ...it.contentDetails, duration: 'PT0M59S' };
          }
          seenIds.add(vid);
          items.push(it);
        }
      }
    }

    if (items.length > 0) {
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: `page_${pageNum + 1}`
      });
    }
  } catch (err) {
    console.warn('YouTube.js shorts search error:', err);
  }

  // 2. Fallback: InnerTube Worker
  const effectiveQuery =
    searchQuery.includes('#') || searchQuery.toLowerCase().includes('short')
      ? searchQuery
      : `${searchQuery} #shorts`;
  try {
    const queryParams: Record<string, string> = {
      q: effectiveQuery,
      limit: String(maxResults)
    };
    if (pageToken && typeof pageToken === 'string' && !pageToken.startsWith('page_')) {
      queryParams.continuation = pageToken;
    }
    const itRes = await fetchInnerTubeWorker(innertubeUrl, 'search', queryParams);
    if (itRes.data && Array.isArray(itRes.data.results) && itRes.data.results.length > 0) {
      const items = itRes.data.results.map((raw: any) => {
        const converted = convertInnerTubeItemToYouTubeItem(raw);
        converted.isShort = true;
        return converted;
      });
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: itRes.data.continuation || `page_${pageNum + 1}`
      });
    }
  } catch (err) {
    console.warn('InnerTube shorts search error:', err);
  }

  // 3. Fallback to trending
  try {
    const trendRes = await fetchInnerTubeWorker(innertubeUrl, 'trending');
    if (trendRes.data && Array.isArray(trendRes.data)) {
      const items = trendRes.data.map(convertInnerTubeItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: null
      });
    }
  } catch {}

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: 'Shortsの取得に失敗しました。再読み込みをお試しください。'
  });
});

// 8c2. Channel Dedicated Shorts Endpoint (LuanRT/YouTube.js channel.getShorts() Primary + XeroxYT-NTv6 Fallbacks)
app.get(['/api/youtube/channel/shorts/:id', '/api/channel/:id/tab/shorts'], async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;
  const channelTitle = (req.query.title as string) || '';

  // 1. Primary: LuanRT/YouTube.js channel.getShorts()
  try {
    const yt = await getInnertubeClient();
    const ch = await yt.getChannel(id);
    const sh = await ch.getShorts();
    const fallbackCh = {
      id,
      name: ch.metadata?.title || channelTitle,
      avatar: ch.metadata?.avatar?.[0]?.url || ''
    };
    const items = extractAllYouTubeJsItems(sh, { fallbackChannel: fallbackCh, includePlaylists: false }).map((it: any) => ({
      ...it,
      isShort: true
    }));
    if (items.length > 0) {
      return res.json({ items, nextPageToken: null });
    }
  } catch (err) {
    console.warn('YouTube.js channel shorts error:', err);
  }

  // 2. Try InnerTube Worker channel shorts
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}/shorts`);
    if (itRes.data && Array.isArray(itRes.data.videos) && itRes.data.videos.length > 0) {
      const items = itRes.data.videos.map(convertInnerTubeItemToYouTubeItem);
      return res.json({ items, nextPageToken: itRes.data.continuation || null });
    }
    if (itRes.data && Array.isArray(itRes.data) && itRes.data.length > 0) {
      const items = itRes.data.map(convertInnerTubeItemToYouTubeItem);
      return res.json({ items, nextPageToken: null });
    }
  } catch (err) {}

  // 3. Try XeroxYT style fallback: Search `${channelTitle} #shorts`
  try {
    const searchQuery = channelTitle ? `${channelTitle} #shorts` : `#shorts`;
    const searchRes = await fetchInnerTubeWorker(innertubeUrl, 'search', { q: searchQuery, limit: '30' });
    if (searchRes.data && Array.isArray(searchRes.data.results) && searchRes.data.results.length > 0) {
      const items = searchRes.data.results
        .map(convertInnerTubeItemToYouTubeItem)
        .filter((v: any) => {
          const title = (v.snippet?.title || '').toLowerCase();
          const ch = (v.snippet?.channelTitle || '').toLowerCase();
          const target = channelTitle.toLowerCase();
          if (target && !ch.includes(target) && !target.includes(ch)) return false;
          return title.includes('short') || title.includes('#') || v.isShort;
        });

      if (items.length > 0) {
        return res.json({ items, nextPageToken: null });
      }
    }
  } catch (err) {}

  // 4. Fallback to Invidious channel videos filtered by shorts criteria
  try {
    const invRes = await fetchInvidious(invidiousUrl, `channels/videos/${id}`);
    if (invRes.data && Array.isArray(invRes.data)) {
      const items = invRes.data
        .map(convertInvidiousItemToYouTubeItem)
        .filter((v: any) => {
          const t = (v.snippet?.title || '').toLowerCase();
          return t.includes('short') || t.includes('#shorts') || (v.lengthSeconds && v.lengthSeconds <= 65);
        });
      return res.json({ items, nextPageToken: null });
    }
  } catch (err) {}

  return res.json({ items: [], nextPageToken: null });
});

// 8d. YouTube Playlist Endpoint (LuanRT/YouTube.js Primary + ==== Concatenated Channel IDs Combined Timeline + Mix/RD Support)
app.get('/api/youtube/playlist/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;
  const seedVideoId = String(req.query.videoId || '').trim();

  // 0. Handle ==== concatenated channel IDs (e.g. UCxxx====UCyyy====UCzzz) -> Fetch UUxxx uploads in parallel & merge sorted by newest
  if (id.includes('====')) {
    const channelIds = Array.from(
      new Set(
        id
          .split('====')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    ).slice(0, 25);

    try {
      const yt = await getInnertubeClient();
      const perChannelResults = await Promise.all(
        channelIds.map(async (cid) => {
          // Convert UCxxx -> UUxxx uploads playlist ID (na8526130-cell/youtube pattern)
          const uploadsPlaylistId = cid.startsWith('UC') ? 'UU' + cid.slice(2) : cid;
          try {
            const pl = await yt.getPlaylist(uploadsPlaylistId);
            const items = extractAllYouTubeJsItems(pl, {
              fallbackChannel: { id: cid, name: pl.info?.author?.name || '' },
              includePlaylists: false
            });
            if (items.length > 0) return items.slice(0, 15);
          } catch {}

          // Fallback to yt.getChannel(cid).getVideos()
          try {
            const ch = await yt.getChannel(cid);
            const vids = await ch.getVideos();
            const fallbackCh = {
              id: cid,
              name: ch.metadata?.title || '',
              avatar: ch.metadata?.avatar?.[0]?.url || ''
            };
            const items = extractAllYouTubeJsItems(vids, {
              fallbackChannel: fallbackCh,
              includePlaylists: false
            });
            if (items.length > 0) return items.slice(0, 15);
          } catch {}

          return [];
        })
      );

      const mergedMap = new Map<string, any>();
      for (const list of perChannelResults) {
        for (const v of list) {
          const vId = typeof v.id === 'string' ? v.id : v.id?.videoId;
          if (vId && !mergedMap.has(vId)) {
            mergedMap.set(vId, v);
          }
        }
      }

      // Helper to convert relative or ISO publishedAt to comparable timestamp
      const toPublishedTimestamp = (raw?: string): number => {
        if (!raw) return 0;
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) return parsed;
        const now = Date.now();
        const num = parseFloat(raw.replace(/[^0-9.]/g, '')) || 1;
        if (raw.includes('秒') || raw.toLowerCase().includes('sec')) return now - num * 1000;
        if (raw.includes('分') || raw.toLowerCase().includes('min')) return now - num * 60 * 1000;
        if (raw.includes('時間') || raw.toLowerCase().includes('hour')) return now - num * 3600 * 1000;
        if (raw.includes('日') || raw.toLowerCase().includes('day')) return now - num * 86400 * 1000;
        if (raw.includes('週間') || raw.toLowerCase().includes('week')) return now - num * 7 * 86400 * 1000;
        if (raw.includes('か月') || raw.includes('ヶ月') || raw.toLowerCase().includes('month')) return now - num * 30 * 86400 * 1000;
        if (raw.includes('年') || raw.toLowerCase().includes('year')) return now - num * 365 * 86400 * 1000;
        return 0;
      };

      const sortedItems = Array.from(mergedMap.values()).sort(
        (a, b) => toPublishedTimestamp(b.snippet?.publishedAt) - toPublishedTimestamp(a.snippet?.publishedAt)
      );

      return res.json({
        playlist: {
          id,
          snippet: {
            title: `登録チャンネル合同タイムライン (${channelIds.length}ch 新しい順)`,
            description: '全登録チャンネルのアップロード動画 (UUxxx) を並列取得・投稿日時順に統合した合同リスト',
            channelTitle: '登録チャンネル合同タイムライン'
          }
        },
        items: sortedItems,
        nextPageToken: null
      });
    } catch (err) {
      console.warn('Combined ==== timeline error:', err);
    }
  }

  // 1. Primary: LuanRT/YouTube.js getPlaylist or /next for Mix (RD...) playlists
  try {
    const yt = await getInnertubeClient();

    // Handle Mix / Radio playlists (RD...) via /next endpoint
    if (id.startsWith('RD')) {
      const inferredVid = seedVideoId || (id.length === 13 ? id.slice(2) : '');
      const nextPayload: Record<string, any> = { playlistId: id };
      if (inferredVid && /^[a-zA-Z0-9_-]{11}$/.test(inferredVid)) {
        nextPayload.videoId = inferredVid;
      }
      const nextRes: any = await yt.actions.execute('/next', nextPayload);
      const playlistPanel =
        nextRes?.data?.contents?.twoColumnWatchNextResults?.playlist?.playlist ||
        nextRes?.data?.contents?.singleColumnWatchNextResults?.playlist?.playlist;
      if (playlistPanel && Array.isArray(playlistPanel.contents)) {
        const items = playlistPanel.contents
          .map((entry: any) => {
            const r = entry.playlistPanelVideoRenderer || entry;
            const vid = r.videoId;
            if (!vid) return null;
            const title = r.title?.simpleText || r.title?.runs?.map((x: any) => x.text).join('') || '';
            const channelTitle = r.longBylineText?.runs?.[0]?.text || r.shortBylineText?.runs?.[0]?.text || '';
            const channelId = r.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
            const durationText = r.lengthText?.simpleText || '0:00';
            return convertInnerTubeItemToYouTubeItem({
              id: vid,
              title,
              channelTitle,
              channelId,
              duration: durationText,
              thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
            });
          })
          .filter(Boolean);

        if (items.length > 0) {
          return res.json({
            playlist: {
              id,
              snippet: {
                title: playlistPanel.title || 'ミックスリスト',
                description: '',
                channelTitle: 'YouTube Mix'
              }
            },
            items,
            nextPageToken: null
          });
        }
      }
    }

    let curPl: any = await yt.getPlaylist(id);
    const items = [...extractAllYouTubeJsItems(curPl, { includePlaylists: false })];
    const seenPlVids = new Set<string>(
      items.map((it) => (typeof it.id === 'string' ? it.id : it.id?.videoId)).filter(Boolean)
    );
    const plHeaderTitle = curPl.info?.title || '再生リスト';
    const plHeaderDesc = curPl.info?.description || '';
    const plHeaderAuthor = curPl.info?.author?.name || '';

    for (let p = 0; p < 3 && curPl?.has_continuation; p++) {
      try {
        curPl = await curPl.getContinuation();
        const more = extractAllYouTubeJsItems(curPl, { includePlaylists: false });
        for (const m of more) {
          const vId = typeof m.id === 'string' ? m.id : m.id?.videoId;
          if (vId && !seenPlVids.has(vId)) {
            seenPlVids.add(vId);
            items.push(m);
          }
        }
      } catch {
        break;
      }
    }

    if (items.length > 0) {
      return res.json({
        playlist: {
          id,
          snippet: {
            title: plHeaderTitle,
            description: plHeaderDesc,
            channelTitle: plHeaderAuthor
          }
        },
        items,
        nextPageToken: null
      });
    }
  } catch (err) {
    console.warn('YouTube.js playlist error:', err);
  }

  // 2. Try InnerTube Worker
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `playlists/${id}`);
    if (itRes.data && Array.isArray(itRes.data.videos) && itRes.data.videos.length > 0) {
      const items = itRes.data.videos.map(convertInnerTubeItemToYouTubeItem);
      return res.json({
        playlist: {
          id,
          snippet: {
            title: itRes.data.title || '再生リスト',
            description: itRes.data.description || '',
            channelTitle: itRes.data.author || ''
          }
        },
        items,
        nextPageToken: null
      });
    }
  } catch (err) {
    console.warn('InnerTube playlist error:', err);
  }

  // 3. Try Invidious playlists/:id
  try {
    const invRes = await fetchInvidious(invidiousUrl, `playlists/${id}`);
    if (invRes.data && Array.isArray(invRes.data.videos)) {
      const items = invRes.data.videos.map(convertInvidiousItemToYouTubeItem);
      return res.json({
        playlist: {
          id,
          snippet: {
            title: invRes.data.title || '再生リスト',
            description: invRes.data.description || '',
            channelTitle: invRes.data.author || ''
          }
        },
        items,
        nextPageToken: null
      });
    }
  } catch (err) {
    console.warn('Invidious playlist error:', err);
  }

  return res.json({
    playlist: null,
    items: [],
    nextPageToken: null,
    error: 'PLAYLIST_NOT_FOUND',
    message: '再生リストの取得に失敗しました。'
  });
});

// 8e. Search Suggestions Endpoint (Google Suggest / YouTube autocomplete API)
app.get('/api/youtube/suggest', async (req, res) => {
  const { q = '' } = req.query;
  const trimmed = String(q).trim();
  if (!trimmed) {
    return res.json([]);
  }

  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=ja&q=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && Array.isArray(data[1])) {
        return res.json(data[1]);
      }
      return res.json(data);
    }
  } catch (err) {
    console.warn('Suggest fetch error:', err);
  }

  return res.json([]);
});

// 8f. Channel Playlists Endpoint (LuanRT/YouTube.js Primary + Releases + Fallbacks)
app.get('/api/youtube/channel/playlists/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;

  // 1. Primary: LuanRT/YouTube.js channel.getPlaylists() + channel.getReleases()
  try {
    const yt = await getInnertubeClient();
    const ch = await yt.getChannel(id);
    const fallbackCh = {
      id,
      name: ch.metadata?.title || '',
      avatar: ch.metadata?.avatar?.[0]?.url || ''
    };

    const allExtracted: any[] = [];
    const seenPlIds = new Set<string>();

    const collectPlaylists = (tabObj: any) => {
      if (!tabObj) return;
      const extracted = extractAllYouTubeJsItems(tabObj, { fallbackChannel: fallbackCh, includePlaylists: true });
      for (const it of extracted) {
        if (!it.isPlaylist && !it.playlistId) continue;
        const plId = it.playlistId || (typeof it.id === 'string' ? it.id : it.id?.playlistId);
        if (!plId || seenPlIds.has(plId)) continue;
        seenPlIds.add(plId);
        allExtracted.push({
          ...it,
          id: plId,
          playlistId: plId,
          isPlaylist: true,
          title: it.snippet?.title || '再生リスト',
          thumbnail: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.medium?.url || '',
          videoCount: it.contentDetails?.itemCount || 0
        });
      }
    };

    if (ch.has_playlists) {
      try {
        const plTab = await ch.getPlaylists();
        collectPlaylists(plTab);
      } catch (e) {
        console.warn('ch.getPlaylists() error:', e);
      }
    }

    if (ch.has_releases) {
      try {
        const relTab = await ch.getReleases();
        collectPlaylists(relTab);
      } catch (e) {
        console.warn('ch.getReleases() error:', e);
      }
    }

    // If neither flag was set or returned 0, still try getPlaylists() directly
    if (allExtracted.length === 0 && !ch.has_playlists) {
      try {
        const plTab = await ch.getPlaylists();
        collectPlaylists(plTab);
      } catch {}
    }

    if (allExtracted.length > 0) {
      return res.json({ items: allExtracted, nextPageToken: null });
    }
  } catch (err) {
    console.warn('YouTube.js channel playlists error:', err);
  }

  // 2. Try InnerTube Worker
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}/playlists`);
    if (itRes.data && Array.isArray(itRes.data.playlists) && itRes.data.playlists.length > 0) {
      const items = itRes.data.playlists.map((pl: any) => ({
        id: pl.playlistId || pl.id,
        playlistId: pl.playlistId || pl.id,
        isPlaylist: true,
        title: pl.title,
        thumbnail: pl.thumbnail || pl.thumbnails?.[0]?.url,
        videoCount: pl.videoCount || pl.itemCount || 0,
        snippet: {
          title: pl.title,
          thumbnails: {
            high: { url: pl.thumbnail || pl.thumbnails?.[0]?.url || '' },
            medium: { url: pl.thumbnail || pl.thumbnails?.[0]?.url || '' }
          }
        },
        contentDetails: {
          itemCount: pl.videoCount || pl.itemCount || 0
        }
      }));
      return res.json({ items, nextPageToken: null });
    }
  } catch (err) {}

  // 3. Try Invidious (both channels/:id/playlists and channels/playlists/:id)
  for (const endpoint of [`channels/${id}/playlists`, `channels/playlists/${id}`]) {
    try {
      const invRes = await fetchInvidious(invidiousUrl, endpoint);
      if (invRes.data && Array.isArray(invRes.data.playlists) && invRes.data.playlists.length > 0) {
        const items = invRes.data.playlists.map((pl: any) => ({
          id: pl.playlistId || pl.id,
          playlistId: pl.playlistId || pl.id,
          isPlaylist: true,
          title: pl.title,
          thumbnail: pl.playlistThumbnail,
          videoCount: pl.videoCount || 0,
          snippet: {
            title: pl.title,
            thumbnails: {
              high: { url: pl.playlistThumbnail || '' },
              medium: { url: pl.playlistThumbnail || '' }
            }
          },
          contentDetails: {
            itemCount: pl.videoCount || 0
          }
        }));
        return res.json({ items, nextPageToken: null });
      }
    } catch (err) {}
  }

  return res.json({ items: [], nextPageToken: null });
});

// 8g. Channel Community Posts Endpoint
app.get('/api/youtube/channel/community/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;

  // 1. Try InnerTube
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}/community`);
    if (itRes.data && Array.isArray(itRes.data.posts) && itRes.data.posts.length > 0) {
      const items = itRes.data.posts.map((post: any) => ({
        id: post.postId || post.id,
        contentText: post.text || post.contentText || '',
        publishedTimeText: post.publishedTimeText || post.published || '',
        attachmentImage: post.attachmentImage || post.image || null,
        voteCount: post.voteCount || post.likes || 0,
        replyCount: post.replyCount || 0
      }));
      return res.json({ items });
    }
  } catch (err) {}

  // 2. Try Invidious
  try {
    const invRes = await fetchInvidious(invidiousUrl, `channels/community/${id}`);
    if (invRes.data && Array.isArray(invRes.data.comments)) {
      const items = invRes.data.comments.map((post: any) => ({
        id: post.commentId || post.id,
        contentText: post.content || post.text || '',
        publishedTimeText: post.publishedText || '',
        attachmentImage: post.attachmentImage || null,
        voteCount: post.likeCount || 0,
        replyCount: post.replyCount || 0
      }));
      return res.json({ items });
    }
  } catch (err) {}

  return res.json({ items: [] });
});

// 8h. Video Transcript / Captions Endpoint (Interactive Timestamps)
app.get('/api/youtube/transcript/:id', async (req, res) => {
  const { invidiousUrl, innertubeUrl } = getRequestConfig(req);
  const { id } = req.params;
  const lang = (req.query.lang as string) || 'ja';

  interface TranscriptItem {
    start: number;
    duration: number;
    text: string;
  }

  // Helper: parse seconds from timestamp string like 00:01:23.450 or 01:23.450
  const parseTime = (timeStr: string): number => {
    const parts = timeStr.trim().split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(timeStr) || 0;
  };

  // Helper: parse WebVTT text into TranscriptItem array
  const parseVtt = (vttText: string): TranscriptItem[] => {
    const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const items: TranscriptItem[] = [];
    let currentStart = 0;
    let currentDuration = 0;
    let currentText = '';

    const timeRegex = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(timeRegex);
      if (match) {
        if (currentText) {
          items.push({
            start: Math.round(currentStart * 10) / 10,
            duration: Math.round(currentDuration * 10) / 10,
            text: currentText.replace(/<[^>]+>/g, '').trim()
          });
          currentText = '';
        }
        const s = parseTime(match[1]);
        const e = parseTime(match[2]);
        currentStart = s;
        currentDuration = Math.max(1, e - s);
      } else if (line && !line.startsWith('WEBVTT') && !line.startsWith('NOTE') && !/^\d+$/.test(line)) {
        currentText = currentText ? `${currentText} ${line}` : line;
      }
    }
    if (currentText) {
      items.push({
        start: Math.round(currentStart * 10) / 10,
        duration: Math.round(currentDuration * 10) / 10,
        text: currentText.replace(/<[^>]+>/g, '').trim()
      });
    }
    return items;
  };

  // 1. Primary: LuanRT/YouTube.js getTranscript
  try {
    const yt = await getInnertubeClient();
    const info = await yt.getInfo(id);
    const transcriptData = await info.getTranscript();
    const segments =
      transcriptData?.transcript?.content?.body?.initial_segments || [];
    if (Array.isArray(segments) && segments.length > 0) {
      const items: TranscriptItem[] = segments
        .map((seg: any) => {
          const startMs = Number(seg.start_ms || 0);
          const endMs = Number(seg.end_ms || startMs + 2000);
          const text = seg.snippet?.text || seg.snippet?.toString?.() || '';
          return {
            start: Math.round((startMs / 1000) * 10) / 10,
            duration: Math.max(1, Math.round(((endMs - startMs) / 1000) * 10) / 10),
            text: String(text).trim()
          };
        })
        .filter((it: TranscriptItem) => Boolean(it.text));
      if (items.length > 0) {
        return res.json({
          language: lang,
          languageCode: lang,
          items
        });
      }
    }
  } catch (err) {
    // fallback to Invidious / Timedtext
  }

  // 2. Try InnerTube Worker Subtitles & Direct YouTube Timedtext BEFORE Invidious
  try {
    const workerBase = (innertubeUrl || 'https://proxy.wa0260966.workers.dev').replace(/\/+$/, '');
    const subRes = await fetch(`${workerBase}/api/subtitles/${id}?lang=${encodeURIComponent(lang)}`);
    if (subRes.ok) {
      const vttText = await subRes.text();
      if (vttText.includes('-->')) {
        const items = parseVtt(vttText);
        if (items.length > 0) {
          return res.json({ language: lang, languageCode: lang, items });
        }
      }
    }
  } catch {}

  try {
    const ttRes = await fetch(`https://www.youtube.com/api/timedtext?v=${id}&lang=${lang}&fmt=vtt`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (ttRes.ok) {
      const vttText = await ttRes.text();
      if (vttText.includes('-->')) {
        const items = parseVtt(vttText);
        if (items.length > 0) {
          return res.json({ language: lang, languageCode: lang, items });
        }
      }
    }
  } catch (err) {}

  // 3. Last-resort Fallback: Invidious Captions (ONLY if InnerTube / YouTube Timedtext failed)
  try {
    const invRes = await fetchInvidious(invidiousUrl, `captions/${id}`);
    if (invRes.data && Array.isArray(invRes.data.captions) && invRes.data.captions.length > 0) {
      const caps = invRes.data.captions;
      const targetCap = caps.find((c: any) => c.languageCode === lang) ||
        caps.find((c: any) => c.languageCode?.startsWith(lang.slice(0, 2))) ||
        caps.find((c: any) => c.languageCode === 'en') ||
        caps[0];

      if (targetCap?.url) {
        const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
        const vttUrl = targetCap.url.startsWith('http') ? targetCap.url : `${cleanInst}${targetCap.url}`;
        const vttRes = await fetch(vttUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (vttRes.ok) {
          const vttText = await vttRes.text();
          const items = parseVtt(vttText);
          if (items.length > 0) {
            return res.json({
              language: targetCap.label || targetCap.languageCode,
              languageCode: targetCap.languageCode,
              items
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Invidious caption error:', err);
  }

  return res.json({
    language: lang,
    languageCode: lang,
    items: [],
    message: 'この動画の字幕・文字起こしは利用できません。'
  });
});

// 9. Video Direct Stream Metadata & Multiplexing Endpoints
interface ResolvedStreamUrls {
  title?: string;
  v1080?: string;
  v720?: string;
  v480?: string;
  v360?: string;
  combined720?: string;
  combined360?: string;
  audio?: string;
  rawGoogleV1080?: string;
  rawGoogleV720?: string;
  rawGoogleV360?: string;
  rawGoogleAudio?: string;
  omadaV1080?: string;
  omadaV720?: string;
  omadaV360?: string;
  omadaAudio?: string;
  expiresAt: number;
}
const streamUrlCache = new Map<string, ResolvedStreamUrls>();
const streamResolveInFlight = new Map<string, Promise<ResolvedStreamUrls | null>>();

/**
 * Self-hosted stream payload builder
 * Constructs structured muxed/videoOnly/audioByLanguage/subtitles/downloadGroups from our own server resolvers
 */
function buildSelfHostedStructuredStreams(videoId: string, urls: ResolvedStreamUrls | null, cleanInst: string) {
  const v1080 = urls?.omadaV1080 || urls?.v1080 || `/api/youtube/stream-direct/${videoId}?quality=1080`;
  const v720 = urls?.omadaV720 || urls?.v720 || `/api/youtube/stream-direct/${videoId}?quality=720`;
  const v480 = urls?.v480 || v720;
  const comb360 = urls?.combined360 || urls?.omadaV360 || urls?.v360 || `/api/youtube/stream-direct/${videoId}?quality=360`;
  const comb720 = urls?.combined720 || undefined;
  const audio140 = urls?.omadaAudio || urls?.audio || `/api/youtube/stream-direct/${videoId}?quality=audio`;
  const m3u8Url = `/api/worker/api/stream/${videoId}.m3u8`;

  const muxedList: any[] = [
    {
      formatId: '18',
      itag: 18,
      ext: 'mp4',
      resolution: '640x360',
      formatNote: '360p',
      width: 640,
      height: 360,
      vcodec: 'avc1.42001E',
      acodec: 'mp4a.40.2',
      mediaType: 'muxed',
      streamUrl: comb360,
      url: comb360
    }
  ];
  if (comb720) {
    muxedList.unshift({
      formatId: '22',
      itag: 22,
      ext: 'mp4',
      resolution: '1280x720',
      formatNote: '720p',
      width: 1280,
      height: 720,
      vcodec: 'avc1.64001F',
      acodec: 'mp4a.40.2',
      mediaType: 'muxed',
      streamUrl: comb720,
      url: comb720
    });
  }

  const videoOnlyList: any[] = [
    {
      formatId: '137',
      itag: 137,
      ext: 'mp4',
      resolution: '1920x1080',
      formatNote: '1080p',
      width: 1920,
      height: 1080,
      vcodec: 'avc1.640028',
      acodec: 'none',
      mediaType: 'video_only',
      streamUrl: v1080,
      url: v1080
    },
    {
      formatId: '136',
      itag: 136,
      ext: 'mp4',
      resolution: '1280x720',
      formatNote: '720p',
      width: 1280,
      height: 720,
      vcodec: 'avc1.4d401f',
      acodec: 'none',
      mediaType: 'video_only',
      streamUrl: v720,
      url: v720
    }
  ];
  if (v480 && v480 !== v720) {
    videoOnlyList.push({
      formatId: '135',
      itag: 135,
      ext: 'mp4',
      resolution: '854x480',
      formatNote: '480p',
      width: 854,
      height: 480,
      vcodec: 'avc1.4d401e',
      acodec: 'none',
      mediaType: 'video_only',
      streamUrl: v480,
      url: v480
    });
  }

  const audioStreamEntry = {
    formatId: '140',
    itag: 140,
    ext: 'm4a',
    resolution: 'audio only',
    formatNote: 'medium',
    vcodec: 'none',
    acodec: 'mp4a.40.2',
    abr: 129.5,
    mediaType: 'audio_only',
    language: {
      code: 'ja',
      name: '日本語',
      isDefault: true,
      isOriginal: true,
      isDrc: false
    },
    streamUrl: audio140,
    url: audio140
  };

  const downloadGroups = {
    muxed: [
      ...(comb720 ? [{ url: comb720, resolution: '720p', ext: 'mp4' }] : []),
      { url: comb360, resolution: '360p', ext: 'mp4' }
    ],
    audio: [
      { url: audio140, ext: 'm4a', language: '日本語 (AAC 129kbps)' },
      { url: `/api/youtube/stream-direct/${videoId}?quality=audio`, ext: 'm4a', language: '日本語 (サーバー中継)' }
    ],
    video: [
      { url: v1080, resolution: '1080p', ext: 'mp4' },
      { url: v720, resolution: '720p', ext: 'mp4' },
      { url: `/api/youtube/stream-mux/${videoId}?quality=1080`, resolution: '1080p (FFmpeg音声合体)', ext: 'mp4' }
    ],
    hls: [{ url: m3u8Url, resolution: 'HLS (自動画質)' }],
    subtitles: [
      { id: 'sub-ja', url: `/api/worker/api/subtitles/${videoId}?lang=ja`, src: `/api/worker/api/subtitles/${videoId}?lang=ja`, lang: 'ja', srclang: 'ja', label: '日本語字幕', isDefault: true },
      { id: 'sub-en', url: `/api/worker/api/subtitles/${videoId}?lang=en`, src: `/api/worker/api/subtitles/${videoId}?lang=en`, lang: 'en', srclang: 'en', label: '英語字幕' }
    ]
  };

  return {
    videoId,
    title: urls?.title || `video-${videoId}`,
    engine: 'kaitotube-self',
    streams: {
      muxed: muxedList,
      videoOnly: videoOnlyList,
      audioByLanguage: {
        ja: {
          language: { code: 'ja', name: '日本語', isDefault: true, isOriginal: true },
          streams: [audioStreamEntry]
        }
      },
      v1080,
      v720,
      v480,
      v360: comb360,
      audio: audio140,
      combined720: comb720,
      combined360: comb360,
      omadaV1080: v1080,
      omadaV720: v720,
      omadaV360: comb360,
      omadaAudio: audio140,
      invidious1080: v1080,
      invidious720: v720,
      invidious360: comb360,
      invidiousAudio: audio140,
      direct1080: `/api/youtube/stream-direct/${videoId}?quality=1080`,
      direct720: `/api/youtube/stream-direct/${videoId}?quality=720`,
      direct360: `/api/youtube/stream-direct/${videoId}?quality=360`,
      directAudio: `/api/youtube/stream-direct/${videoId}?quality=audio`,
      ytdlp1080: `/api/youtube/stream-ytdlp/${videoId}?quality=1080`,
      ytdlp720: `/api/youtube/stream-ytdlp/${videoId}?quality=720`,
      ytdlp360: `/api/youtube/stream-ytdlp/${videoId}?quality=360`,
      ytdlpAudio: `/api/youtube/stream-ytdlp/${videoId}?quality=audio`,
      rawV1080: urls?.rawGoogleV1080 || v1080,
      rawV720: urls?.rawGoogleV720 || v720,
      rawV360: urls?.rawGoogleV360 || comb360,
      rawAudio: urls?.rawGoogleAudio || audio140,
      m3u8Url
    },
    m3u8: {
      list: [{ formatId: 'hls', ext: 'mp4', protocol: 'm3u8_native', isM3u8: true, resolution: '1920x1080', formatNote: 'HLS', streamUrl: m3u8Url, url: m3u8Url }],
      byLanguage: {}
    },
    subtitles: {
      manualByLanguage: {
        ja: {
          language: { code: 'ja', name: '日本語', isDefault: true },
          captions: [{ ext: 'vtt', url: `/api/worker/api/subtitles/${videoId}?lang=ja`, name: '日本語' }]
        },
        en: {
          language: { code: 'en', name: '英語', isDefault: false },
          captions: [{ ext: 'vtt', url: `/api/worker/api/subtitles/${videoId}?lang=en`, name: '英語' }]
        }
      },
      automaticByLanguage: {}
    },
    downloadGroups,
    audioTracks: [
      { id: 'audio-omada-140', url: audio140, lang: 'ja', label: '日本語（高音質音声 AAC 129kbps）', ext: 'm4a', isDefault: true, isOriginal: true },
      { id: 'audio-ja-std', url: `/api/youtube/stream-direct/${videoId}?quality=audio`, lang: 'ja', label: '日本語（サーバー中継音声）', ext: 'm4a', isOriginal: true },
      { id: 'audio-drc', url: `/api/youtube/stream-direct/${videoId}?quality=audio&drc=1`, lang: 'ja', label: '夜間音量圧縮 (DRC)', isDrc: true }
    ],
    subtitleTracks: downloadGroups.subtitles
  };
}

/**
 * Converts a googlevideo.com URL returned by an Invidious instance (such as https://yt.omada.cafe)
 * into the instance's local proxy URL (https://yt.omada.cafe/videoplayback?...&host=rr...googlevideo.com)
 * so that the request originates from the Invidious server's IP and never triggers 403 Forbidden.
 */
function toInvidiousLocalPlaybackUrl(rawUrl: string | undefined, instanceBase = 'https://yt.omada.cafe'): string | undefined {
  if (!rawUrl) return undefined;
  const rawInst = (instanceBase || 'https://yt.omada.cafe').replace(/\/+$/, '');
  const cleanInst = rawInst.includes('workers.dev') ? 'https://yt.omada.cafe' : rawInst;
  try {
    if (rawUrl.startsWith('/')) {
      const full = new URL(`${cleanInst}${rawUrl}`);
      if (full.pathname === '/videoplayback') {
        full.searchParams.set('local', 'true');
      }
      return full.toString();
    }
    const parsed = new URL(rawUrl);
    if (parsed.hostname.endsWith('.googlevideo.com')) {
      parsed.searchParams.set('host', parsed.host);
      parsed.searchParams.set('local', 'true');
      return `${cleanInst}/videoplayback?${parsed.searchParams.toString()}`;
    }
    if (parsed.pathname === '/videoplayback') {
      parsed.searchParams.set('local', 'true');
      return parsed.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

/**
 * Extracts raw googlevideo.com URL from an Invidious /videoplayback?...&host=rr...googlevideo.com URL
 */
function toRawGoogleVideoUrl(urlStr: string | undefined): string | undefined {
  if (!urlStr) return undefined;
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.endsWith('.googlevideo.com')) {
      return urlStr;
    }
    const hostParam = parsed.searchParams.get('host');
    if (hostParam && hostParam.endsWith('.googlevideo.com')) {
      const copy = new URL(urlStr);
      copy.searchParams.delete('host');
      return `https://${hostParam}/videoplayback?${copy.searchParams.toString()}`;
    }
    return urlStr;
  } catch {
    return urlStr;
  }
}

async function resolveInvidiousInstanceFast(videoId: string, inst: string, suffix = '?local=true', timeoutMs = 3200): Promise<ResolvedStreamUrls> {
  const cleanInst = inst.replace(/\/+$/, '');
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const targetEndpoint = `${cleanInst}/api/v1/videos/${encodeURIComponent(videoId)}${suffix}`;
    let res = await fetch(targetEndpoint, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!res.ok && res.status >= 500) {
      const errBody = await res.text().catch(() => '');
      if (!errBody.includes('available in your country') && !errBody.includes('Video unavailable')) {
        await new Promise((r) => setTimeout(r, 350));
        res = await fetch(targetEndpoint, {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const formatStreams: any[] = Array.isArray(data.formatStreams) ? data.formatStreams : [];
    const adaptiveFormats: any[] = Array.isArray(data.adaptiveFormats) ? data.adaptiveFormats : [];
    if (formatStreams.length === 0 && adaptiveFormats.length === 0) {
      throw new Error('Empty formats');
    }

    const rawComb360 =
      formatStreams.find((f) => String(f.itag) === '18')?.url ||
      formatStreams.find((f) => f.resolution === '360p' || f.qualityLabel === '360p')?.url ||
      formatStreams[0]?.url;
    const rawComb720 =
      formatStreams.find((f) => String(f.itag) === '22')?.url ||
      formatStreams.find((f) => f.resolution === '720p' || f.qualityLabel === '720p')?.url;

    const raw1080 =
      adaptiveFormats.find((f) => String(f.itag) === '137')?.url ||
      adaptiveFormats.find(
        (f) =>
          (f.resolution === '1080p' || f.qualityLabel === '1080p' || String(f.qualityLabel || '').startsWith('1080p')) &&
          (f.type || '').includes('avc1')
      )?.url ||
      adaptiveFormats.find(
        (f) =>
          (f.resolution === '1080p' || f.qualityLabel === '1080p' || String(f.qualityLabel || '').startsWith('1080p')) &&
          (f.type || '').includes('video/mp4')
      )?.url ||
      adaptiveFormats.find(
        (f) =>
          (f.resolution === '1080p' || f.qualityLabel === '1080p' || String(f.qualityLabel || '').startsWith('1080p')) &&
          (f.type || '').includes('video')
      )?.url;

    const raw720 =
      rawComb720 ||
      adaptiveFormats.find((f) => String(f.itag) === '136')?.url ||
      adaptiveFormats.find(
        (f) =>
          (f.resolution === '720p' || f.qualityLabel === '720p' || String(f.qualityLabel || '').startsWith('720p')) &&
          (f.type || '').includes('avc1')
      )?.url ||
      adaptiveFormats.find(
        (f) =>
          (f.resolution === '720p' || f.qualityLabel === '720p' || String(f.qualityLabel || '').startsWith('720p')) &&
          (f.type || '').includes('video/mp4')
      )?.url ||
      adaptiveFormats.find(
        (f) =>
          (f.resolution === '720p' || f.qualityLabel === '720p' || String(f.qualityLabel || '').startsWith('720p')) &&
          (f.type || '').includes('video')
      )?.url;

    const raw480 =
      adaptiveFormats.find((f) => String(f.itag) === '135')?.url ||
      adaptiveFormats.find((f) => (f.resolution === '480p' || f.qualityLabel === '480p') && (f.type || '').includes('video/mp4'))?.url;

    const rawAdap360 =
      adaptiveFormats.find((f) => String(f.itag) === '134')?.url ||
      adaptiveFormats.find((f) => (f.resolution === '360p' || f.qualityLabel === '360p') && (f.type || '').includes('video/mp4'))?.url;

    const rawAud =
      adaptiveFormats.find((f) => String(f.itag) === '140')?.url ||
      adaptiveFormats.find((f) => (f.type || '').includes('audio/mp4'))?.url ||
      adaptiveFormats.find((f) => String(f.itag) === '251' || String(f.itag) === '250' || String(f.itag) === '249')?.url ||
      adaptiveFormats.find((f) => (f.type || '').includes('audio'))?.url;

    const omadaComb360 = toInvidiousLocalPlaybackUrl(rawComb360, cleanInst);
    const omadaComb720 = toInvidiousLocalPlaybackUrl(rawComb720, cleanInst);
    const omada1080 = toInvidiousLocalPlaybackUrl(raw1080, cleanInst);
    const omada720 = toInvidiousLocalPlaybackUrl(raw720, cleanInst);
    const omada480 = toInvidiousLocalPlaybackUrl(raw480, cleanInst);
    const omada360 = omadaComb360 || toInvidiousLocalPlaybackUrl(rawAdap360, cleanInst);
    const omadaAudio = toInvidiousLocalPlaybackUrl(rawAud, cleanInst) || omadaComb360;

    if (!omada360 && !omada1080 && !omada720 && !omadaAudio) {
      throw new Error('No playable streams');
    }

    return {
      title: data.title || `video-${videoId}`,
      v1080: omada1080 || omada720 || omada360,
      v720: omada720 || omadaComb720 || omada360,
      v480: omada480 || omada360,
      v360: omada360 || omada720,
      combined720: omadaComb720,
      combined360: omadaComb360 || omada360,
      audio: omadaAudio || omadaComb360 || omada360,
      omadaV1080: omada1080 || omada720,
      omadaV720: omada720 || omada360,
      omadaV360: omadaComb360 || omada360,
      omadaAudio: omadaAudio || omadaComb360,
      expiresAt: Date.now() + 30 * 60 * 1000
    };
  } finally {
    clearTimeout(tid);
  }
}

async function resolveInnerTubeDirectFast(videoId: string): Promise<ResolvedStreamUrls> {
  const fetchClientPlayer = async (clientBody: Record<string, any>, ua: string, clientId: string, clientVer: string) => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 2800);
    try {
      const res = await fetch('https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': ua,
          'X-Goog-Api-Format-Version': '2',
          'X-YouTube-Client-Name': clientId,
          'X-YouTube-Client-Version': clientVer
        },
        body: JSON.stringify({
          context: { client: clientBody },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true
        })
      });
      if (!res.ok) throw new Error(`InnerTube player HTTP ${res.status}`);
      const data = await res.json();
      const sd = data?.streamingData;
      const formats: any[] = Array.isArray(sd?.formats) ? sd.formats : [];
      const adaptive: any[] = Array.isArray(sd?.adaptiveFormats) ? sd.adaptiveFormats : [];
      if (formats.length === 0 && adaptive.length === 0) {
        throw new Error('Empty streamingData');
      }
      return data;
    } finally {
      clearTimeout(tid);
    }
  };

  const playerData = await Promise.any([
    fetchClientPlayer(
      {
        clientName: 'ANDROID_VR',
        clientVersion: '1.60.19',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        osName: 'Android',
        osVersion: '12L',
        androidSdkVersion: 32,
        hl: 'ja',
        gl: 'JP',
        utcOffsetMinutes: 540
      },
      'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
      '28',
      '1.60.19'
    ),
    fetchClientPlayer(
      {
        clientName: 'IOS',
        clientVersion: '20.03.02',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.2.1.22C161',
        hl: 'ja',
        gl: 'JP',
        utcOffsetMinutes: 540
      },
      'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X; ja_JP)',
      '5',
      '20.03.02'
    )
  ]);

  const sd = playerData?.streamingData || {};
  const vd = playerData?.videoDetails || {};
  const formats: any[] = Array.isArray(sd.formats) ? sd.formats : [];
  const adaptive: any[] = Array.isArray(sd.adaptiveFormats) ? sd.adaptiveFormats : [];

  const rawComb720 =
    formats.find((f) => Number(f.itag) === 22)?.url ||
    formats.find((f) => f.qualityLabel === '720p')?.url;
  const rawComb360 =
    formats.find((f) => Number(f.itag) === 18)?.url ||
    formats.find((f) => f.qualityLabel === '360p')?.url ||
    formats[0]?.url;
  const raw1080 =
    adaptive.find((f) => Number(f.itag) === 137)?.url ||
    adaptive.find((f) => String(f.qualityLabel || '').startsWith('1080p') && String(f.mimeType || '').includes('avc1'))?.url ||
    adaptive.find((f) => String(f.qualityLabel || '').startsWith('1080p') && String(f.mimeType || '').includes('video/mp4'))?.url ||
    adaptive.find((f) => String(f.qualityLabel || '').startsWith('1080p'))?.url;
  const raw720 =
    rawComb720 ||
    adaptive.find((f) => Number(f.itag) === 136)?.url ||
    adaptive.find((f) => String(f.qualityLabel || '').startsWith('720p') && String(f.mimeType || '').includes('avc1'))?.url ||
    adaptive.find((f) => String(f.qualityLabel || '').startsWith('720p') && String(f.mimeType || '').includes('video/mp4'))?.url ||
    adaptive.find((f) => String(f.qualityLabel || '').startsWith('720p'))?.url;
  const raw480 =
    adaptive.find((f) => Number(f.itag) === 135)?.url ||
    adaptive.find((f) => String(f.qualityLabel || '').startsWith('480p') && String(f.mimeType || '').includes('video/mp4'))?.url;
  const raw360 =
    rawComb360 ||
    adaptive.find((f) => Number(f.itag) === 134)?.url ||
    adaptive.find((f) => String(f.qualityLabel || '').startsWith('360p'))?.url ||
    raw720;
  const rawAud =
    adaptive.find((f) => Number(f.itag) === 140)?.url ||
    adaptive.find((f) => String(f.mimeType || '').includes('audio/mp4'))?.url ||
    adaptive.find((f) => String(f.mimeType || '').includes('audio'))?.url ||
    rawComb360;

  if (!raw360 && !raw720 && !raw1080 && !rawAud) {
    throw new Error('No playable InnerTube streams');
  }

  // Server-proxied HTTP 206 endpoints so the browser never suffers 403 IP-mismatch on raw googlevideo.com URLs
  const proxy1080 = `/api/youtube/stream-direct/${videoId}?quality=1080`;
  const proxy720 = `/api/youtube/stream-direct/${videoId}?quality=720`;
  const proxy360 = `/api/youtube/stream-direct/${videoId}?quality=360`;
  const proxyAudio = `/api/youtube/stream-direct/${videoId}?quality=audio`;

  return {
    title: vd.title || `video-${videoId}`,
    v1080: raw1080 ? proxy1080 : proxy720,
    v720: raw720 ? proxy720 : proxy360,
    v480: raw480 ? proxy720 : proxy360,
    v360: proxy360,
    combined720: rawComb720 ? proxy720 : undefined,
    combined360: proxy360,
    audio: proxyAudio,
    rawGoogleV1080: raw1080 || raw720 || raw360,
    rawGoogleV720: raw720 || raw360,
    rawGoogleV360: rawComb360 || raw360,
    rawGoogleAudio: rawAud || rawComb360 || raw360,
    omadaV1080: raw1080 ? proxy1080 : proxy720,
    omadaV720: raw720 ? proxy720 : proxy360,
    omadaV360: proxy360,
    omadaAudio: proxyAudio,
    expiresAt: Date.now() + 30 * 60 * 1000
  };
}

async function resolvePipedInstanceFast(videoId: string, inst: string, timeoutMs = 3500): Promise<ResolvedStreamUrls> {
  const cleanInst = inst.replace(/\/+$/, '');
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cleanInst}/streams/${encodeURIComponent(videoId)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`Piped HTTP ${res.status}`);
    const data = await res.json();
    const videoStreams: any[] = Array.isArray(data.videoStreams) ? data.videoStreams : [];
    const audioStreams: any[] = Array.isArray(data.audioStreams) ? data.audioStreams : [];
    if (videoStreams.length === 0 && audioStreams.length === 0) {
      throw new Error('Empty Piped streams');
    }

    const comb360 =
      videoStreams.find((v) => !v.videoOnly && (v.quality === '360p' || v.itag === 18))?.url ||
      videoStreams.find((v) => !v.videoOnly)?.url;
    const comb720 =
      videoStreams.find((v) => !v.videoOnly && (v.quality === '720p' || v.itag === 22))?.url;
    const v1080 =
      videoStreams.find((v) => (v.quality === '1080p' || v.itag === 137) && (v.format === 'MPEG_4' || String(v.mimeType || '').includes('mp4')))?.url ||
      videoStreams.find((v) => v.quality === '1080p')?.url;
    const v720 =
      comb720 ||
      videoStreams.find((v) => (v.quality === '720p' || v.itag === 136) && (v.format === 'MPEG_4' || String(v.mimeType || '').includes('mp4')))?.url ||
      videoStreams.find((v) => v.quality === '720p')?.url;
    const v480 =
      videoStreams.find((v) => (v.quality === '480p' || v.itag === 135) && (v.format === 'MPEG_4' || String(v.mimeType || '').includes('mp4')))?.url;
    const v360 =
      comb360 ||
      videoStreams.find((v) => v.quality === '360p' || v.itag === 134)?.url ||
      v720;
    const audio =
      audioStreams.find((a) => a.itag === 140 || a.format === 'M4A' || String(a.mimeType || '').includes('mp4'))?.url ||
      audioStreams[0]?.url ||
      comb360;

    if (!v360 && !v720 && !v1080 && !audio) {
      throw new Error('No playable Piped streams');
    }

    return {
      title: data.title || `video-${videoId}`,
      v1080: v1080 || v720 || v360,
      v720: v720 || v360,
      v480: v480 || v360,
      v360: v360 || v720,
      combined720: comb720,
      combined360: comb360 || v360,
      audio: audio || comb360 || v360,
      omadaV1080: v1080 || v720 || v360,
      omadaV720: v720 || v360,
      omadaV360: comb360 || v360,
      omadaAudio: audio || comb360,
      expiresAt: Date.now() + 30 * 60 * 1000
    };
  } finally {
    clearTimeout(tid);
  }
}

async function resolveVideoStreams(videoId: string, customInvidiousUrl?: string): Promise<ResolvedStreamUrls | null> {
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const existingInFlight = streamResolveInFlight.get(videoId);
  if (existingInFlight) {
    return existingInFlight;
  }

  const job = (async (): Promise<ResolvedStreamUrls | null> => {
    try {
      const instances = Array.from(
        new Set(
          [
            'https://yt.omada.cafe',
            customInvidiousUrl ? customInvidiousUrl.replace(/\/+$/, '') : ''
          ].filter(Boolean)
        )
      );

      // Race Invidious + Cloudflare Worker + Piped instances in parallel (8500ms timeout so cold companion extraction completes)
      const invidiousRacePromise = Promise.any([
        ...instances.map((inst) => resolveInvidiousInstanceFast(videoId, inst, '?local=true', 8500)),
        resolveInvidiousInstanceFast(videoId, DEFAULT_INNERTUBE_WORKER, '', 8500),
        resolvePipedInstanceFast(videoId, 'https://api.piped.private.coffee', 4500),
        resolvePipedInstanceFast(videoId, 'https://pipedapi.ducks.party', 4500)
      ]).catch(() => null);

      // Race Direct InnerTube (ANDROID_VR / IOS via youtubei.googleapis.com) in parallel (~180-300ms)
      const innerTubeFastPromise = resolveInnerTubeDirectFast(videoId).catch(() => null);

      // Wait for whichever fastest resolver succeeds first!
      const fastest = await Promise.any([
        innerTubeFastPromise.then((r) => {
          if (!r) throw new Error('null');
          return { source: 'innertube' as const, data: r };
        }),
        invidiousRacePromise.then((r) => {
          if (!r) throw new Error('null');
          return { source: 'invidious' as const, data: r };
        })
      ]).catch(() => null);

      if (fastest) {
        if (fastest.source === 'invidious') {
          innerTubeFastPromise.then((itRes) => {
            if (itRes) {
              const current = streamUrlCache.get(videoId) || fastest.data;
              streamUrlCache.set(videoId, {
                ...current,
                rawGoogleV1080: itRes.rawGoogleV1080 || current.rawGoogleV1080,
                rawGoogleV720: itRes.rawGoogleV720 || current.rawGoogleV720,
                rawGoogleV360: itRes.rawGoogleV360 || current.rawGoogleV360,
                rawGoogleAudio: itRes.rawGoogleAudio || current.rawGoogleAudio
              });
            }
          });
          streamUrlCache.set(videoId, fastest.data);
          return fastest.data;
        }

        // InnerTube won (typically ~200-300ms)! Store immediately so stream-direct works right away
        streamUrlCache.set(videoId, fastest.data);

        // Give Invidious a brief 120ms window in case it's right behind; otherwise return immediately and enrich in background
        const invQuick = await Promise.race([
          invidiousRacePromise,
          new Promise<null>((r) => setTimeout(() => r(null), 120))
        ]);

        if (invQuick) {
          const merged: ResolvedStreamUrls = {
            ...invQuick,
            rawGoogleV1080: fastest.data.rawGoogleV1080 || invQuick.rawGoogleV1080,
            rawGoogleV720: fastest.data.rawGoogleV720 || invQuick.rawGoogleV720,
            rawGoogleV360: fastest.data.rawGoogleV360 || invQuick.rawGoogleV360,
            rawGoogleAudio: fastest.data.rawGoogleAudio || invQuick.rawGoogleAudio
          };
          streamUrlCache.set(videoId, merged);
          return merged;
        }

        // Enrich cache in background when Invidious finishes
        invidiousRacePromise.then((invLater) => {
          if (invLater) {
            const current = streamUrlCache.get(videoId) || fastest.data;
            streamUrlCache.set(videoId, {
              ...invLater,
              rawGoogleV1080: current.rawGoogleV1080 || invLater.rawGoogleV1080,
              rawGoogleV720: current.rawGoogleV720 || invLater.rawGoogleV720,
              rawGoogleV360: current.rawGoogleV360 || invLater.rawGoogleV360,
              rawGoogleAudio: current.rawGoogleAudio || invLater.rawGoogleAudio
            });
          }
        });

        return fastest.data;
      }

      // Check if yt-dlp already has a cached entry; otherwise trigger in background without blocking HTTP response
      const cachedYtDlp = ytDlpStreamCache.get(videoId);
      if (cachedYtDlp && cachedYtDlp.expiresAt > Date.now()) {
        streamUrlCache.set(videoId, cachedYtDlp);
        return cachedYtDlp;
      }
      resolveYtDlpStreams(videoId)
        .then((res) => {
          if (res) streamUrlCache.set(videoId, res);
        })
        .catch(() => {});

      return null;
    } finally {
      streamResolveInFlight.delete(videoId);
    }
  })();

  streamResolveInFlight.set(videoId, job);
  return job;
}

const ytDlpStreamCache = new Map<string, ResolvedStreamUrls>();

async function resolveYtDlpStreams(videoId: string): Promise<ResolvedStreamUrls | null> {
  const cached = ytDlpStreamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const isWin = process.platform === 'win32';
  const localYtDlpPath = path.join(process.cwd(), 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp');
  const ytDlpPath = fs.existsSync(localYtDlpPath) ? localYtDlpPath : 'yt-dlp';
  if (!fs.existsSync(localYtDlpPath)) {
    const installerScript = path.join(process.cwd(), 'install-yt-dlp.js');
    if (fs.existsSync(installerScript)) {
      execFile(process.execPath, [installerScript], { timeout: 60000 }, () => {});
    }
  }

  const fromBinary: ResolvedStreamUrls | null = await new Promise((resolve) => {
    execFile(
      ytDlpPath,
      [
        '--js-runtimes',
        `node:${process.execPath}`,
        '--no-warnings',
        '-g',
        '-f',
        'bestvideo[height<=1080][ext=mp4]/bestvideo[height<=1080]/bestvideo,bestaudio[ext=m4a]/bestaudio,18/best[height<=720][ext=mp4]/best',
        `https://www.youtube.com/watch?v=${videoId}`
      ],
      { timeout: 25000 },
      (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.trim().split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'));
          if (lines.length >= 2) {
            const v1080 = lines[0];
            const audio = lines[1];
            const combined = lines[2] || lines[0];
            const result: ResolvedStreamUrls = {
              v1080,
              v720: lines[2] || v1080,
              v360: combined,
              audio,
              combined720: lines[2],
              combined360: combined,
              expiresAt: Date.now() + 2 * 3600 * 1000
            };
            ytDlpStreamCache.set(videoId, result);
            resolve(result);
            return;
          } else if (lines.length === 1) {
            const combined = lines[0];
            const result: ResolvedStreamUrls = {
              v1080: combined,
              v720: combined,
              v360: combined,
              audio: combined,
              combined720: combined,
              combined360: combined,
              expiresAt: Date.now() + 2 * 3600 * 1000
            };
            ytDlpStreamCache.set(videoId, result);
            resolve(result);
            return;
          }
        }
        resolve(null);
      }
    );
  });

  if (fromBinary) return fromBinary;

  // Fallback to ANDROID_VR InnerTube player (same unciphered profile used by yt-dlp)
  try {
    const vrRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.60.19',
            deviceMake: 'Oculus',
            deviceModel: 'Quest 3',
            osName: 'Android',
            osVersion: '12L',
            androidSdkVersion: 32,
            hl: 'ja',
            gl: 'JP'
          }
        },
        videoId
      })
    });
    if (vrRes.ok) {
      const vrData = await vrRes.json();
      const sd = vrData?.streamingData || {};
      const formats: any[] = Array.isArray(sd.formats) ? sd.formats : [];
      const adaptive: any[] = Array.isArray(sd.adaptiveFormats) ? sd.adaptiveFormats : [];
      const combined360 = formats.find((f) => f.itag === 18 || f.qualityLabel === '360p')?.url || formats[0]?.url;
      const v1080 = adaptive.find((f) => f.qualityLabel === '1080p' && (f.mimeType || '').includes('video/mp4'))?.url ||
                    adaptive.find((f) => f.qualityLabel === '1080p')?.url;
      const v720 = adaptive.find((f) => f.qualityLabel === '720p' && (f.mimeType || '').includes('video/mp4'))?.url ||
                   adaptive.find((f) => f.qualityLabel === '720p')?.url || combined360;
      const audio = adaptive.find((f) => (f.mimeType || '').includes('audio/mp4'))?.url ||
                    adaptive.find((f) => (f.mimeType || '').includes('audio'))?.url || combined360;
      if (v1080 || v720 || combined360 || audio) {
        const result: ResolvedStreamUrls = {
          title: vrData?.videoDetails?.title,
          v1080: v1080 || v720 || combined360,
          v720: v720 || combined360,
          v360: combined360 || v720,
          combined360,
          audio: audio || combined360,
          expiresAt: Date.now() + 2 * 3600 * 1000
        };
        ytDlpStreamCache.set(videoId, result);
        return result;
      }
    }
  } catch {}

  return null;
}

// Dedicated yt-dlp Stream Endpoint (/api/youtube/stream-ytdlp/:id)
app.get('/api/youtube/stream-ytdlp/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);
  const quality =
    req.query.quality === '360'
      ? '360'
      : req.query.quality === '720'
      ? '720'
      : req.query.quality === 'audio'
      ? 'audio'
      : '1080';
  const mode = String(req.query.mode || '');

  try {
    let urls = await resolveVideoStreams(id, invidiousUrl);
    if (!urls) {
      urls = await resolveYtDlpStreams(id);
    }

    if (mode === 'json') {
      return res.json({
        videoId: id,
        engine: 'yt-dlp',
        streams: {
          ytdlp1080: `/api/youtube/stream-ytdlp/${id}?quality=1080`,
          ytdlp720: `/api/youtube/stream-ytdlp/${id}?quality=720`,
          ytdlp360: `/api/youtube/stream-ytdlp/${id}?quality=360`,
          ytdlpAudio: `/api/youtube/stream-ytdlp/${id}?quality=audio`,
          v1080: urls?.v1080,
          v720: urls?.v720,
          v360: urls?.v360 || urls?.combined360,
          audio: urls?.audio
        }
      });
    }

    if (!urls) {
      return res.status(502).send('yt-dlp ストリームの取得に失敗しました。');
    }

    if (mode === 'direct') {
      const target =
        quality === 'audio'
          ? urls.audio || urls.combined360
          : quality === '360'
          ? urls.combined360 || urls.v360
          : quality === '720'
          ? urls.v720 || urls.combined360
          : urls.v1080 || urls.v720;
      if (target && target.startsWith('http')) {
        return res.redirect(302, target);
      }
    }

    const startSec = Math.max(0, Math.floor(Number(req.query.start) || 0));
    const ssArgs = startSec > 0 ? ['-ss', String(startSec)] : [];

    // Audio-only via FFmpeg
    if (quality === 'audio') {
      const audioSrc = urls.omadaAudio || urls.audio || urls.combined360 || urls.v360;
      if (!audioSrc) return res.status(502).send('yt-dlp 音声ストリームが見つかりません。');
      res.setHeader('Content-Type', 'audio/aac');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      const ffmpeg = spawn('/usr/bin/ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        ...ssArgs,
        '-i', audioSrc,
        '-vn',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-f', 'adts',
        'pipe:1'
      ]);
      ffmpeg.stdout.pipe(res);
      ffmpeg.stderr.on('data', () => {});
      req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
      return;
    }

    // Combined 360p stream (fast remux)
    if (quality === '360' && (urls.omadaV360 || urls.combined360)) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      const ffmpeg = spawn('/usr/bin/ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        ...ssArgs,
        '-i', (urls.omadaV360 || urls.combined360)!,
        '-c', 'copy',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
      ]);
      ffmpeg.stdout.pipe(res);
      ffmpeg.stderr.on('data', () => {});
      req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
      return;
    }

    // 1080p / 720p Video + Audio real-time FFmpeg muxing
    const videoUrl =
      (quality === '1080'
        ? urls.omadaV1080 || urls.v1080
        : quality === '720'
        ? urls.omadaV720 || urls.v720
        : urls.omadaV360 || urls.v360) ||
      urls.v1080 ||
      urls.v720 ||
      urls.combined360;
    const audioUrl = urls.omadaAudio || urls.audio || urls.combined360 || videoUrl;

    if (!videoUrl) {
      return res.status(502).send('yt-dlp 映像ストリームが見つかりません。');
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const ffmpeg = spawn('/usr/bin/ffmpeg', [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      ...ssArgs,
      '-i', videoUrl,
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      ...ssArgs,
      '-i', audioUrl!,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1'
    ]);

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => {});
    req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
  } catch (err: any) {
    console.error('yt-dlp stream error:', err);
    if (!res.headersSent) res.status(500).send(err.message || 'yt-dlp stream error');
  }
});

app.get('/api/youtube/stream/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);

  // Pre-warm in background
  resolveVideoStreams(id, invidiousUrl).catch(() => {});

  return res.json({
    videoId: id,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    lowStream: {
      url: `/api/youtube/stream-direct/${id}?quality=360`,
      directUrl: `/api/youtube/stream-direct/${id}?quality=360`,
      quality: '360p',
      container: 'mp4'
    },
    normalStream: {
      url: `/api/youtube/stream-direct/${id}?quality=720`,
      directUrl: `/api/youtube/stream-direct/${id}?quality=720`,
      quality: '720p',
      container: 'mp4'
    },
    highStream: {
      url: `/api/youtube/stream-direct/${id}?quality=1080`,
      directUrl: `/api/youtube/stream-direct/${id}?quality=1080`,
      quality: '1080p',
      container: 'mp4'
    },
    audioStream: {
      url: `/api/youtube/stream-direct/${id}?quality=audio`,
      directUrl: `/api/youtube/stream-direct/${id}?quality=audio`,
      quality: 'audio',
      container: 'aac'
    }
  });
});

// Direct Invidious (yt.omada.cafe) & Self-Worker Google Video Streams
app.get('/api/youtube/stream-sources/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);
  const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');

  try {
    const urls = await resolveVideoStreams(id, invidiousUrl);
    const payload = buildSelfHostedStructuredStreams(id, urls, cleanInst);
    return res.json(payload);
  } catch {
    return res.json(buildSelfHostedStructuredStreams(id, null, cleanInst));
  }
});

// Direct Stream Range-Proxy Endpoint (Streams with HTTP 206 Range support from server IP to prevent 403 & firewall blocks)
app.get('/api/youtube/stream-direct/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);
  const quality = req.query.quality === '1080' ? '1080' : req.query.quality === '360' ? '360' : req.query.quality === 'audio' ? 'audio' : '720';

  const firstHttpUrl = (...candidates: Array<string | undefined>): string | undefined =>
    candidates.find((u) => typeof u === 'string' && u.startsWith('http'));

  const pickTargetUrl = (urls: ResolvedStreamUrls | null): string | undefined => {
    if (!urls) return undefined;
    if (quality === 'audio') {
      return firstHttpUrl(urls.rawGoogleAudio, urls.omadaAudio, urls.audio, urls.rawGoogleV360, urls.combined360, urls.v360);
    } else if (quality === '360') {
      return firstHttpUrl(urls.rawGoogleV360, urls.omadaV360, urls.combined360, urls.v360, urls.rawGoogleV720, urls.combined720, urls.v720);
    } else if (quality === '1080') {
      return firstHttpUrl(urls.rawGoogleV1080, urls.omadaV1080, urls.v1080, urls.rawGoogleV720, urls.omadaV720, urls.v720, urls.combined720, urls.rawGoogleV360, urls.combined360);
    } else {
      return firstHttpUrl(urls.rawGoogleV720, urls.omadaV720, urls.v720, urls.combined720, urls.rawGoogleV360, urls.omadaV360, urls.combined360, urls.v360);
    }
  };

  // Note: Invidious /latest_version only supports muxed itag=18 and audio itag=140
  const fallbackItag = quality === 'audio' ? '140' : '18';

  try {
    const cachedBefore = streamUrlCache.get(id);
    const wasCached = Boolean(cachedBefore && cachedBefore.expiresAt > Date.now());
    let urls = await resolveVideoStreams(id, invidiousUrl);
    let targetUrl = pickTargetUrl(urls);

    const rangeHeader = req.headers.range;
    const fetchUpstream = async (urlToFetch: string) => {
      const reqHeaders: Record<string, string> = {};
      if (urlToFetch.includes('.googlevideo.com') && !urlToFetch.includes('yt.omada.cafe')) {
        if (urlToFetch.includes('c=ANDROID_VR')) {
          reqHeaders['User-Agent'] =
            'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';
        } else if (urlToFetch.includes('c=IOS')) {
          reqHeaders['User-Agent'] =
            'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X; ja_JP)';
        } else {
          reqHeaders['User-Agent'] =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
          reqHeaders['Referer'] = 'https://www.youtube.com/';
        }
      }
      if (rangeHeader) reqHeaders['Range'] = rangeHeader;
      return fetch(urlToFetch, { headers: reqHeaders, redirect: 'follow' });
    };

    let upstream: Response | null = null;
    if (targetUrl && targetUrl.startsWith('http')) {
      try {
        upstream = await fetchUpstream(targetUrl);
      } catch {
        upstream = null;
      }
    }

    // Only re-resolve if we used a previously cached URL that expired/403'd
    if (wasCached && (!upstream || (!upstream.ok && upstream.status !== 206))) {
      streamUrlCache.delete(id);
      ytDlpStreamCache.delete(id);
      urls = await resolveVideoStreams(id, invidiousUrl);
      targetUrl = pickTargetUrl(urls);
      if (targetUrl && targetUrl.startsWith('http')) {
        try {
          upstream = await fetchUpstream(targetUrl);
        } catch {
          upstream = null;
        }
      }
    }

    // If still not ok, try latest_version from yt.omada.cafe directly
    if (!upstream || (!upstream.ok && upstream.status !== 206)) {
      const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
      try {
        upstream = await fetchUpstream(`${cleanInst}/latest_version?id=${id}&itag=${fallbackItag}&local=true`);
      } catch {
        upstream = null;
      }
    }

    if (upstream && (upstream.ok || upstream.status === 206)) {
      res.status(upstream.status);
      upstream.headers.forEach((val, key) => {
        const lower = key.toLowerCase();
        if (['content-range', 'content-length', 'content-type', 'accept-ranges', 'cache-control'].includes(lower)) {
          res.setHeader(key, val);
        }
      });
      if (!res.getHeader('accept-ranges')) {
        res.setHeader('accept-ranges', 'bytes');
      }
      if (!res.getHeader('content-type')) {
        res.setHeader('content-type', quality === 'audio' ? 'audio/mp4' : 'video/mp4');
      }
      if (upstream.body) {
        const reader = upstream.body.getReader();
        req.on('close', () => {
          try { reader.cancel(); } catch {}
        });
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          if (!res.writableEnded) {
            res.write(Buffer.from(value));
          } else {
            break;
          }
        }
        return;
      }
    }

    // Final fallback: redirect to Invidious latest_version proxied stream
    const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
    return res.redirect(302, `${cleanInst}/latest_version?id=${id}&itag=${fallbackItag}&local=true`);
  } catch {
    const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
    return res.redirect(302, `${cleanInst}/latest_version?id=${id}&itag=${fallbackItag}&local=true`);
  }
});

// Stream Video + Audio Multiplexing via FFmpeg (Uses yt.omada.cafe 1080p/720p/360p + high-quality AAC audio)
app.get('/api/youtube/stream-mux/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);
  const quality = req.query.quality === '1080' ? '1080' : req.query.quality === '360' ? '360' : '720';
  const startSec = Math.max(0, Math.floor(Number(req.query.start) || 0));

  activeMuxStreams++;
  totalProcessedStreams++;
  let hasClosed = false;
  const decrement = () => {
    if (!hasClosed) {
      hasClosed = true;
      activeMuxStreams = Math.max(0, activeMuxStreams - 1);
    }
  };
  req.on('close', decrement);
  res.on('finish', decrement);

  try {
    const urls = await resolveVideoStreams(id, invidiousUrl);
    if (!urls) {
      decrement();
      return res.status(502).send('ストリームの取得に失敗しました。');
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const ssArgs = startSec > 0 ? ['-ss', String(startSec)] : [];

    const firstHttp = (...candidates: Array<string | undefined>): string | undefined =>
      candidates.find((u) => typeof u === 'string' && u.startsWith('http'));

    const comb720Http = firstHttp(urls.combined720);
    const comb360Http = firstHttp(urls.rawGoogleV360, urls.omadaV360, urls.combined360);

    // Combined 720p stream
    if (quality === '720' && comb720Http) {
      const ffmpeg = spawn('/usr/bin/ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        ...ssArgs,
        '-i', comb720Http,
        '-c', 'copy',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
      ]);
      ffmpeg.stdout.pipe(res);
      ffmpeg.stderr.on('data', () => {});
      req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
      return;
    }

    // Combined 360p stream
    if (quality === '360' && comb360Http) {
      const ffmpeg = spawn('/usr/bin/ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        ...ssArgs,
        '-i', comb360Http,
        '-c', 'copy',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
      ]);
      ffmpeg.stdout.pipe(res);
      ffmpeg.stderr.on('data', () => {});
      req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
      return;
    }

    // Muxing separate video and audio (prefer direct Google CDN URLs signed for our server IP, then omada)
    const videoUrl =
      (quality === '1080'
        ? firstHttp(urls.rawGoogleV1080, urls.omadaV1080, urls.v1080)
        : quality === '360'
        ? firstHttp(urls.rawGoogleV360, urls.omadaV360, urls.v360, urls.rawGoogleV720, urls.v720)
        : firstHttp(urls.rawGoogleV720, urls.omadaV720, urls.v720)) ||
      firstHttp(urls.rawGoogleV720, urls.rawGoogleV1080, urls.omadaV720, urls.omadaV1080, urls.v720, urls.v1080);
    const audioUrl =
      firstHttp(urls.rawGoogleAudio, urls.omadaAudio, urls.audio, urls.rawGoogleV360, urls.combined720, urls.combined360) ||
      videoUrl;

    if (!videoUrl) {
      return res.status(502).send('動画ストリームURLが見つかりませんでした。');
    }

    const ffmpeg = spawn('/usr/bin/ffmpeg', [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      ...ssArgs,
      '-i', videoUrl,
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      ...ssArgs,
      '-i', audioUrl,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1'
    ]);

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => {});
    req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
  } catch (err: any) {
    console.error('Stream mux error:', err);
    if (!res.headersSent) res.status(500).send(err.message || 'Stream error');
  }
});

// Stream Audio-Only via FFmpeg
app.get('/api/youtube/stream-audio/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);

  activeMuxStreams++;
  totalProcessedStreams++;
  let hasClosed = false;
  const decrement = () => {
    if (!hasClosed) {
      hasClosed = true;
      activeMuxStreams = Math.max(0, activeMuxStreams - 1);
    }
  };
  req.on('close', decrement);
  res.on('finish', decrement);

  try {
    const urls = await resolveVideoStreams(id, invidiousUrl);
    if (!urls || (!urls.omadaAudio && !urls.audio && !urls.combined720 && !urls.combined360)) {
      decrement();
      return res.status(502).send('音声ストリームの取得に失敗しました。');
    }

    const audioSource = urls.omadaAudio || urls.audio || urls.combined720 || urls.combined360;

    res.setHeader('Content-Type', 'audio/aac');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const ffmpeg = spawn('/usr/bin/ffmpeg', [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', audioSource!,
      '-vn',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-f', 'adts',
      'pipe:1'
    ]);

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => {});
    req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
  } catch (err: any) {
    console.error('Stream audio error:', err);
    if (!res.headersSent) res.status(500).send(err.message || 'Stream error');
  }
});

// Direct Worker PoW Guard Routes (/api/__guard/challenge, /api/__guard/verify, /api/__guard/status)
app.all(/^\/api\/__guard(\/.*)?$/, async (req, res) => {
  try {
    const subSuffix = (req.params as any)[0] || '/status';
    const subPath = `/api/__guard${subSuffix}`;
    const queryMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (v !== undefined && v !== null) queryMap[k] = String(v);
    }
    const bodyStr = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : undefined;
    const result = await invokeSelfBuiltInnerTubeWorker(subPath, queryMap, req.method, bodyStr);
    for (const [hk, hv] of Object.entries(result.headers)) {
      res.setHeader(hk, hv);
    }
    return res.status(result.status).send(result.bodyText);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || 'Guard worker error' });
  }
});

// Self-Hosted Stream Engine Endpoints (/api/stream/:id) with Worker PoW Guard Verification
app.get('/api/stream/:id', async (req, res) => {
  const { id } = req.params;
  if (id === 'status') {
    const queueLength = Math.max(0, activeMuxStreams - 2);
    const estimatedWaitSeconds = queueLength * 3;
    return res.json({
      status: 'ok',
      generatedAt: new Date().toISOString(),
      processing: {
        count: activeMuxStreams,
        ids: [],
        longest: null
      },
      activeStreams: activeMuxStreams,
      queueLength,
      estimatedWaitSeconds,
      totalProcessed: totalProcessedStreams,
      message: activeMuxStreams > 0 ? `サーバーで${activeMuxStreams}件を処理中です` : '海斗tube 自作ストリームエンジン稼働中'
    });
  }

  const guardSid = String(req.query.guard_sid || '').trim();
  const requirePow = req.query.require_pow === '1' || req.query.origin === 'kaitotube';
  let verifiedSessionId = guardSid;
  let verifiedUntilSec = Math.floor((Date.now() + 24 * 3600 * 1000) / 1000);

  if (requirePow) {
    try {
      const statusRes = await invokeSelfBuiltInnerTubeWorker('/api/__guard/status', {
        guard_sid: guardSid
      });
      const stData = statusRes.data;
      if (!stData?.verified) {
        return res.status(403).json({
          ok: false,
          code: 'CHALLENGE_REQUIRED',
          sessionId: stData?.sessionId || undefined,
          message: 'Worker PoW challenge verification required'
        });
      }
      verifiedSessionId = stData.sessionId || guardSid;
      verifiedUntilSec = stData.verifiedUntil || verifiedUntilSec;
    } catch {}
  }

  const { invidiousUrl } = getRequestConfig(req);
  const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
  try {
    const urls = await resolveVideoStreams(id, invidiousUrl);
    return res.json({
      ...buildSelfHostedStructuredStreams(id, urls, cleanInst),
      sessionId: verifiedSessionId || undefined,
      verifiedUntil: verifiedUntilSec
    });
  } catch (err: any) {
    return res.json({
      ...buildSelfHostedStructuredStreams(id, null, cleanInst),
      sessionId: verifiedSessionId || undefined,
      verifiedUntil: verifiedUntilSec
    });
  }
});

app.get(['/api/youtube/stream-proxy', '/api/proxy'], async (req, res) => {
  const mediaUrl = req.query.url as string;
  if (!mediaUrl) return res.status(400).send('URL required');

  try {
    const isOmada = mediaUrl.includes('yt.omada.cafe');
    const rangeHeader = req.headers.range;
    const reqHeaders: Record<string, string> = isOmada
      ? {
          Accept: 'application/json, text/plain, */*'
        }
      : {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://www.youtube.com/'
        };
    if (rangeHeader) reqHeaders['Range'] = rangeHeader;

    const upstream = await fetch(mediaUrl, { headers: reqHeaders, redirect: 'follow' });
    res.status(upstream.status);

    upstream.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (['content-range', 'content-length', 'content-type', 'accept-ranges', 'cache-control'].includes(lower)) {
        res.setHeader(key, val);
      }
    });

    if (!res.getHeader('accept-ranges')) {
      res.setHeader('accept-ranges', 'bytes');
    }

    if (upstream.body) {
      const reader = upstream.body.getReader();
      req.on('close', () => {
        try { reader.cancel(); } catch {}
      });
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          break;
        }
        if (!res.writableEnded) {
          res.write(Buffer.from(value));
        } else {
          break;
        }
      }
    } else {
      res.end();
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).send(err.message || 'Stream error');
    } else {
      res.end();
    }
  }
});

// Clear server-side proxy & stream caches for instant recovery
app.post('/api/proxy/clear-cache', (_req, res) => {
  const streamCount = streamUrlCache.size + ytDlpStreamCache.size;
  const thumbCount = serverBase64ThumbnailCache.size;
  streamUrlCache.clear();
  ytDlpStreamCache.clear();
  serverBase64ThumbnailCache.clear();
  return res.json({
    success: true,
    clearedStreams: streamCount,
    clearedThumbnails: thumbCount,
    message: `サーバーキャッシュをクリアしました（ストリーム: ${streamCount}件, サムネイル: ${thumbCount}件）`
  });
});

// Test any Custom Proxy / Cloudflare Worker / Invidious / GAS URL
app.get('/api/proxy/test-custom', async (req, res) => {
  const target = ((req.query.url as string) || '').trim();
  if (!target) {
    return res.status(400).json({ success: false, message: 'テスト対象のURLを指定してください' });
  }
  const start = Date.now();
  try {
    if (target === '/api/worker' || target === 'self') {
      const selfRes = await invokeSelfBuiltInnerTubeWorker('/api/v1/health');
      return res.json({
        success: selfRes.status === 200,
        latencyMs: Date.now() - start,
        type: 'built-in-worker',
        message: 'サーバー内蔵 InnerTube Worker (/api/worker) は正常に稼働しています'
      });
    }
    let cleanUrl = target;
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 7000);

    // Try health or trending or direct URL
    let probeUrl = cleanUrl;
    if (cleanUrl.includes('workers.dev')) {
      probeUrl = `${cleanUrl.replace(/\/+$/, '')}/api/v1/health`;
    } else if (cleanUrl.includes('script.google.com')) {
      const sep = cleanUrl.includes('?') ? '&' : '?';
      probeUrl = `${cleanUrl}${sep}test=1`;
    }

    const upstream = await fetch(probeUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Accept: 'application/json, text/plain, */*'
      },
      redirect: 'follow'
    });
    clearTimeout(tid);
    const latencyMs = Date.now() - start;

    if (upstream.ok || upstream.status === 200) {
      return res.json({
        success: true,
        latencyMs,
        status: upstream.status,
        message: `カスタムプロキシへの疎通に成功しました（応答速度: ${latencyMs}ms / HTTP ${upstream.status}）`
      });
    }
    return res.json({
      success: false,
      latencyMs,
      status: upstream.status,
      message: `カスタムプロキシが HTTP ${upstream.status} を返しました`
    });
  } catch (err: any) {
    return res.json({
      success: false,
      latencyMs: Date.now() - start,
      message: `接続エラー: ${err?.message || 'タイムアウトまたは到達不能'}`
    });
  }
});

// 11. AI Video Summarizer with Gemini
app.post('/api/ai/summarize', async (req, res) => {
  const { title, description, channelTitle, tags } = req.body;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        summary: 'GEMINI_API_KEYが設定されていないため、デフォルト要約を表示します。',
        keyTakeaways: [
          '動画タイトル: ' + (title || 'タイトルなし'),
          'チャンネル: ' + (channelTitle || '不明'),
          'この動画は主要ポイントを効率よく学習できるおすすめ動画です。'
        ]
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `あなたは動画学習アシスタント「海斗tube AI」です。
以下のYouTube動画情報を元に、日本語で分かりやすく動画概要と主要ポイントをまとめてください。

動画タイトル: ${title}
チャンネル名: ${channelTitle}
タグ: ${Array.isArray(tags) ? tags.join(', ') : tags || ''}
概要欄: ${description ? description.slice(0, 1000) : 'なし'}

以下のJSON形式で出力してください:
{
  "summary": "動画の全体要約（200文字程度）",
  "keyTakeaways": [
    "主要ポイント1",
    "主要ポイント2",
    "主要ポイント3"
  ],
  "estimatedTimestamps": [
    {"time": "00:00", "label": "オープニング・イントロ"},
    {"time": "03:15", "label": "核心となるコンセプト解説"},
    {"time": "08:30", "label": "実践・応用とまとめ"}
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '';
    const json = JSON.parse(text);
    return res.json(json);
  } catch (err: any) {
    console.error('AI summarize error:', err);
    return res.json({
      summary: `「${title}」の要約情報です。動画で取り上げられている要点を以下にまとめています。`,
      keyTakeaways: [
        `タイトル: ${title}`,
        `チャンネル: ${channelTitle}`,
        '動画の概要とハイライトを効率的に学習できます。'
      ],
      estimatedTimestamps: [
        { time: '00:00', label: 'イントロダクション' },
        { time: '02:30', label: 'メインコンテンツ' },
        { time: '07:00', label: 'まとめと結論' }
      ]
    });
  }
});

// 12. Base64 Thumbnail Image Proxy & Helper
const serverBase64ThumbnailCache = new Map<string, { dataUri: string; contentType: string; buffer: Buffer }>();

app.all(['/api/proxy/thumbnail', '/api/fetchAsBase64'], async (req, res) => {
  let imageUrl = (req.query.url as string) || (req.body && req.body.url) || '';
  const queryVideoId = ((req.query.videoId as string) || '').trim();
  if (!imageUrl && queryVideoId) {
    imageUrl = `https://i.ytimg.com/vi/${queryVideoId}/hqdefault.jpg`;
  }

  if (!imageUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const extractedVid =
    queryVideoId ||
    imageUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//)?.[1] ||
    '';

  const cacheKey = extractedVid || imageUrl;
  if (serverBase64ThumbnailCache.has(cacheKey)) {
    const cached = serverBase64ThumbnailCache.get(cacheKey)!;
    if (req.query.format === 'json' || req.path === '/api/fetchAsBase64') {
      return res.json({ dataUri: cached.dataUri, success: true });
    }
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(cached.buffer);
  }

  const fetchWithFallback = async (targetUrl: string) => {
    const candidates: string[] = [];
    if (extractedVid) {
      candidates.push(`https://i.ytimg.com/vi/${extractedVid}/hqdefault.jpg`);
      candidates.push(`https://i.ytimg.com/vi/${extractedVid}/mqdefault.jpg`);
    }
    if (targetUrl && !candidates.includes(targetUrl)) {
      candidates.unshift(targetUrl);
    }
    if (extractedVid) {
      const invidiousInstances = ['https://yt.omada.cafe', 'https://invidious.nerdvpn.de', 'https://inv.nadeko.net'];
      for (const inst of invidiousInstances) {
        const u = `${inst}/vi/${extractedVid}/hqdefault.jpg`;
        if (!candidates.includes(u)) candidates.push(u);
      }
    }

    for (const url of candidates) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4500);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://www.youtube.com/'
          }
        });
        clearTimeout(tid);
        if (response.ok) {
          const ct = response.headers.get('content-type') || '';
          if (ct.startsWith('image/') || url.endsWith('.jpg') || url.endsWith('.webp') || url.endsWith('.png')) {
            return response;
          }
        }
      } catch {
        // Try next candidate
      }
    }
    return null;
  };

  try {
    const imageRes = await fetchWithFallback(imageUrl);
    if (!imageRes) {
      throw new Error(`Failed to fetch thumbnail from ${imageUrl}`);
    }

    const arrayBuffer = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const base64 = buffer.toString('base64');
    const dataUri = `data:${contentType};base64,${base64}`;

    if (serverBase64ThumbnailCache.size > 600) {
      const oldestKey = serverBase64ThumbnailCache.keys().next().value;
      if (oldestKey) serverBase64ThumbnailCache.delete(oldestKey);
    }
    serverBase64ThumbnailCache.set(cacheKey, { dataUri, contentType, buffer });

    if (req.query.format === 'json' || req.path === '/api/fetchAsBase64') {
      return res.json({ dataUri, success: true });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('Thumbnail proxy error:', err);
    if (req.query.format === 'json' || req.path === '/api/fetchAsBase64') {
      return res.json({ dataUri: imageUrl, success: false });
    }
    res.redirect(imageUrl);
  }
});

// Server Stream & Queue Status Tracker
let activeMuxStreams = 0;
let totalProcessedStreams = 0;

app.get('/api/stream/status', (_req, res) => {
  const queueLength = Math.max(0, activeMuxStreams - 2);
  const estimatedWaitSeconds = queueLength * 3;
  let message = '海斗tube 自作ストリームエンジン稼働中';

  if (activeMuxStreams > 3) {
    message = `サーバーで${activeMuxStreams}件を処理中です（待ち時間: 約${estimatedWaitSeconds}秒）`;
  } else if (activeMuxStreams > 0) {
    message = `サーバーで${activeMuxStreams}件を処理中です`;
  }

  res.json({
    status: 'ok',
    generatedAt: new Date().toISOString(),
    processing: {
      count: activeMuxStreams,
      ids: [],
      longest: null
    },
    activeStreams: activeMuxStreams,
    queueLength,
    estimatedWaitSeconds,
    totalProcessed: totalProcessedStreams,
    message
  });
});

// Download Info Endpoint for Type 3 Download Modal
app.get('/api/download/info/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);

  try {
    const streamData = await resolveVideoStreams(id, invidiousUrl);
    const m3u8Url = `/api/worker/api/stream/${id}.m3u8`;

    res.json({
      videoId: id,
      title: streamData?.title || `video-${id}`,
      m3u8Url,
      m3u8DevUrl: `https://m3u8.dev/?url=${encodeURIComponent(`https://proxy.wa0260966.workers.dev/api/stream/${id}.m3u8`)}`,
      standard360: `/api/youtube/stream-direct/${id}?quality=360`,
      videoOnly: [
        { label: '1080p (FHD 合体)', quality: '1080p', url: `/api/youtube/stream-mux/${id}?quality=1080` },
        { label: '720p (HD 高速プロキシ)', quality: '720p', url: `/api/youtube/stream-direct/${id}?quality=720` },
        { label: '480p', quality: '480p', url: `/api/youtube/stream-mux/${id}?quality=480` },
        { label: '360p (軽量高速プロキシ)', quality: '360p', url: `/api/youtube/stream-direct/${id}?quality=360` },
      ],
      audioOnly: [
        { label: '音声 AAC/M4A (標準)', format: 'm4a', url: `/api/youtube/stream-direct/${id}?quality=audio` },
        { label: '音声 AAC 変換ストリーム', format: 'aac', url: `/api/youtube/stream-audio/${id}` },
        { label: '音声 原音ストリーム', format: 'webm', url: `/api/youtube/stream-direct/${id}?quality=audio` }
      ],
      subtitles: [
        { label: '日本語字幕 (VTT)', lang: 'ja', url: `/api/worker/api/subtitles/${id}?lang=ja` },
        { label: '英語字幕 (VTT)', lang: 'en', url: `/api/worker/api/subtitles/${id}?lang=en` },
        { label: '自動生成字幕 (VTT)', lang: 'auto', url: `/api/worker/api/subtitles/${id}?lang=auto` }
      ]
    });
  } catch (err: any) {
    res.json({
      videoId: id,
      title: `video-${id}`,
      m3u8Url: `/api/worker/api/stream/${id}.m3u8`,
      m3u8DevUrl: `https://m3u8.dev/?url=${encodeURIComponent(`https://proxy.wa0260966.workers.dev/api/stream/${id}.m3u8`)}`,
      standard360: `/api/youtube/stream-direct/${id}?quality=360`,
      videoOnly: [
        { label: '720p (HD)', quality: '720p', url: `/api/youtube/stream-direct/${id}?quality=720` },
        { label: '360p', quality: '360p', url: `/api/youtube/stream-direct/${id}?quality=360` }
      ],
      audioOnly: [
        { label: '音声 AAC/M4A', format: 'm4a', url: `/api/youtube/stream-direct/${id}?quality=audio` }
      ],
      subtitles: [
        { label: '日本語字幕 (VTT)', lang: 'ja', url: `/api/worker/api/subtitles/${id}?lang=ja` }
      ]
    });
  }
});

// Self-Built InnerTube Cloudflare Worker Code & Direct Mount Endpoint (/api/worker/*)
app.get('/api/worker/code', (_req, res) => {
  try {
    const workerJsPath = path.join(process.cwd(), 'cloudflare-worker', 'worker.js');
    const wranglerPath = path.join(process.cwd(), 'cloudflare-worker', 'wrangler.toml');
    const workerJs = fs.existsSync(workerJsPath) ? fs.readFileSync(workerJsPath, 'utf-8') : '';
    const wranglerToml = fs.existsSync(wranglerPath) ? fs.readFileSync(wranglerPath, 'utf-8') : '';
    return res.json({
      success: true,
      workerJs,
      wranglerToml
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.all(/^\/api\/worker(\/.*)?$/, async (req, res) => {
  try {
    const subPath = (req.params as any)[0] || '/api/v1/health';
    const queryMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (v !== undefined && v !== null) queryMap[k] = String(v);
    }
    const extraHeaders: Record<string, string> = {};
    if (req.headers.range) extraHeaders['Range'] = String(req.headers.range);
    const bodyStr = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : undefined;
    const result = await invokeSelfBuiltInnerTubeWorker(subPath, queryMap, req.method, bodyStr, extraHeaders);
    for (const [hk, hv] of Object.entries(result.headers)) {
      res.setHeader(hk, hv);
    }
    if (result.status >= 300 && result.status < 400 && result.headers.location) {
      return res.redirect(result.status, result.headers.location);
    }
    if (result.buffer) {
      return res.status(result.status).send(result.buffer);
    }
    return res.status(result.status).send(result.bodyText);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Self InnerTube Worker error' });
  }
});

// InnerTube API & Proxy Health Diagnostic Endpoint (Keyless)
app.all(['/api/innertube/test', '/api/youtube/test-key'], async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const isSelfWorker =
    !innertubeUrl ||
    innertubeUrl === '/api/worker' ||
    innertubeUrl === '/api/worker/' ||
    innertubeUrl === 'self';
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, 'trending');
    if (itRes.data && Array.isArray(itRes.data) && itRes.data.length > 0) {
      return res.json({
        valid: true,
        status: 'ok',
        engine: isSelfWorker
          ? '海斗tube 自作 InnerTube Worker (内蔵エンジン)'
          : `海斗tube カスタム InnerTube Cloudflare Worker (${innertubeUrl})`,
        message: isSelfWorker
          ? `自作 InnerTube Worker (内蔵エンジン) への高速疎通に成功しました！外部プロキシ依存ゼロ・APIキー不要で稼働中です（取得件数: ${itRes.data.length}件）。`
          : `指定された InnerTube Worker (${innertubeUrl}) への高速疎通に成功しました！（取得件数: ${itRes.data.length}件）`,
        trendingCount: itRes.data.length
      });
    }

    // Try direct call
    const directRes = await callInnerTubeDirect('browse', { browseId: 'FEtrending' });
    if (directRes.data) {
      return res.json({
        valid: true,
        status: 'ok',
        engine: 'InnerTube API Direct',
        message: 'YouTube公式内部 InnerTube エンドポイントへの直接通信に成功しました！キー不要で安定稼働中です。'
      });
    }

    return res.json({
      valid: false,
      status: 'error',
      engine: 'InnerTube API',
      message: 'InnerTube プロキシへの接続に応答がありませんでした。別のインスタンスURLをお試しください。'
    });
  } catch (err: any) {
    return res.status(200).json({
      valid: false,
      status: 'network_error',
      message: 'InnerTube API サーバーへの通信に失敗しました: ' + (err.message || '')
    });
  }
});

// =======================================================
// ★ Public / Private Shared Playlists & Clone Registry API
// =======================================================
interface ServerStoredPlaylist {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt?: string;
  visibility: 'public' | 'private';
  isPublic: boolean;
  authorName?: string;
  cloneCount?: number;
  sourcePlaylistId?: string;
  videos: any[];
}

const PUBLIC_PLAYLISTS_FILE = path.join(process.cwd(), '.cache_public_playlists.json');

const SEED_PUBLIC_PLAYLISTS: ServerStoredPlaylist[] = [
  {
    id: 'public_vocaloid_hits_2025',
    title: 'ボカロ・J-POP 神曲セレクト（作業用・勉強用BGM）',
    description: '勉強中やコーディング中に聴きたい定番ボカロ＆J-POPの人気曲プレイリストです。自由に複製（Clone）してカスタマイズしてください！',
    createdAt: '2025/02/15',
    updatedAt: '2025/02/15',
    visibility: 'public',
    isPublic: true,
    authorName: '海斗tube 公式キュレーター',
    cloneCount: 42,
    videos: [
      {
        id: 'CbH2F0kXgTY',
        kind: 'youtube#video',
        snippet: {
          publishedAt: '2023-04-12T11:00:00Z',
          channelId: 'UCAYrMNl92jw6cpjdpBP8JyA',
          title: 'YOASOBI「アイドル」 Official Music Video',
          description: '',
          channelTitle: 'Ayase / YOASOBI',
          thumbnails: {
            high: { url: 'https://i.ytimg.com/vi/CbH2F0kXgTY/hqdefault.jpg' },
            medium: { url: 'https://i.ytimg.com/vi/CbH2F0kXgTY/mqdefault.jpg' },
            default: { url: 'https://i.ytimg.com/vi/CbH2F0kXgTY/default.jpg' }
          }
        },
        contentDetails: { duration: 'PT3M46S' }
      },
      {
        id: 'IMP1hTW-I5w',
        kind: 'youtube#video',
        snippet: {
          publishedAt: '2019-05-15T10:00:00Z',
          channelId: 'UCae_RL2_yB5G8C7-fL13Z5w',
          title: 'Official髭男dism - Pretender［Official Video］',
          description: '',
          channelTitle: 'Official髭男dism',
          thumbnails: {
            high: { url: 'https://i.ytimg.com/vi/IMP1hTW-I5w/hqdefault.jpg' },
            medium: { url: 'https://i.ytimg.com/vi/IMP1hTW-I5w/mqdefault.jpg' },
            default: { url: 'https://i.ytimg.com/vi/IMP1hTW-I5w/default.jpg' }
          }
        },
        contentDetails: { duration: 'PT5M27S' }
      },
      {
        id: 'M2cckDmNLMI',
        kind: 'youtube#video',
        snippet: {
          publishedAt: '2022-10-11T15:00:00Z',
          channelId: 'UC6pGDc4bFGD1_36IKv3FnYg',
          title: '米津玄師 - KICK BACK',
          description: '',
          channelTitle: 'Kenshi Yonezu 米津玄師',
          thumbnails: {
            high: { url: 'https://i.ytimg.com/vi/M2cckDmNLMI/hqdefault.jpg' },
            medium: { url: 'https://i.ytimg.com/vi/M2cckDmNLMI/mqdefault.jpg' },
            default: { url: 'https://i.ytimg.com/vi/M2cckDmNLMI/default.jpg' }
          }
        },
        contentDetails: { duration: 'PT3M14S' }
      }
    ]
  },
  {
    id: 'public_lofi_focus_beats',
    title: '深夜の集中 Lo-Fi & Chill Beats コレクション',
    description: '広告なしで長時間集中したいときのためのLo-Fi HipHop・環境音プレイリスト。',
    createdAt: '2025/02/18',
    updatedAt: '2025/02/18',
    visibility: 'public',
    isPublic: true,
    authorName: 'Study Chill Lab',
    cloneCount: 29,
    videos: [
      {
        id: 'jfKfPfyJRdk',
        kind: 'youtube#video',
        snippet: {
          publishedAt: '2022-07-12T00:00:00Z',
          channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
          title: 'lofi hip hop radio 📚 - beats to relax/study to',
          description: '',
          channelTitle: 'Lofi Girl',
          thumbnails: {
            high: { url: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg' },
            medium: { url: 'https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg' },
            default: { url: 'https://i.ytimg.com/vi/jfKfPfyJRdk/default.jpg' }
          }
        },
        contentDetails: { duration: 'PT0M0S' }
      },
      {
        id: '5yx6BWlEVcY',
        kind: 'youtube#video',
        snippet: {
          publishedAt: '2021-03-01T00:00:00Z',
          channelId: 'UC5nc_ZtjKW1htCVZVRxlQAQ',
          title: 'Chillhop Radio - jazzy & lofi hip hop beats 🐾',
          description: '',
          channelTitle: 'Chillhop Music',
          thumbnails: {
            high: { url: 'https://i.ytimg.com/vi/5yx6BWlEVcY/hqdefault.jpg' },
            medium: { url: 'https://i.ytimg.com/vi/5yx6BWlEVcY/mqdefault.jpg' },
            default: { url: 'https://i.ytimg.com/vi/5yx6BWlEVcY/default.jpg' }
          }
        },
        contentDetails: { duration: 'PT0M0S' }
      }
    ]
  }
];

function loadServerPlaylists(): Map<string, ServerStoredPlaylist> {
  const map = new Map<string, ServerStoredPlaylist>();
  for (const seed of SEED_PUBLIC_PLAYLISTS) {
    map.set(seed.id, seed);
  }
  try {
    if (fs.existsSync(PUBLIC_PLAYLISTS_FILE)) {
      const raw = fs.readFileSync(PUBLIC_PLAYLISTS_FILE, 'utf-8');
      const parsed: ServerStoredPlaylist[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.id) {
            map.set(item.id, item);
          }
        }
      }
    }
  } catch {}
  return map;
}

const serverPlaylistsRegistry = loadServerPlaylists();

function persistServerPlaylists() {
  try {
    const arr = Array.from(serverPlaylistsRegistry.values());
    fs.writeFileSync(PUBLIC_PLAYLISTS_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch {}
}

// GET /api/playlists/public - List all public playlists
app.get('/api/playlists/public', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const list = Array.from(serverPlaylistsRegistry.values()).filter(
    (pl) => (pl.visibility === 'public' || pl.isPublic) && Array.isArray(pl.videos)
  );
  const filtered = q
    ? list.filter(
        (pl) =>
          (pl.title || '').toLowerCase().includes(q) ||
          (pl.description || '').toLowerCase().includes(q) ||
          (pl.authorName || '').toLowerCase().includes(q)
      )
    : list;

  return res.json({
    items: filtered.reverse()
  });
});

// GET /api/playlists/:id - Fetch a shared playlist by ID
app.get('/api/playlists/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const found = serverPlaylistsRegistry.get(id);
  if (!found || (found.visibility === 'private' && !found.isPublic)) {
    return res.status(404).json({ error: '公開プレイリストが見つからないか、非公開に設定されています。' });
  }
  return res.json({ playlist: found });
});

// POST /api/playlists/publish - Publish or update a public playlist
app.post('/api/playlists/publish', (req, res) => {
  const pl = req.body?.playlist;
  if (!pl || !pl.id || !pl.title) {
    return res.status(400).json({ error: 'Invalid playlist payload' });
  }
  const existing = serverPlaylistsRegistry.get(String(pl.id));
  const record: ServerStoredPlaylist = {
    id: String(pl.id),
    title: String(pl.title).slice(0, 120),
    description: String(pl.description || '').slice(0, 500),
    createdAt: String(pl.createdAt || existing?.createdAt || new Date().toLocaleDateString('ja-JP')),
    updatedAt: new Date().toLocaleDateString('ja-JP'),
    visibility: 'public',
    isPublic: true,
    authorName: String(pl.authorName || existing?.authorName || '海斗tube ユーザー').slice(0, 60),
    cloneCount: typeof existing?.cloneCount === 'number' ? existing.cloneCount : Number(pl.cloneCount || 0),
    sourcePlaylistId: pl.sourcePlaylistId ? String(pl.sourcePlaylistId) : existing?.sourcePlaylistId,
    videos: Array.isArray(pl.videos) ? pl.videos.slice(0, 200) : []
  };
  serverPlaylistsRegistry.set(record.id, record);
  persistServerPlaylists();
  return res.json({ success: true, playlist: record });
});

// POST /api/playlists/:id/unpublish - Switch a playlist to private (remove from public listing)
app.post('/api/playlists/:id/unpublish', (req, res) => {
  const id = String(req.params.id || '').trim();
  const existing = serverPlaylistsRegistry.get(id);
  if (existing) {
    existing.visibility = 'private';
    existing.isPublic = false;
    serverPlaylistsRegistry.set(id, existing);
    persistServerPlaylists();
  }
  return res.json({ success: true });
});

// POST /api/playlists/:id/clone - Increment clone counter on a public playlist
app.post('/api/playlists/:id/clone', (req, res) => {
  const id = String(req.params.id || '').trim();
  const existing = serverPlaylistsRegistry.get(id);
  if (existing) {
    existing.cloneCount = (existing.cloneCount || 0) + 1;
    serverPlaylistsRegistry.set(id, existing);
    persistServerPlaylists();
    return res.json({ success: true, cloneCount: existing.cloneCount, playlist: existing });
  }
  return res.json({ success: true, cloneCount: 1 });
});

export default app;
