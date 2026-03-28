import { useParams, useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { useRoom } from '../utils/useRoom';
import MeetingRoom from '../components/MeetingRoom';
import Logo from '../components/Logo';

function LoadingScreen() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 bg-[#0a0e1c] text-white">
      <Logo size={48} />
      <Loader2 size={28} className="animate-spin text-orange-400 mt-2" />
      <p className="text-slate-400 text-sm">Connecting to your meeting…</p>
    </div>
  );
}

function ErrorScreen({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 bg-[#0a0e1c] text-white px-4">
      <div className="glass-card rounded-2xl p-8 max-w-sm w-full text-center">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Unable to Join</h2>
        <p className="text-slate-400 text-sm mb-6">{message}</p>
        <button onClick={onBack} className="btn-primary w-full">
          Back to Lobby
        </button>
      </div>
    </div>
  );
}

// Inner component — only rendered once we have a name, so useRoom is always called.
function MeetingPageInner({
  roomId,
  name,
  roomTitle,
}: {
  roomId: string;
  name: string;
  roomTitle: string;
}) {
  const navigate = useNavigate();
  const room = useRoom(roomId, name);

  if (room.status === 'error') {
    return <ErrorScreen message={room.error} onBack={() => navigate('/')} />;
  }

  if (room.status === 'connecting') {
    return <LoadingScreen />;
  }

  return (
    <div className="h-full">
      <MeetingRoom
        room={room}
        roomId={roomId}
        roomTitle={decodeURIComponent(roomTitle)}
        onLeave={() => {
          room.leave();
          navigate('/');
        }}
      />
    </div>
  );
}

export default function MeetingPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();

  const name = searchParams.get('name');
  const roomTitle = searchParams.get('title') ?? roomId ?? 'Meeting Room';

  // No name means the user arrived via a bare invite link — send them to the
  // lobby so they can enter their name, with the room code pre-filled.
  if (!name) {
    return <Navigate to={`/?join=${encodeURIComponent(roomId ?? '')}`} replace />;
  }

  return <MeetingPageInner roomId={roomId ?? ''} name={name} roomTitle={roomTitle} />;
}
