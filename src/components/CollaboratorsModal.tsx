import React from 'react';
import { X, Users, ExternalLink, CheckCircle2, UserCheck } from 'lucide-react';
import { YouTubeVideoItem } from '../types';

export interface CollaboratorInfo {
  name: string;
  channelId?: string;
  avatarUrl?: string;
  subscribers?: string;
  role?: string;
}

interface CollaboratorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  video?: YouTubeVideoItem;
  videoId?: string;
  channelId?: string;
  channelTitle?: string;
  description?: string;
  onSelectChannel: (channelId: string) => void;
}

export const CollaboratorsModal: React.FC<CollaboratorsModalProps> = ({
  isOpen,
  onClose,
  video,
  channelId: propChannelId,
  channelTitle: propChannelTitle,
  description: propDescription,
  onSelectChannel
}) => {
  if (!isOpen) return null;

  const mainAuthor = propChannelTitle || video?.snippet?.channelTitle || 'メインクリエイター';
  const mainChannelId = propChannelId || video?.snippet?.channelId || '';

  // Extract potential collaborators from description or tags
  const description = propDescription || video?.snippet?.description || '';
  const collaborators: CollaboratorInfo[] = [
    {
      name: mainAuthor,
      channelId: mainChannelId,
      subscribers: 'メイン投稿者',
      role: '主催 / 投稿者'
    }
  ];

  // Regex check for mentions like @channel, feat. XXX, with XXX
  const featMatches = (video.snippet?.title || '').match(/(?:feat\.|ft\.|with|×|コラボ|guest:?)\s*([^()\[\]\n\r]+)/i);
  if (featMatches && featMatches[1]) {
    const rawNames = featMatches[1].split(/[,/&×]/);
    rawNames.forEach((n) => {
      const clean = n.trim();
      if (clean && clean.length < 30 && clean !== mainAuthor) {
        collaborators.push({
          name: clean,
          role: '共同参加クリエイター'
        });
      }
    });
  }

  // Check description for lines like "出演:", "Vocal:", "Music:", "Illustration:"
  const descLines = description.split('\n');
  for (const line of descLines) {
    const colMatch = line.match(/(?:出演|Vocal|Music|Mix|イラスト|Movie|Guest|参加者|編集)[:：]\s*(.+)/i);
    if (colMatch && colMatch[1]) {
      const val = colMatch[1].trim();
      if (val && val.length < 40 && !collaborators.some((c) => c.name === val)) {
        collaborators.push({
          name: val,
          role: line.split(/[:：]/)[0].trim()
        });
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight">コラボレーター一覧</h3>
              <p className="text-xs text-neutral-400">共同参加クリエイター・スタッフ情報</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-2.5 overflow-y-auto">
          {collaborators.map((c, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3.5 bg-neutral-950/60 rounded-xl border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-300 font-bold text-sm">
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                    <span>{c.name}</span>
                    {idx === 0 && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
                  </div>
                  <div className="text-[11px] text-neutral-400">{c.role}</div>
                </div>
              </div>

              {c.channelId ? (
                <button
                  onClick={() => {
                    onClose();
                    onSelectChannel(c.channelId!);
                  }}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>チャンネル</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              ) : (
                <span className="text-[11px] text-neutral-500 px-2">クレジット</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
