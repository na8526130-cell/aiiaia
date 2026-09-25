import React from 'react';

export type BadgeType = 'CHECK_CIRCLE_THICK' | 'AUDIO_BADGE';

interface ChannelBadgeProps {
  channelTitle?: string;
  isArtist?: boolean;
  isVerified?: boolean;
  badgeType?: BadgeType;
  className?: string;
}

/**
 * Checks if a channel represents an official music artist or a verified creator
 */
export function determineBadgeType(
  channelTitle?: string,
  isArtist?: boolean,
  isVerified?: boolean,
  explicitBadge?: BadgeType
): BadgeType | null {
  if (explicitBadge) return explicitBadge;

  const title = (channelTitle || '').trim();

  // 1. Artist detection (音符マーク AUDIO_BADGE)
  if (
    isArtist ||
    title.endsWith('- Topic') ||
    title.endsWith(' - トピック') ||
    title.includes('VEVO') ||
    title.toLowerCase().includes('official artist') ||
    title.toLowerCase().includes('official music') ||
    title.includes('公式アーティスト')
  ) {
    return 'AUDIO_BADGE';
  }

  // 2. Verified detection (通常公式マーク CHECK_CIRCLE_THICK)
  if (
    isVerified ||
    title.includes('Official') ||
    title.includes('公式') ||
    title.includes('チャンネル') ||
    title.includes('Channel') ||
    title.includes('NEWS') ||
    title.includes('News') ||
    title.includes('TV')
  ) {
    return 'CHECK_CIRCLE_THICK';
  }

  return null;
}

export const ChannelBadge: React.FC<ChannelBadgeProps> = ({
  channelTitle,
  isArtist,
  isVerified,
  badgeType: propBadgeType,
  className = ''
}) => {
  const badge = determineBadgeType(channelTitle, isArtist, isVerified, propBadgeType);

  if (!badge) return null;

  if (badge === 'AUDIO_BADGE') {
    return (
      <span
        className={`inline-flex items-center text-neutral-400 hover:text-white transition-colors cursor-default ${className}`}
        title="公式アーティスト チャンネル (AUDIO_BADGE)"
        aria-label="公式アーティスト チャンネル"
      >
        <svg
          className="w-3.5 h-3.5 fill-current shrink-0"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* YouTube Official Artist Eighth Note Audio Badge */}
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center text-neutral-400 hover:text-white transition-colors cursor-default ${className}`}
      title="確認済みチャンネル (CHECK_CIRCLE_THICK 公式マーク)"
      aria-label="確認済みチャンネル"
    >
      <svg
        className="w-3.5 h-3.5 fill-current shrink-0"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* YouTube Standard Verified Check Circle Thick Badge */}
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
      </svg>
    </span>
  );
};
