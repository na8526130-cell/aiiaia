export interface YouTubeThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YouTubeThumbnails {
  default?: YouTubeThumbnail;
  medium?: YouTubeThumbnail;
  high?: YouTubeThumbnail;
  standard?: YouTubeThumbnail;
  maxres?: YouTubeThumbnail;
}

export interface YouTubeVideoSnippet {
  publishedAt: string;
  channelId: string;
  title: string;
  description: string;
  thumbnails: YouTubeThumbnails;
  channelTitle: string;
  channelThumbnail?: string;
  animatedThumbnailUrl?: string;
  tags?: string[];
  categoryId?: string;
  liveBroadcastContent?: string;
  defaultLanguage?: string;
  localized?: {
    title: string;
    description: string;
  };
}

export interface YouTubeVideoStatistics {
  viewCount: string;
  likeCount?: string;
  dislikeCount?: string;
  favoriteCount?: string;
  commentCount?: string;
}

export interface YouTubeContentDetails {
  duration: string; // ISO 8601 e.g. PT15M33S
  dimension?: string;
  definition?: string;
  caption?: string;
  licensedContent?: boolean;
  itemCount?: number;
}

export interface YouTubeVideoItem {
  id: string; // or object with videoId if search result
  kind?: string;
  isPlaylist?: boolean;
  playlistId?: string;
  firstVideoId?: string;
  videoCountText?: string;
  customPlaylistTitle?: string;
  customPlaylistItems?: YouTubeVideoItem[];
  watchedAt?: string;
  isShort?: boolean;
  liveNow?: boolean;
  lengthSeconds?: number;
  authorThumbnail?: string;
  animatedThumbnailUrl?: string;
  subscriberCount?: string;
  snippet: YouTubeVideoSnippet;
  statistics?: YouTubeVideoStatistics;
  contentDetails?: YouTubeContentDetails;
}

export interface YouTubeSearchResultItem {
  id: {
    kind: string;
    videoId?: string;
    channelId?: string;
    playlistId?: string;
  } | string;
  snippet: YouTubeVideoSnippet;
}

export interface YouTubeCommentSnippet {
  authorDisplayName: string;
  authorProfileImageUrl: string;
  authorChannelUrl?: string;
  authorChannelId?: {
    value: string;
  };
  videoId: string;
  textDisplay: string;
  textOriginal: string;
  canRate: boolean;
  viewerRating: string;
  likeCount: number;
  publishedAt: string;
  updatedAt: string;
}

export interface YouTubeCommentThreadItem {
  id: string;
  snippet: {
    videoId: string;
    topLevelComment: {
      id: string;
      snippet: YouTubeCommentSnippet;
    };
    totalReplyCount?: number;
    isPublic?: boolean;
  };
  replies?: {
    comments: {
      id: string;
      snippet: YouTubeCommentSnippet;
    }[];
  };
}

export interface YouTubeChannelSnippet {
  title: string;
  description: string;
  customUrl?: string;
  publishedAt: string;
  thumbnails: YouTubeThumbnails;
  country?: string;
}

export interface YouTubeChannelStatistics {
  viewCount: string;
  subscriberCount: string;
  hiddenSubscriberCount: boolean;
  videoCount: string;
}

export interface YouTubeChannelItem {
  id: string;
  snippet: YouTubeChannelSnippet;
  statistics: YouTubeChannelStatistics;
  brandingSettings?: {
    image?: {
      bannerExternalUrl?: string;
    };
  };
}

export interface YouTubeCategoryItem {
  id: string;
  snippet: {
    title: string;
    assignable: boolean;
    channelId: string;
  };
}

export interface YouTubePlaylistItem {
  id: string;
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: YouTubeThumbnails;
    channelTitle: string;
    playlistId: string;
    position: number;
    resourceId: {
      kind: string;
      videoId: string;
    };
  };
}

export interface SearchFilters {
  query: string;
  order: 'relevance' | 'date' | 'viewCount' | 'rating' | 'title';
  type: 'all' | 'video' | 'channel' | 'playlist';
  videoDuration: 'any' | 'short' | 'medium' | 'long';
  categoryId: string;
  regionCode: string;
  publishedAfter?: string;
}

export interface StudyNote {
  id: string;
  videoId: string;
  timestamp: number; // in seconds
  timestampText: string;
  content: string;
  createdAt: string;
}

export interface UserCustomPlaylist {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt?: string;
  visibility?: 'public' | 'private';
  isPublic?: boolean;
  authorName?: string;
  sharedId?: string;
  cloneCount?: number;
  sourcePlaylistId?: string;
  videos: YouTubeVideoItem[];
}

export type PlaybackMode =
  | 'education'
  | 'nocookie'
  | 'standard'
  | 'nocookie-origin'
  | 'embed-direct'
  | 'stream-sync'
  | 'stream-normal'
  | 'stream-high'
  | 'stream-ytdlp'
  | 'stream-360'
  | 'stream-audio'
  | 'normal'
  | 'focus';

export interface VideoStreamItem {
  url: string;
  directUrl?: string;
  quality?: string;
  container?: string;
  bitrate?: number;
  audioBitrate?: number;
}

export interface VideoStreamData {
  videoId: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  lowStream?: VideoStreamItem | null;
  normalStream?: VideoStreamItem | null;
  highStream?: VideoStreamItem | null;
  audioStream?: VideoStreamItem | null;
  streams?: any[];
}

export interface ApiSettings {
  provider: 'innertube' | 'invidious';
  innertubeUrl?: string;
  invidiousUrl: string;
}

export type DisguisePreset = 'classroom';

export interface DisguisePresetConfig {
  id: DisguisePreset;
  name: string;
  tabTitle: string;
  faviconUrl: string;
  description: string;
}

export interface TranscriptItem {
  start: number;
  duration: number;
  text: string;
}

export interface TranscriptResponse {
  language?: string;
  languageCode?: string;
  items: TranscriptItem[];
  message?: string;
}


