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

  // ── Manual question creation ──
  const [activeTab, setActiveTab] = useState('import'); // 'import' | 'create'
  const [manualQuestions, setManualQuestions] = useState([]);
  const [editingQ, setEditingQ] = useState({
    text: '',
    options: ['', '', '', ''],
    correctIndex: null,
  });
  const [editingIndex, setEditingIndex] = useState(null); // null = new, number = editing existing

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

  // ── Manual question helpers ──
  const resetEditingQ = () => {
    setEditingQ({ text: '', options: ['', '', '', ''], correctIndex: null });
    setEditingIndex(null);
  };

  const saveQuestion = () => {
    const filledOpts = editingQ.options.filter(o => o.trim());
    if (!editingQ.text.trim() || filledOpts.length < 2 || editingQ.correctIndex === null) return;
    if (editingIndex !== null) {
      setManualQuestions(prev => prev.map((q, i) => i === editingIndex ? { ...editingQ } : q));
    } else {
      setManualQuestions(prev => [...prev, { ...editingQ }]);
    }
    resetEditingQ();
  };

  const editQuestion = (index) => {
    setEditingQ({ ...manualQuestions[index] });
    setEditingIndex(index);
  };

  const removeQuestion = (index) => {
    setManualQuestions(prev => prev.filter((_, i) => i !== index));
    if (editingIndex === index) resetEditingQ();
  };

  const updateOption = (optIndex, value) => {
    setEditingQ(prev => ({
      ...prev,
      options: prev.options.map((o, i) => i === optIndex ? value : o),
    }));
  };

  const addOption = () => {
    if (editingQ.options.length >= 5) return;
    setEditingQ(prev => ({ ...prev, options: [...prev.options, ''] }));
  };

  const removeOption = (optIndex) => {
    if (editingQ.options.length <= 2) return;
    setEditingQ(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== optIndex),
      correctIndex: prev.correctIndex === optIndex ? null :
        prev.correctIndex > optIndex ? prev.correctIndex - 1 : prev.correctIndex,
    }));
  };

  const createRoomManual = async () => {
    if (manualQuestions.length === 0) return;
    setUploading(true);
    setUploadError('');
    try {
      const res = await axios.post(`${API_URL}/api/create-room`, {
        questions: manualQuestions.map(q => ({
          text: q.text,
          options: q.options.filter(o => o.trim()),
          correctIndex: q.correctIndex,
        })),
      });
      const { pin, questions } = res.data;
      dispatch({ type: 'SET_ROLE', payload: 'host' });
      dispatch({ type: 'SET_ROOM', payload: { pin } });
      dispatch({ type: 'SET_QUESTIONS', payload: questions });
      emit('host:join', pin, (response) => {
        if (response?.error) setUploadError(response.error);
      });
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Erro ao criar sala');
    }
    setUploading(false);
  };

  // ── SCREENS ──

  let screen = null;

  // ── Upload / Create Screen ──
  if (!state.pin) {
    const LETTERS = ['a', 'b', 'c', 'd', 'e'];
    const filledOpts = editingQ.options.filter(o => o.trim());
    const canSaveQ = editingQ.text.trim() && filledOpts.length >= 2 && editingQ.correctIndex !== null;

    screen = (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl"
        >
          <h1 className="text-5xl font-black text-center mb-2">
            <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              QuizArena
            </span>
          </h1>
          <p className="text-slate-400 text-center mb-8">Painel do Professor</p>

          {/* ── Tabs ── */}
          <div className="flex rounded-xl bg-slate-800/60 border border-slate-700/50 p-1 mb-6">
            <button
              onClick={() => { setActiveTab('import'); setUploadError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'import'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Importar Arquivo
            </button>
            <button
              onClick={() => { setActiveTab('create'); setUploadError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'create'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Criar Questões
            </button>
          </div>

          {/* ── Error message (shared) ── */}
          {uploadError && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-rose-400 text-sm text-center mb-4"
            >
              {uploadError}
            </motion.p>
          )}

          <AnimatePresence mode="wait">
            {/* ═══ TAB: Import ═══ */}
            {activeTab === 'import' && (
              <motion.div
                key="import"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8"
              >
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

                <div className="bg-slate-800/50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 font-medium mb-2">Formato esperado:</p>
                  <pre className="text-xs text-slate-500 font-mono leading-relaxed">
{`1. Qual a capital do Brasil?
a) São Paulo
b) Rio de Janeiro
c) Brasília (correta)
d) Salvador`}
                  </pre>
                </div>
              </motion.div>
            )}

            {/* ═══ TAB: Create ═══ */}
            {activeTab === 'create' && (
              <motion.div
                key="create"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {/* Question form */}
                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-6 mb-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">
                    {editingIndex !== null ? `Editando questão ${editingIndex + 1}` : `Nova questão`}
                  </p>

                  {/* Question text */}
                  <textarea
                    value={editingQ.text}
                    onChange={(e) => setEditingQ(prev => ({ ...prev, text: e.target.value }))}
                    placeholder="Digite a pergunta..."
                    rows={2}
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all resize-none mb-4"
                  />

                  {/* Options */}
                  <div className="space-y-2 mb-4">
                    {editingQ.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {/* Correct answer radio */}
                        <button
                          type="button"
                          onClick={() => setEditingQ(prev => ({ ...prev, correctIndex: i }))}
                          className={`flex-shrink-0 w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                            editingQ.correctIndex === i
                              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                              : 'border-slate-600 text-slate-600 hover:border-slate-400'
                          }`}
                          title="Marcar como correta"
                        >
                          {editingQ.correctIndex === i ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span className="text-xs font-bold">{LETTERS[i]}</span>
                          )}
                        </button>
                        {/* Option text */}
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => updateOption(i, e.target.value)}
                          placeholder={`Opção ${LETTERS[i]})`}
                          className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
                        />
                        {/* Remove option */}
                        {editingQ.options.length > 2 && (
                          <button
                            onClick={() => removeOption(i)}
                            className="flex-shrink-0 w-8 h-8 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add option button */}
                  {editingQ.options.length < 5 && (
                    <button
                      onClick={addOption}
                      className="text-xs text-slate-500 hover:text-violet-400 transition-colors flex items-center gap-1 mb-4"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Adicionar opção
                    </button>
                  )}

                  {/* Save question button */}
                  <div className="flex gap-2">
                    <motion.button
                      onClick={saveQuestion}
                      disabled={!canSaveQ}
                      whileTap={{ scale: 0.97 }}
                      className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={editingIndex !== null ? "M4.5 12.75l6 6 9-13.5" : "M12 4.5v15m7.5-7.5h-15"} />
                      </svg>
                      {editingIndex !== null ? 'Salvar alteração' : 'Adicionar questão'}
                    </motion.button>
                    {editingIndex !== null && (
                      <button
                        onClick={resetEditingQ}
                        className="px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-all"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Questions list ── */}
                {manualQuestions.length > 0 && (
                  <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 mb-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                      {manualQuestions.length} {manualQuestions.length === 1 ? 'questão' : 'questões'}
                    </p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {manualQuestions.map((q, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                            editingIndex === i
                              ? 'bg-violet-500/15 border border-violet-500/30'
                              : 'bg-slate-800/50 hover:bg-slate-800/80'
                          }`}
                        >
                          <span className="w-6 h-6 rounded-lg bg-slate-700/60 flex items-center justify-center text-xs font-bold text-slate-400 flex-shrink-0">
                            {i + 1}
                          </span>
                          <span className="flex-1 text-slate-300 truncate">{q.text}</span>
                          <span className="text-xs text-emerald-500 flex-shrink-0">
                            {LETTERS[q.correctIndex]})
                          </span>
                          <button
                            onClick={() => editQuestion(i)}
                            className="flex-shrink-0 w-7 h-7 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 flex items-center justify-center transition-all"
                            title="Editar"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={() => removeQuestion(i)}
                            className="flex-shrink-0 w-7 h-7 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-all"
                            title="Remover"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Create room button */}
                <motion.button
                  onClick={createRoomManual}
                  disabled={manualQuestions.length === 0 || uploading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                      </svg>
                      Criando...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                      </svg>
                      Criar sala com {manualQuestions.length} {manualQuestions.length === 1 ? 'questão' : 'questões'}
                    </>
                  )}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

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
      {/* Header com info do usuário e botão de logout — top-left para não sobrepor o timer */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed top-4 left-4 z-50 flex items-center gap-2"
      >
        {user && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-800/80 backdrop-blur-sm border border-slate-700/50">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-6 h-6 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white">
                {user.name?.[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-xs text-slate-400 font-medium max-w-[100px] truncate hidden sm:inline">
              {user.name}
            </span>
          </div>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 backdrop-blur-sm border border-slate-700/50 text-slate-500 hover:text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/10 text-xs font-medium transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          Sair
        </motion.button>
      </motion.div>
      {screen}
    </>
  );
}
