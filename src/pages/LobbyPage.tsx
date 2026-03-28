import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Video,
  Users,
  Plus,
  LogIn,
  Loader2,
  Globe,
  ShieldCheck,
  Zap,
  MessageSquare,
  MonitorPlay,
} from 'lucide-react';
import clsx from 'clsx';
import Logo from '../components/Logo';
import { createRoom } from '../utils/api';

type Tab = 'create' | 'join';

const features = [
  {
    icon: <Video size={20} />,
    label: 'HD Video',
    desc: 'Crystal-clear 720p video for every participant',
  },
  {
    icon: <MonitorPlay size={20} />,
    label: 'Screen Share',
    desc: 'Present your screen to everyone in the room',
  },
  {
    icon: <MessageSquare size={20} />,
    label: 'Live Chat',
    desc: 'Real-time messaging during your meetings',
  },
  {
    icon: <Globe size={20} />,
    label: 'Global Edge',
    desc: "Cloudflare's worldwide network for low latency",
  },
  {
    icon: <ShieldCheck size={20} />,
    label: 'Secure',
    desc: 'Credentials never leave the server',
  },
  {
    icon: <Zap size={20} />,
    label: 'Instant Rooms',
    desc: 'Create and share a room in seconds',
  },
];

export default function LobbyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const joinParam = searchParams.get('join') ?? '';
  const [tab, setTab] = useState<Tab>(joinParam ? 'join' : 'create');
  const [name, setName] = useState('');
  const [roomTitle, setRoomTitle] = useState('');
  const [roomCode, setRoomCode] = useState(joinParam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validate = (): boolean => {
    if (!name.trim()) {
      setError('Please enter your display name.');
      return false;
    }
    if (tab === 'join' && !roomCode.trim()) {
      setError('Please enter a room code.');
      return false;
    }
    return true;
  };

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setLoading(true);
      setError('');
      try {
        const roomId = await createRoom();
        const title = roomTitle.trim() || `${name.trim()}'s Room`;
        navigate(
          `/room/${roomId}?name=${encodeURIComponent(name.trim())}&title=${encodeURIComponent(title)}`,
        );
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [name, roomTitle, navigate], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleJoin = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      navigate(
        `/room/${encodeURIComponent(roomCode.trim())}?name=${encodeURIComponent(name.trim())}`,
      );
    },
    [name, roomCode, navigate], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const clearError = () => setError('');

  return (
    <div className="min-h-screen bg-[#080c18] flex flex-col">
      {/* ── Ambient background ───────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-56 -right-56 w-[600px] h-[600px] rounded-full bg-orange-500/8 blur-[120px]" />
        <div className="absolute -bottom-56 -left-56 w-[600px] h-[600px] rounded-full bg-blue-600/8 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full bg-indigo-600/4 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <Logo size={34} />
          <span className="text-white font-bold text-lg tracking-tight">
            Cloud<span className="text-orange-400">Meet</span>
          </span>
        </div>
        <a
          href="https://developers.cloudflare.com/calls/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-white text-sm transition-colors"
        >
          Docs ↗
        </a>
      </nav>

      {/* ── Hero + Card ──────────────────────────────────────────── */}
      <main className="relative z-10 flex flex-col items-center justify-center flex-1 px-4 pb-12">
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium rounded-full px-3 py-1 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse-soft" />
            Powered by Cloudflare Calls
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold text-white mb-4 leading-tight tracking-tight">
            Meetings that
            <br />
            <span className="text-orange-400">just work</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-lg mx-auto">
            Instant video rooms with HD video, screen sharing, and live chat —
            built on Cloudflare's global edge network.
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-md animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="glass-card rounded-2xl p-7 shadow-2xl shadow-black/40">
            {/* Display name */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); clearError(); }}
                placeholder="e.g. Alex Johnson"
                className="input-field w-full"
                maxLength={50}
                autoComplete="name"
                autoFocus
              />
            </div>

            {/* Tabs */}
            <div className="flex bg-white/5 rounded-xl p-1 mb-5 gap-1">
              {(['create', 'join'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); clearError(); }}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all duration-200',
                    tab === t
                      ? 'bg-orange-500 text-white shadow'
                      : 'text-slate-400 hover:text-white',
                  )}
                >
                  {t === 'create' ? <Plus size={15} /> : <LogIn size={15} />}
                  {t === 'create' ? 'Create Room' : 'Join Room'}
                </button>
              ))}
            </div>

            {/* Create form */}
            {tab === 'create' && (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Room Name <span className="text-slate-500">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={roomTitle}
                    onChange={(e) => setRoomTitle(e.target.value)}
                    placeholder={name.trim() ? `${name.trim()}'s Room` : 'My Room'}
                    className="input-field w-full"
                    maxLength={60}
                  />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {loading ? 'Creating…' : 'Create Room'}
                </button>
              </form>
            )}

            {/* Join form */}
            {tab === 'join' && (
              <form onSubmit={handleJoin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Room Code
                  </label>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) => { setRoomCode(e.target.value); clearError(); }}
                    placeholder="Paste room code or UUID"
                    className="input-field w-full font-mono text-sm"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                  <LogIn size={16} />
                  Join Room
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Feature grid */}
        <div
          className="mt-14 grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-2xl w-full animate-fade-in px-2"
          style={{ animationDelay: '0.2s' }}
        >
          {features.map((f) => (
            <div
              key={f.label}
              className="glass-card rounded-xl px-4 py-4 flex flex-col gap-2"
            >
              <div className="text-orange-400">{f.icon}</div>
              <p className="text-white text-sm font-semibold">{f.label}</p>
              <p className="text-slate-400 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="relative z-10 text-center text-slate-600 text-xs pb-6">
        <div className="flex items-center justify-center gap-1.5">
          <Users size={11} />
          Built with Cloudflare Calls · WebRTC SFU
        </div>
      </footer>
    </div>
  );
}
