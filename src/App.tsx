import { Routes, Route } from 'react-router-dom';
import LobbyPage from './pages/LobbyPage';
import MeetingPage from './pages/MeetingPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/room/:roomId" element={<MeetingPage />} />
    </Routes>
  );
}
