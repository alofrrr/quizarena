/**
 * App.js — QuizArena Main Application
 * 
 * Routes:
 *  /             → Landing / Student join
 *  /host         → Teacher dashboard (upload, lobby, game control)
 *  /play         → Student game screen
 */

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './contexts/SocketContext';
import { GameProvider } from './contexts/GameContext';
import LandingPage from './components/LandingPage';
import HostPage from './components/HostPage';
import StudentPage from './components/StudentPage';

function App() {
  return (
    <SocketProvider>
      <GameProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/host" element={<HostPage />} />
              <Route path="/play" element={<StudentPage />} />
            </Routes>
          </div>
        </BrowserRouter>
      </GameProvider>
    </SocketProvider>
  );
}

export default App;
