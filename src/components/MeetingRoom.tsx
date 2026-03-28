import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  MessageSquare,
  Copy,
  Check,
  Users,
  X,
  Send,
  PhoneOff,
} from 'lucide-react';
import clsx from 'clsx';
import Logo from './Logo';
import VideoTile from './VideoTile';
import type { RoomState } from '../utils/useRoom';

// ── Invite Modal ──────────────────────────────────────────────────────────────

function ShareModal({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  // Invite URL goes directly to the lobby with the room pre-filled so the
  // invited user types their own name instead of being dropped into the meeting.
  const roomUrl = `${window.location.origin}/?join=${encodeURIComponent(roomId)}`;

  const copy = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-card rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">Invite to Meeting</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Room Code</p>
        <div className="flex items-center gap-2 mb-5">
          <code className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-orange-400 font-mono text-sm truncate select-all">
            {roomId}
          </code>
          <button
            onClick={() => copy(roomId, setCopiedCode)}
            className={clsx(
              'flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all shrink-0',
              copiedCode
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30',
            )}
          >
            {copiedCode ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Shareable Link</p>
        <div className="flex items-center gap-2">
          <p className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-slate-300 text-xs truncate select-all font-mono">
            {roomUrl}
          </p>
          <button
            onClick={() => copy(roomUrl, setCopiedUrl)}
            className="text-slate-400 hover:text-white transition-colors p-2.5 rounded-xl hover:bg-white/10 shrink-0"
          >
            {copiedUrl ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

function ChatPanel({ room, onClose }: { room: RoomState; onClose: () => void }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.chatMessages]);

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      room.sendChat(text);
      setInput('');
    },
    [input, room],
  );

  const fmt = (at: number) =>
    new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <aside className="w-72 border-l border-white/8 flex flex-col bg-[#0d1120] shrink-0 animate-slide-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <MessageSquare size={15} className="text-orange-400" />
          Chat
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {room.chatMessages.length === 0 && (
          <p className="text-slate-500 text-xs text-center mt-8">No messages yet. Say hi!</p>
        )}
        {room.chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={clsx('flex flex-col gap-0.5', msg.isMine ? 'items-end' : 'items-start')}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-slate-400">{msg.isMine ? 'You' : msg.from}</span>
              <span className="text-[10px] text-slate-600">{fmt(msg.at)}</span>
            </div>
            <div
              className={clsx(
                'max-w-[220px] rounded-2xl px-3 py-2 text-sm break-words',
                msg.isMine
                  ? 'bg-orange-500 text-white rounded-tr-sm'
                  : 'bg-white/10 text-slate-200 rounded-tl-sm',
              )}
            >
              {msg.message}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={submit} className="p-3 border-t border-white/8 flex gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className="input-field flex-1 text-sm py-2"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-3 py-2 transition-colors"
        >
          <Send size={14} />
        </button>
      </form>
    </aside>
  );
}

// ── Video Grid ────────────────────────────────────────────────────────────────

function VideoGrid({ room }: { room: RoomState }) {
  const { localStream, screenStream, remoteParticipants, micEnabled, cameraEnabled, screenShareEnabled, myName } = room;

  // Build tile list: local first, then screen share, then remotes
  type Tile = {
    id: string;
    stream: MediaStream | null;
    name: string;
    mic: boolean;
    camera: boolean;
    isLocal: boolean;
    isScreen: boolean;
  };

  const tiles: Tile[] = [
    {
      id: 'local',
      stream: localStream,
      name: myName,
      mic: micEnabled,
      camera: cameraEnabled,
      isLocal: true,
      isScreen: false,
    },
  ];

  if (screenShareEnabled && screenStream) {
    tiles.push({
      id: 'local-screen',
      stream: screenStream,
      name: myName,
      mic: false,
      camera: true,
      isLocal: true,
      isScreen: true,
    });
  }

  remoteParticipants.forEach((p) => {
    const screenTrack = p.tracks.find((t) => t.kind === 'screenshare');
    const hasScreen = !!screenTrack;

    tiles.push({
      id: p.participantId,
      stream: p.stream,
      name: p.name,
      mic: p.tracks.some((t) => t.kind === 'audio'),
      camera: p.tracks.some((t) => t.kind === 'video'),
      isLocal: false,
      isScreen: false,
    });

    if (hasScreen) {
      tiles.push({
        id: `${p.participantId}-screen`,
        stream: p.stream,
        name: p.name,
        mic: false,
        camera: true,
        isLocal: false,
        isScreen: true,
      });
    }
  });

  const count = tiles.length;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);

  return (
    <main
      className="flex-1 overflow-hidden p-2 grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {tiles.map((tile) => (
        <VideoTile
          key={tile.id}
          stream={tile.stream}
          name={tile.name}
          micEnabled={tile.mic}
          cameraEnabled={tile.camera}
          isLocal={tile.isLocal}
          isScreenShare={tile.isScreen}
          className="w-full h-full"
        />
      ))}
    </main>
  );
}

