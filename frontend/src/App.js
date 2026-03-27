/**
 * App.js — QuizArena Main Application
 *
 * Routes:
 *  /             → Landing / Student join
 *  /login        → Google login para professor
 *  /host         → Teacher dashboard (protegido — requer login Google)
 *  /play         → Student game screen
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { SocketProvider } from './contexts/SocketContext';
import { GameProvider } from './contexts/GameContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './components/LandingPage';
import HostPage from './components/HostPage';
import StudentPage from './components/StudentPage';
import LoginPage from './components/LoginPage';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/host"
          element={
            <ProtectedRoute>
              <HostPage />
            </ProtectedRoute>
          }
        />
        <Route path="/play" element={<StudentPage />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <SocketProvider>
          <GameProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </GameProvider>
        </SocketProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
