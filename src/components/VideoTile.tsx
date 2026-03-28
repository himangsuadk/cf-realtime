import { useEffect, useRef } from 'react';
import { MicOff, VideoOff, Monitor } from 'lucide-react';
import clsx from 'clsx';

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  micEnabled?: boolean;
  cameraEnabled?: boolean;
  isLocal?: boolean;
  isScreenShare?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function VideoTile({
  stream,
  name,
  micEnabled = true,
  cameraEnabled = true,
  isLocal = false,
  isScreenShare = false,
  className,
  style,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
    } else if (!stream) {
      el.srcObject = null;
    }
  }, [stream]);

  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const showAvatar = !cameraEnabled || !stream;

  return (
    <div
      className={clsx(
        'relative rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center',
        micEnabled
          ? 'ring-2 ring-orange-500/50 shadow-lg shadow-orange-500/10'
          : 'ring-1 ring-white/10',
        className,
      )}
      style={style}
    >
      {/* Video element — always rendered so we can attach srcObject */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={clsx(
          'w-full h-full object-cover',
          (showAvatar || isScreenShare) && 'hidden',
        )}
      />

      {/* Screen share icon overlay */}
      {isScreenShare && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900">
          <Monitor size={36} className="text-orange-400" />
          <span className="text-slate-300 text-sm font-medium">{name} is sharing their screen</span>
          <video ref={videoRef} autoPlay playsInline muted={isLocal} className="w-full h-full object-contain absolute inset-0" />
        </div>
      )}

      {/* Avatar when camera is off */}
      {showAvatar && !isScreenShare && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/95">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500/40 to-indigo-600/40 border border-white/10 flex items-center justify-center text-white text-xl font-bold">
            {initials || (name[0]?.toUpperCase() ?? '?')}
          </div>
          {!cameraEnabled && (
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <VideoOff size={13} />
              Camera off
            </div>
          )}
        </div>
      )}

      {/* Name tag */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1 max-w-[calc(100%-1rem)]">
        {!micEnabled && <MicOff size={11} className="text-red-400 shrink-0" />}
        <span className="text-white text-xs font-medium truncate">
          {name}
          {isLocal && <span className="text-slate-400 ml-1">(You)</span>}
        </span>
      </div>
    </div>
  );
}
