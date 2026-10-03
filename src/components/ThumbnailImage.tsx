import React, { useState, useEffect } from 'react';
import {
  extractThumbnailUrl,
  fetchImageAsBase64,
  getCachedBase64Thumbnail,
  isBase64ThumbnailsEnabled
} from '../utils/thumbnail';
import { getThumbnailFromIndexedDB } from '../utils/indexedDbThumbnailStorage';

type ThumbnailQuality = 'high' | 'medium' | 'default';

const TRANSPARENT_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

interface ThumbnailImageProps {
  video?: any;
  videoId?: string;
  fallbackUrl?: string;
  alt?: string;
  className?: string;
  quality?: ThumbnailQuality;
  loading?: 'lazy' | 'eager';
}

export const ThumbnailImage: React.FC<ThumbnailImageProps> = ({
  video,
  videoId,
  fallbackUrl = '',
  alt = '',
  className = '',
  quality = 'high',
  loading = 'lazy'
}) => {
  const [useBase64, setUseBase64] = useState(isBase64ThumbnailsEnabled);
  const [settingsVersion, setSettingsVersion] = useState(0);

  // Listen for setting changes from SettingsModal
  useEffect(() => {
    const handleUpdate = () => {
      setUseBase64(isBase64ThumbnailsEnabled());
      setSettingsVersion((v) => v + 1);
    };
    window.addEventListener('kaito_base64_changed', handleUpdate);
    window.addEventListener('kaito_invidious_thumb_changed', handleUpdate);
    return () => {
      window.removeEventListener('kaito_base64_changed', handleUpdate);
      window.removeEventListener('kaito_invidious_thumb_changed', handleUpdate);
    };
  }, []);

  // Determine raw thumbnail URL (Invidious-preferred)
  let rawUrl = fallbackUrl;
  let effectiveVideoId = videoId || '';

  const safeQuality: ThumbnailQuality =
    quality === 'medium' || quality === 'default' ? quality : 'high';

  if (video) {
    const extracted = extractThumbnailUrl(video, safeQuality);
    rawUrl = extracted.url || fallbackUrl;
    if (!effectiveVideoId) effectiveVideoId = extracted.videoId;
  } else if (videoId) {
    const extracted = extractThumbnailUrl({ id: videoId }, safeQuality);
    rawUrl = extracted.url || fallbackUrl;
  }

  const initialCached = getCachedBase64Thumbnail(rawUrl, effectiveVideoId);
  const [src, setSrc] = useState<string>(() => {
    if (initialCached) return initialCached;
    if (!useBase64) return rawUrl;
    if (rawUrl && rawUrl.startsWith('data:')) return rawUrl;
    return TRANSPARENT_PLACEHOLDER;
  });
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setHasError(false);

    if (!rawUrl && !effectiveVideoId) {
      setSrc(TRANSPARENT_PLACEHOLDER);
      return;
    }

    const syncCached = getCachedBase64Thumbnail(rawUrl, effectiveVideoId);
    if (syncCached && syncCached.startsWith('data:')) {
      setSrc(syncCached);
      return;
    }

    if (useBase64) {
      fetchImageAsBase64(rawUrl, effectiveVideoId).then((b64) => {
        if (isMounted && b64) {
          setSrc(b64);
        }
      });
    } else {
      getThumbnailFromIndexedDB(rawUrl || effectiveVideoId).then((cachedDataUri) => {
        if (isMounted && cachedDataUri) {
          setSrc(cachedDataUri);
        } else if (isMounted) {
          setSrc(rawUrl);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [rawUrl, useBase64, settingsVersion, effectiveVideoId]);

  const handleError = () => {
    if (!hasError) {
      setHasError(true);
      if (effectiveVideoId) {
        const ytFallback = `https://i.ytimg.com/vi/${effectiveVideoId}/hqdefault.jpg`;
        if (useBase64) {
          fetchImageAsBase64(ytFallback, effectiveVideoId).then((b64) => {
            if (b64) setSrc(b64);
          });
        } else {
          setSrc(ytFallback);
        }
        return;
      }

      if (fallbackUrl && src !== fallbackUrl) {
        if (useBase64) {
          fetchImageAsBase64(fallbackUrl).then((b64) => {
            if (b64) setSrc(b64);
          });
        } else {
          setSrc(fallbackUrl);
        }
      }
    }
  };

  return (
    <img
      src={src || TRANSPARENT_PLACEHOLDER}
      alt={alt}
      className={className}
      loading={loading}
      onError={handleError}
      referrerPolicy="no-referrer"
    />
  );
};
