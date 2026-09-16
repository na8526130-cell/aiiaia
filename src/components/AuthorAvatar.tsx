import React, { useState } from 'react';

interface AuthorAvatarProps {
  src?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Stable background colors matching YouTube/Google design
const AVATAR_BG_COLORS = [
  'bg-emerald-600',
  'bg-blue-600',
  'bg-indigo-600',
  'bg-violet-600',
  'bg-purple-600',
  'bg-pink-600',
  'bg-rose-600',
  'bg-orange-600',
  'bg-amber-600',
  'bg-teal-600',
  'bg-cyan-600'
];

function getAvatarColor(name: string): string {
  if (!name) return 'bg-neutral-700';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_BG_COLORS.length;
  return AVATAR_BG_COLORS[index];
}

function getInitial(name: string): string {
  if (!name) return '?';
  // Remove leading @ if present
  const clean = name.replace(/^@/, '').trim();
  if (!clean) return '?';
  // Return first character (handles full-width Japanese and Latin)
  return clean.charAt(0).toUpperCase();
}

export function AuthorAvatar({ src, name = 'ユーザー', size = 'md', className = '' }: AuthorAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const [attemptProxy, setAttemptProxy] = useState(false);

  // Normalize image URL
  let validSrc = src?.trim();
  if (validSrc && validSrc.includes('unsplash.com')) {
    validSrc = undefined;
  }

  if (validSrc && validSrc.startsWith('//')) {
    validSrc = 'https:' + validSrc;
  } else if (validSrc && validSrc.startsWith('/ggpht/')) {
    validSrc = 'https://yt3.ggpht.com' + validSrc.replace('/ggpht', '');
  }

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm font-bold'
  };

  const bgColor = getAvatarColor(name);
  const initial = getInitial(name);

  if (!validSrc || imgError) {
    return (
      <div
        className={`${sizeClasses[size]} ${bgColor} rounded-full flex items-center justify-center font-bold text-white uppercase shrink-0 select-none shadow-sm ${className}`}
        title={name}
      >
        {initial}
      </div>
    );
  }

  const effectiveSrc = attemptProxy
    ? `/api/proxy/thumbnail?url=${encodeURIComponent(validSrc)}`
    : validSrc;

  return (
    <img
      src={effectiveSrc}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!attemptProxy && validSrc && !validSrc.startsWith('data:')) {
          setAttemptProxy(true);
        } else {
          setImgError(true);
        }
      }}
      className={`${sizeClasses[size]} rounded-full object-cover shrink-0 bg-neutral-800 border border-neutral-700/50 ${className}`}
    />
  );
}
