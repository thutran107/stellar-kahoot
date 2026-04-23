/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Home } from './components/Home';
import { HostView } from './components/HostView';
import { PlayerView } from './components/PlayerView';
import { CosmicBackground } from './components/CosmicBackground';
import { DemoPlayer } from './components/DemoPlayer';

export default function App() {
  return (
    <Router>
      <div className="relative min-h-screen overflow-hidden">
        <CosmicBackground />
        {/* Main orbital background rings */}
        <div className="orbit w-[1200px] h-[1200px] -top-[400px] left-1/2 -translate-x-1/2"></div>
        <div className="orbit w-[800px] h-[800px] -top-[200px] left-1/2 -translate-x-1/2"></div>
        
        <div className="relative z-10 min-h-screen flex flex-col">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/host" element={<HostView />} />
            <Route path="/join" element={<PlayerView />} />
            <Route path="/demo" element={<DemoPlayer />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
