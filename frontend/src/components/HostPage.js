import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || (
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost:4000'
);

const OPTION_COLORS = [
  { bg: 'bg-rose-500', text: 'Rose' },
  { bg: 'bg-sky-500', text: 'Sky' },
  { bg: 'bg-amber-500', text: 'Amber' },
  { bg: 'bg-emerald-500', text: 'Emerald' },
];

const OPTION_SHAPES = ['▲', '◆', '●', '■'];

export default function HostPage() {
  const { emit, on, off, isConnected } = useSocket();
  const { state, dispatch } = useGame();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [countdown, setCountdown] = useState(null);
  const [questionTime, setQuestionTime] = useState(20);
  const timerRef = useRef(null);

  // Socket event listeners — depend on isConnected so they register on the live socket
  useEffect(() => {
    if (!isConnected) return;

    const handlePlayerJoined = (data) => {
      dispatch({ type: 'PLAYER_JOINED', payload: { nickname: data.nickname, score: 0 } });
    };
    const handlePlayerLeft = (data) => {
      dispatch({ type: 'PLAYER_LEFT', payload: { nickname: data.nickname } });
    };
    const handleAnswerReceived = (data) => {
      dispatch({ type: 'ANSWER_RECEIVED', payload: data });
    };
    const handleQuestionShow = (data) => {
      dispatch({ type: 'SHOW_QUESTION', payload: data });
      setCountdown(data.question.timeLimit);
    };
    const handleQuestionResults = (data) => {
      dispatch({ type: 'QUESTION_RESULTS', payload: data });
      setCountdown(null);
    };
    const handleGameFinished = (data) => {
      dispatch({ type: 'GAME_FINISHED', payload: data });
      setCountdown(null);
    };

    on('player:joined', handlePlayerJoined);
    on('player:left', handlePlayerLeft);
    on('answer:received', handleAnswerReceived);
    on('question:show', handleQuestionShow);
    on('question:results', handleQuestionResults);
    on('game:finished', handleGameFinished);

    return () => {
      off('player:joined', handlePlayerJoined);
      off('player:left', handlePlayerLeft);
      off('answer:received', handleAnswerReceived);
      off('question:show', handleQuestionShow);
      off('question:results', handleQuestionResults);
      off('game:finished', handleGameFinished);
    };
  }, [on, off, dispatch, isConnected]);

  // Re-join room when socket reconnects so hostSocketId stays current on the server
  useEffect(() => {
    if (isConnected && state.pin && state.role === 'host') {
      emit('host:join', state.pin, () => {});
    }
  }, [isConnected, state.pin, state.role, emit]);

  // Countdown timer
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [countdown]);

  // File upload
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`${API_URL}/api/upload`, formData);
      const { pin, questionCount, questions } = res.data;

      dispatch({ type: 'SET_ROLE', payload: 'host' });
      dispatch({ type: 'SET_ROOM', payload: { pin } });
      dispatch({ type: 'SET_QUESTIONS', payload: questions });

      // Host joins the room via socket
      emit('host:join', pin, (response) => {
        if (response?.error) {
          setUploadError(response.error);
        }
      });
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Erro ao enviar arquivo');
    }
    setUploading(false);
  };

  const startGame = useCallback(() => {
    if (state.pin) {
      emit('host:startGame', { pin: state.pin, timeLimit: questionTime });
    }
  }, [emit, state.pin, questionTime]);

  const nextQuestion = useCallback(() => {
    if (state.pin) {
      emit('host:nextQuestion', state.pin);
    }
  }, [emit, state.pin]);

  const downloadReport = useCallback(() => {
    if (!state.report) return;
    const blob = new Blob([JSON.stringify(state.report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quizarena-relatorio-${state.pin}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.report, state.pin]);

  // Clears local session, Google auth, and returns to login
  const handleLogout = useCallback(() => {
    dispatch({ type: 'RESET' });
    logout();
    navigate('/login');
  }, [dispatch, logout, navigate]);

  // ── SCREENS ──

  let screen = null;

  // ── Upload Screen ──
  if (!state.pin) {
    screen = (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          <h1 className="text-5xl font-black text-center mb-2">
            <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              QuizArena
            </span>
          </h1>
          <p className="text-slate-400 text-center mb-10">Painel do Professor</p>

          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8">
            <label className="block mb-6">
              <span className="block text-sm font-medium text-slate-300 mb-3">
                Envie seu arquivo .docx com as questões
              </span>
              <div className="relative">
                <input
                  type="file"
                  accept=".docx"
                  onChange={handleUpload}
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="border-2 border-dashed border-slate-600 rounded-2xl p-10 text-center hover:border-violet-500 transition-colors cursor-pointer"
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-3">
                      <svg className="animate-spin h-10 w-10 text-violet-400" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                      </svg>
                      <span className="text-slate-300">Processando...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <div>
                        <p className="text-slate-300 font-medium">Clique ou arraste o arquivo</p>
                        <p className="text-slate-500 text-sm mt-1">Apenas .docx — máx. 5MB</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            </label>

            {uploadError && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-rose-400 text-sm text-center mb-4"
              >
                {uploadError}
              </motion.p>
            )}

            <div className="bg-slate-800/50 rounded-xl p-4 mt-4">
              <p className="text-xs text-slate-400 font-medium mb-2">Formato esperado:</p>
              <pre className="text-xs text-slate-500 font-mono leading-relaxed">
{`1. Qual a capital do Brasil?
a) São Paulo
b) Rio de Janeiro
c) Brasília (correta)
d) Salvador`}
              </pre>
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            className="block mx-auto mt-6 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Voltar
          </button>
        </motion.div>
      </div>
    );

  // ── Lobby ──
  } else if (state.status === 'lobby') {
    screen = (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-2xl text-center"
        >
          <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">Código da Sala</p>
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300 }}
            className="bg-slate-800/40 border border-slate-700/30 rounded-2xl py-4 px-8 inline-block mb-6"
          >
            <span className="text-7xl md:text-8xl font-black tracking-[0.3em] text-white font-mono">
              {state.pin}
            </span>
          </motion.div>

          <p className="text-slate-400 mb-1">
            Acesse <span className="text-violet-400 font-medium">quizarena.app</span> e insira o código
          </p>
          <div className="flex items-center justify-center gap-2 text-slate-500 text-sm mb-8">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            {state.totalQuestions} questões carregadas
          </div>

          {/* Player list */}
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-6 mb-6 min-h-[120px]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-slate-400 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
                Jogadores ({state.players.length}/30)
              </span>
              <span className="flex items-center gap-2 text-xs text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Aguardando
              </span>
            </div>

            <div className="flex flex-wrap gap-2 justify-center">
              <AnimatePresence>
                {state.players.map((p) => (
                  <motion.span
                    key={p.nickname}
                    initial={{ opacity: 0, scale: 0, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 text-slate-200 text-sm font-medium border border-slate-700/50"
                  >
                    <span className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-400">
                      {p.nickname[0]?.toUpperCase()}
                    </span>
                    {p.nickname}
                  </motion.span>
                ))}
              </AnimatePresence>
              {state.players.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                  <p className="text-slate-600 text-sm">Nenhum jogador ainda...</p>
                </div>
              )}
            </div>
          </div>

          {/* Time configuration */}
          <div className="bg-slate-900/50 border border-slate-700/30 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-center gap-2 mb-3">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-slate-400 font-medium">Tempo por questão</span>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {[10, 15, 20, 30, 45, 60].map(t => (
                <motion.button
                  key={t}
                  onClick={() => setQuestionTime(t)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    questionTime === t
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/25 ring-2 ring-violet-400/30'
                      : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-300 border border-slate-700/50'
                  }`}
                >
                  {t}s
                </motion.button>
              ))}
            </div>
          </div>

          <motion.button
            onClick={startGame}
            disabled={state.players.length === 0}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="px-12 py-4 rounded-2xl font-bold text-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/25"
          >
            Iniciar Jogo
          </motion.button>
        </motion.div>
      </div>
    );

  // ── Question Display (Host/Projector) ──
  } else if (state.status === 'question' || state.status === 'playing') {
    const q = state.currentQuestion;
    if (!q) {
      screen = (
        <div className="min-h-screen flex items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full"
          />
        </div>
      );
    } else {
      const timeLimit = state.currentQuestion?.timeLimit || 20;
      const timerProgress = countdown !== null ? countdown / timeLimit : 1;
      const circumference = 2 * Math.PI * 22;

      screen = (
        <div className="min-h-screen flex flex-col p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-slate-400 text-sm font-medium bg-slate-800/60 px-3 py-1.5 rounded-lg">
              Questão {state.currentQuestionIndex + 1}/{state.totalQuestions}
            </span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-lg">
                <span className="text-slate-500">Respostas:</span> {state.answerCount}/{state.players.length}
              </span>
              {/* Circular timer with SVG progress ring */}
              <motion.div
                key={countdown}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                className="relative w-16 h-16 flex items-center justify-center"
              >
                <svg className="absolute inset-0 w-16 h-16 -rotate-90" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor"
                    className="text-slate-800" strokeWidth="3" />
                  <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor"
                    className={countdown <= 5 ? 'text-rose-500' : 'text-violet-500'}
                    strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - timerProgress)}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <span className={`font-bold text-xl ${
                  countdown <= 5 ? 'text-rose-400 animate-pulse' : 'text-violet-400'
                }`}>
                  {countdown ?? '--'}
                </span>
              </motion.div>
            </div>
          </div>

          {/* Question */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 leading-snug">
              {q.text}
            </h2>

            {/* Options grid */}
            <div className="grid grid-cols-2 gap-4 w-full">
              {q.options.map((opt, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`${OPTION_COLORS[i]?.bg || 'bg-slate-700'} rounded-2xl p-6 flex items-center gap-4 shadow-lg`}
                >
                  <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">
                    {OPTION_SHAPES[i]}
                  </span>
                  <span className="text-xl font-medium">{opt.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      );
    }

  // ── Question Results ──
  } else if (state.status === 'results' && state.questionResults) {
    const qr = state.questionResults;
    const q = state.currentQuestion;

    screen = (
      <div className="min-h-screen flex flex-col p-6">
        <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
          {/* Correct answer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center mb-10"
          >
            <p className="text-slate-400 text-sm mb-2">Resposta correta</p>
            <div className="inline-flex items-center gap-3 bg-emerald-500/20 border border-emerald-500/50 rounded-2xl px-8 py-4">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-2xl font-bold text-emerald-300">{qr.correctText}</span>
            </div>
          </motion.div>

          {/* Answer distribution bars */}
          <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {q?.options.map((opt, i) => {
              const count = qr.optionCounts[i] || 0;
              const maxCount = Math.max(...qr.optionCounts, 1);
              const pct = Math.round((count / maxCount) * 100);
              const isCorrect = i === qr.correctIndex;

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-full h-40 bg-slate-800 rounded-xl relative overflow-hidden flex items-end">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${pct}%` }}
                      transition={{ duration: 0.8, delay: i * 0.15, ease: 'easeOut' }}
                      className={`w-full rounded-t-lg ${
                        isCorrect ? 'bg-emerald-500' : 'bg-slate-600'
                      }`}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">
                      {count}
                    </span>
                  </div>
                  <div className={`mt-2 px-3 py-1 rounded-lg text-sm font-medium ${
                    isCorrect
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {OPTION_SHAPES[i]} {opt.letter?.toUpperCase?.() || ''}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Top 5 Rankings */}
          <div className="w-full max-w-md mb-8">
            <h3 className="text-sm text-slate-400 mb-3 text-center">Ranking</h3>
            <div className="space-y-2">
              {(qr.rankings || []).map((r, i) => (
                <motion.div
                  key={r.nickname}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                    i === 0 ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-slate-800/50'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i === 0 ? 'bg-amber-500 text-amber-950' :
                    i === 1 ? 'bg-slate-400 text-slate-900' :
                    i === 2 ? 'bg-amber-700 text-amber-100' :
                    'bg-slate-700 text-slate-300'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 font-medium">{r.nickname}</span>
                  <span className="text-violet-400 font-bold">{r.score.toLocaleString()}</span>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.button
            onClick={nextQuestion}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="px-10 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/25"
          >
            {state.currentQuestionIndex + 1 >= state.totalQuestions ? 'Ver Resultado Final' : 'Próxima Questão'}
          </motion.button>
        </div>
      </div>
    );

  // ── Game Finished / Podium ──
  } else if (state.status === 'finished') {
    const top3 = (state.rankings || []).slice(0, 3);
    const rest = (state.rankings || []).slice(3);
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
    const podiumHeights = ['h-32', 'h-44', 'h-24'];
    const podiumColors = ['bg-slate-400', 'bg-amber-400', 'bg-amber-700'];
    const podiumLabels = ['2°', '1°', '3°'];

    screen = (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-black mb-2"
        >
          <span className="bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
            Resultado Final
          </span>
        </motion.h2>
        <p className="text-slate-400 mb-10">Sala {state.pin}</p>

        {/* Podium */}
        <div className="flex items-end justify-center gap-4 mb-10">
          {podiumOrder.map((player, i) => (
            <motion.div
              key={player?.nickname || i}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.2, type: 'spring' }}
              className="flex flex-col items-center"
            >
              {player && (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.8 + i * 0.2, type: 'spring' }}
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mb-2 ${
                      i === 1 ? 'bg-amber-400 text-amber-950 ring-4 ring-amber-300/50' :
                      i === 0 ? 'bg-slate-300 text-slate-800' :
                      'bg-amber-700 text-amber-100'
                    }`}
                  >
                    {player.nickname.charAt(0).toUpperCase()}
                  </motion.div>
                  <p className="font-bold text-sm mb-1">{player.nickname}</p>
                  <p className="text-violet-400 font-bold text-xs mb-2">
                    {player.score.toLocaleString()} pts
                  </p>
                </>
              )}
              <div className={`w-24 ${podiumHeights[i]} ${podiumColors[i]} rounded-t-xl flex items-start justify-center pt-3`}>
                <span className="text-2xl font-black text-white/80">{podiumLabels[i]}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Rest of rankings */}
        {rest.length > 0 && (
          <div className="w-full max-w-md mb-8">
            <div className="space-y-2">
              {rest.map((r, i) => (
                <motion.div
                  key={r.nickname}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.2 + i * 0.05 }}
                  className="flex items-center gap-3 px-4 py-3 bg-slate-800/50 rounded-xl"
                >
                  <span className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-400">
                    {i + 4}
                  </span>
                  <span className="flex-1 font-medium">{r.nickname}</span>
                  <span className="text-slate-400 font-bold">{r.score.toLocaleString()}</span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-4">
          {state.report && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              onClick={downloadReport}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-3 rounded-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg"
            >
              Baixar Relatório
            </motion.button>
          )}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6 }}
            onClick={() => {
              dispatch({ type: 'RESET' });
              navigate('/host');
            }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="px-8 py-3 rounded-xl font-bold bg-slate-700 hover:bg-slate-600 transition-colors"
          >
            Nova Partida
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header com info do usuário e botão de logout */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-4 right-4 z-50 flex items-center gap-3"
      >
        {user && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/90 backdrop-blur border border-slate-700 shadow-lg">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-7 h-7 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white">
                {user.name?.[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-sm text-slate-300 font-medium max-w-[140px] truncate">
              {user.name}
            </span>
          </div>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/90 backdrop-blur border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/10 text-sm font-medium transition-all shadow-lg"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sair
        </motion.button>
      </motion.div>
      {screen}
    </>
  );
}
