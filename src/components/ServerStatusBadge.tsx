import React, { useState, useEffect } from 'react';
import { Activity, Server, Clock, AlertTriangle } from 'lucide-react';
import { customFetch } from '../utils/apiClient';

interface ServerStatus {
  status: 'idle' | 'busy' | 'processing';
  activeStreams: number;
  queueLength: number;
  estimatedWaitSeconds: number;
  totalProcessed: number;
  message: string;
}

export const ServerStatusBadge: React.FC = () => {
  const [statusData, setStatusData] = useState<ServerStatus>({
    status: 'idle',
    activeStreams: 0,
    queueLength: 0,
    estimatedWaitSeconds: 0,
    totalProcessed: 0,
    message: 'サーバーは空いています'
  });

  const fetchStatus = () => {
    customFetch('/api/stream/status')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.status) {
          setStatusData(data);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 45000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      onClick={fetchStatus}
      title={`ストリーム負荷: ${statusData.activeStreams}件稼働中 / クリックで更新`}
      className={`hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-medium cursor-pointer transition-all ${
        statusData.status === 'busy'
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          : statusData.status === 'processing'
          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
      }`}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            statusData.status === 'busy'
              ? 'bg-amber-400'
              : statusData.status === 'processing'
              ? 'bg-blue-400'
              : 'bg-emerald-400'
          }`}
        ></span>
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            statusData.status === 'busy'
              ? 'bg-amber-500'
              : statusData.status === 'processing'
              ? 'bg-blue-500'
              : 'bg-emerald-500'
          }`}
        ></span>
      </span>

      <span className="text-[11px] font-semibold tracking-tight truncate max-w-[170px]">
        {statusData.message}
      </span>
    </div>
  );
};
