import React, { useState, useEffect } from 'react';
import {
  extractThumbnailUrl,
  fetchImageAsBase64,
  isBase64ThumbnailsEnabled
} from '../utils/thumbnail';
import {
  getThumbnailFromIndexedDB,
  cacheThumbnailFromUrl
} from '../utils/indexedDbThumbnailStorage';

type ThumbnailQuality = 'high' | 'medium' | 'default';

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

  const [src, setSrc] = useState<string>(rawUrl);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!rawUrl) return;

    // Check IndexedDB cache first for offline capability
    getThumbnailFromIndexedDB(rawUrl).then((cachedBlob) => {
      if (isMounted && cachedBlob) {
        setSrc(cachedBlob);
        return;
      }

      if (useBase64 && !rawUrl.startsWith('data:')) {
        fetchImageAsBase64(rawUrl).then((b64) => {
          if (isMounted && b64) {
            setSrc(b64);
          }
        });
      } else {
        setSrc(rawUrl);
      }

      // Asynchronously store binary ArrayBuffer into IndexedDB for offline access
      cacheThumbnailFromUrl(rawUrl, effectiveVideoId);
    });

    return () => {
      isMounted = false;
    };
  }, [rawUrl, useBase64, settingsVersion, effectiveVideoId]);

  const handleError = () => {
    if (!hasError) {
      setHasError(true);
      // Fallback strategies:
      // 0. Check if IndexedDB has cached version under videoId
      if (effectiveVideoId) {
        getThumbnailFromIndexedDB(effectiveVideoId).then((blobUrl) => {
          if (blobUrl) {
            setSrc(blobUrl);
            return;
          }
          // 1. If Invidious URL failed, try YouTube fallback
          if (!src.includes('i.ytimg.com')) {
            setSrc(`https://i.ytimg.com/vi/${effectiveVideoId}/hqdefault.jpg`);
          } else if (fallbackUrl && src !== fallbackUrl) {
            setSrc(fallbackUrl);
          } else {
            // Generic YouTube placeholder
            setSrc('https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&auto=format&fit=crop&q=80');
          }
        });
        return;
      }

      if (fallbackUrl && src !== fallbackUrl) {
        setSrc(fallbackUrl);
      } else {
        setSrc('https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&auto=format&fit=crop&q=80');
      }
    }
  };

  return (
    <img
      src={src || rawUrl}
      alt={alt}
      className={className}
      loading={loading}
      onError={handleError}
      referrerPolicy="no-referrer"
    />
  );
};