// ── Control Bar Button ────────────────────────────────────────────────────────

function CtrlBtn({
  active,
  danger,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'ctrl-btn',
        active && 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 ring-1 ring-orange-500/30',
        danger && 'bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/30',
      )}
    >
      {children}
    </button>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

interface MeetingRoomProps {
  room: RoomState;
  roomId: string;
  roomTitle: string;
  onLeave: () => void;
}

export default function MeetingRoom({ room, roomId, roomTitle, onLeave }: MeetingRoomProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const participantCount = 1 + room.remoteParticipants.length;

  return (
    <div className="flex flex-col h-full bg-[#0a0e1c] text-white">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 h-14 border-b border-white/8 bg-[#0d1120]/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Logo size={28} />
          <div className="w-px h-5 bg-white/15 shrink-0" />
          <span className="text-sm font-semibold text-slate-200 truncate max-w-48">
            {roomTitle}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs bg-white/5 border border-white/8 rounded-lg px-2.5 py-1.5">
            <Users size={12} />
            <span>{participantCount}</span>
          </div>
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 border border-orange-500/30 hover:border-orange-400/50 bg-orange-500/10 hover:bg-orange-500/15 rounded-lg px-3 py-1.5 transition-all duration-200"
          >
            <Copy size={12} />
            Invite
          </button>
        </div>
      </header>

      {/* ── Content area ── */}
      <div className="flex flex-1 overflow-hidden">
        <VideoGrid room={room} />
        {chatOpen && <ChatPanel room={room} onClose={() => setChatOpen(false)} />}
      </div>

      {/* ── Control bar ── */}
      <footer className="flex items-center justify-center gap-2 py-3 px-4 border-t border-white/8 bg-[#0d1120]/80 backdrop-blur-sm shrink-0">
        <CtrlBtn
          danger={!room.micEnabled}
          onClick={room.toggleMic}
          title={room.micEnabled ? 'Mute mic' : 'Unmute mic'}
        >
          {room.micEnabled ? <Mic size={19} /> : <MicOff size={19} />}
        </CtrlBtn>

        <CtrlBtn
          danger={!room.cameraEnabled}
          onClick={room.toggleCamera}
          title={room.cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {room.cameraEnabled ? <Video size={19} /> : <VideoOff size={19} />}
        </CtrlBtn>

        <CtrlBtn
          active={room.screenShareEnabled}
          onClick={() => void room.toggleScreenShare()}
          title={room.screenShareEnabled ? 'Stop sharing screen' : 'Share screen'}
        >
          {room.screenShareEnabled ? <MonitorOff size={19} /> : <Monitor size={19} />}
        </CtrlBtn>

        <div className="w-px h-8 bg-white/10 mx-1" />

        <CtrlBtn
          active={chatOpen}
          onClick={() => setChatOpen((v) => !v)}
          title={chatOpen ? 'Close chat' : 'Open chat'}
        >
          <MessageSquare size={19} />
          {room.chatMessages.length > 0 && !chatOpen && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500" />
          )}
        </CtrlBtn>

        <div className="w-px h-8 bg-white/10 mx-1" />

        <button
          onClick={onLeave}
          title="Leave meeting"
          className="flex items-center gap-2 bg-red-500 hover:bg-red-400 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
        >
          <PhoneOff size={16} />
          Leave
        </button>
      </footer>

      {shareOpen && <ShareModal roomId={roomId} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
