import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { Home } from './components/Home';
import { HostView } from './components/HostView';
import { PlayerView } from './components/PlayerView';
import { CosmicBackground } from './components/CosmicBackground';
import { DemoPlayer } from './components/DemoPlayer';
import { LoginPage } from './components/auth/LoginPage';
import { RequireAuth } from './components/auth/RequireAuth';
import { QuizListPage } from './components/quiz/QuizListPage';
import { QuizBuilderPage } from './components/quiz/QuizBuilderPage';
import { GameHistoryPage } from './components/games/GameHistoryPage';
import { GameDetailPage } from './components/games/GameDetailPage';
import { useAuthStore } from './store/authStore';

export default function App() {
  const init = useAuthStore((s) => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <Router>
      <div className="relative min-h-screen overflow-hidden">
        <CosmicBackground />
        <div className="orbit w-[1200px] h-[1200px] -top-[400px] left-1/2 -translate-x-1/2"></div>
        <div className="orbit w-[800px] h-[800px] -top-[200px] left-1/2 -translate-x-1/2"></div>

        <div className="relative z-10 min-h-screen flex flex-col">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/join" element={<PlayerView />} />
            <Route path="/demo" element={<DemoPlayer />} />
            <Route path="/quizzes" element={<RequireAuth><QuizListPage /></RequireAuth>} />
            <Route path="/quizzes/:id/edit" element={<RequireAuth><QuizBuilderPage /></RequireAuth>} />
            <Route path="/games" element={<RequireAuth><GameHistoryPage /></RequireAuth>} />
            <Route path="/games/:id" element={<RequireAuth><GameDetailPage /></RequireAuth>} />
            <Route path="/host" element={<RequireAuth><HostView /></RequireAuth>} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
