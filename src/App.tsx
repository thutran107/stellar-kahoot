import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Home } from './components/Home';
import { HostView } from './components/HostView';
import { PlayerView } from './components/PlayerView';
import { CosmicBackground } from './components/CosmicBackground';
import { DemoPlayer } from './components/DemoPlayer';
import { LoginPage } from './components/auth/LoginPage';
import { RequireAuth } from './components/auth/RequireAuth';
import { AuthGate } from './components/auth/AuthGate';
import { QuizListPage } from './components/quiz/QuizListPage';
import { QuizBuilderPage } from './components/quiz/QuizBuilderPage';
import { GameHistoryPage } from './components/games/GameHistoryPage';
import { GameDetailPage } from './components/games/GameDetailPage';

export default function App() {
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
            <Route path="/quizzes" element={<AuthGate><RequireAuth><QuizListPage /></RequireAuth></AuthGate>} />
            <Route path="/quizzes/:id/edit" element={<AuthGate><RequireAuth><QuizBuilderPage /></RequireAuth></AuthGate>} />
            <Route path="/games" element={<AuthGate><RequireAuth><GameHistoryPage /></RequireAuth></AuthGate>} />
            <Route path="/games/:id" element={<AuthGate><RequireAuth><GameDetailPage /></RequireAuth></AuthGate>} />
            <Route path="/host" element={<AuthGate><RequireAuth><HostView /></RequireAuth></AuthGate>} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
