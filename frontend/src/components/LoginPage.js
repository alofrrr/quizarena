/**
 * LoginPage.js
 * Tela de login com Google para o professor acessar o painel host.
 */

import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSuccess = (credentialResponse) => {
    login(credentialResponse);
    navigate('/host');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center"
      >
        <h1 className="text-5xl font-black mb-2">
          <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            QuizArena
          </span>
        </h1>
        <p className="text-slate-400 mb-8 text-sm">Painel do Professor</p>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
          <div className="w-16 h-16 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-white mb-1">Entrar como Professor</h2>
          <p className="text-slate-400 text-sm mb-6">
            Use sua conta Google para criar e gerenciar quizzes
          </p>

          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => console.error('Erro ao fazer login com Google')}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="signin_with"
              locale="pt_BR"
            />
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          className="mt-6 text-slate-500 hover:text-slate-300 text-sm transition-colors"
        >
          ← Voltar para início
        </button>
      </motion.div>
    </div>
  );
}
