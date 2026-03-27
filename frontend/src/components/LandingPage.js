import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { salvarLocal, carregarLocal, removerLocal } from '../utils/storage';
import axios from 'axios';

// Chave usada para lembrar o último nickname digitado pelo aluno.
// Ao recarregar a página o campo já vem preenchido, evitando redigitar.
const CHAVE_NICKNAME = 'quizarena_ultimo_nickname';

const API_URL = process.env.REACT_APP_API_URL || (
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost:4000'
);

const OPTION_COLORS = [
  'from-rose-500 to-pink-600',
  'from-sky-500 to-blue-600',
  'from-amber-400 to-orange-500',
  'from-emerald-500 to-green-600',
];

export default function LandingPage() {
  const [pin, setPin] = useState('');
  // Recupera o último nickname salvo para não obrigar o aluno a redigitar
  const [nickname, setNickname] = useState(() => carregarLocal(CHAVE_NICKNAME, ''));
  const [step, setStep] = useState('pin'); // pin | nickname
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { emit, isConnected } = useSocket();
  const { dispatch } = useGame();

  // Persiste o nickname sempre que o aluno digita, para sobreviver a recarregamentos
  useEffect(() => {
    if (nickname) {
      salvarLocal(CHAVE_NICKNAME, nickname);
    }
  }, [nickname]);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (pin.length !== 6) {
      setError('O PIN deve ter 6 dígitos');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/api/room/${pin}`);
      if (res.data.status !== 'lobby') {
        setError('Este jogo já começou');
        setLoading(false);
        return;
      }
      setStep('nickname');
    } catch {
      setError('Sala não encontrada');
    }
    setLoading(false);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!nickname.trim() || nickname.length > 15) {
      setError('Nickname deve ter entre 1 e 15 caracteres');
      return;
    }
    setLoading(true);
    setError('');

    emit('student:join', { pin, nickname: nickname.trim() }, (response) => {
      setLoading(false);
      if (response?.error) {
        setError(response.error);
        return;
      }
      dispatch({ type: 'SET_ROLE', payload: 'student' });
      dispatch({ type: 'SET_ROOM', payload: { pin } });
      dispatch({ type: 'SET_NICKNAME', payload: nickname.trim() });
      // Limpa o rascunho — nickname já está no GameContext (persistido via SESSION_KEY)
      removerLocal(CHAVE_NICKNAME);
      navigate('/play');
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Animated background shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {OPTION_COLORS.map((color, i) => (
          <motion.div
            key={i}
            className={`absolute w-72 h-72 rounded-3xl bg-gradient-to-br ${color} opacity-10 blur-3xl`}
            animate={{
              x: [0, 80, -40, 0],
              y: [0, -60, 40, 0],
              rotate: [0, 90, 180, 360],
            }}
            transition={{
              duration: 20 + i * 5,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{
              top: `${10 + i * 20}%`,
              left: `${10 + i * 20}%`,
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <motion.div
          className="text-center mb-10"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
        >
          <h1 className="text-6xl font-black tracking-tight mb-2">
            <span className="bg-gradient-to-r from-rose-400 via-violet-400 to-sky-400 bg-clip-text text-transparent">
              Quiz
            </span>
            <span className="text-white">Arena</span>
          </h1>
          <p className="text-slate-400 text-lg">Entre na sala e teste seu conhecimento</p>
        </motion.div>

        {/* Form Card */}
        <motion.div
          layout
          className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl"
        >
          <AnimatePresence mode="wait">
            {step === 'pin' ? (
              <motion.form
                key="pin-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handlePinSubmit}
                className="space-y-6"
              >
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-3">
                    Código da Sala
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value.replace(/\D/g, ''));
                      setError('');
                    }}
                    placeholder="000000"
                    className="w-full text-center text-4xl font-bold tracking-[0.4em] bg-slate-800/50 border-2 border-slate-600/50 rounded-2xl py-5 px-4 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                    autoFocus
                    autoComplete="off"
                  />
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-rose-400 text-sm text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <motion.button
                  type="submit"
                  disabled={pin.length !== 6 || loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/25"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                      </svg>
                      Verificando...
                    </span>
                  ) : (
                    'Entrar'
                  )}
                </motion.button>
              </motion.form>
            ) : (
              <motion.form
                key="nickname-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleJoin}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 mb-2">
                  <button
                    type="button"
                    onClick={() => { setStep('pin'); setError(''); }}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm text-slate-400">Sala: <span className="text-white font-mono font-bold">{pin}</span></span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-3">
                    Seu Nickname
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      setError('');
                    }}
                    placeholder="Seu apelido..."
                    className="w-full text-center text-2xl font-bold bg-slate-800/50 border-2 border-slate-600/50 rounded-2xl py-4 px-4 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    autoFocus
                    autoComplete="off"
                  />
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-rose-400 text-sm text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <motion.button
                  type="submit"
                  disabled={!nickname.trim() || loading || !isConnected}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/25"
                >
                  {loading ? 'Entrando...' : 'Jogar!'}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Teacher link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-8"
        >
          <Link
            to="/host"
            className="text-slate-500 hover:text-violet-400 text-sm transition-colors"
          >
            Sou professor — Criar uma sala
          </Link>
        </motion.div>

        {/* Connection status */}
        {!isConnected && (
          <div className="text-center mt-4">
            <span className="inline-flex items-center gap-2 text-xs text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Conectando ao servidor...
            </span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
