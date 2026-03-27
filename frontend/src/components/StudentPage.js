import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { enableAntiCheat } from '../utils/antiCheat';

const OPTION_COLORS = [
  'from-rose-500 to-pink-600',
  'from-sky-500 to-blue-600',
  'from-amber-400 to-orange-500',
  'from-emerald-500 to-green-600',
];

const OPTION_SHAPES = ['▲', '◆', '●', '■'];
const ACTIVE_STATUSES = ['lobby', 'playing', 'question', 'answered', 'results', 'finished'];

export default function StudentPage() {
  const { emit, on, off, isConnected } = useSocket();
  const { state, dispatch } = useGame();
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const timerRef = useRef(null);

  // Track whether the socket was already connected when this component first mounted.
  // If it was NOT connected (page refresh scenario), we need to re-emit student:join
  // once the socket connects to re-register with the server.
  const wasConnectedOnMount = useRef(isConnected);
  const hasRejoined = useRef(false);

  // Enable anti-cheat
  useEffect(() => {
    const cleanup = enableAntiCheat();
    return cleanup;
  }, []);

  // Socket listeners — depend on isConnected so they register on the live socket
  useEffect(() => {
    if (!isConnected) return;

    const handleGameStarted = (data) => {
      dispatch({ type: 'GAME_STARTED', payload: data });
    };

    const handleQuestionShow = (data) => {
      dispatch({ type: 'SHOW_QUESTION', payload: data });
      setSelectedOption(null);
      setAnswerFeedback(null);
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

    on('game:started', handleGameStarted);
    on('question:show', handleQuestionShow);
    on('question:results', handleQuestionResults);
    on('game:finished', handleGameFinished);

    return () => {
      off('game:started', handleGameStarted);
      off('question:show', handleQuestionShow);
      off('question:results', handleQuestionResults);
      off('game:finished', handleGameFinished);
    };
  }, [on, off, dispatch, isConnected]);

  // After a page refresh the socket starts disconnected and then connects.
  // Re-register with the server using session:restore (backed by Redis) as primary,
  // falling back to student:rejoin if session:restore fails.
  useEffect(() => {
    if (
      !isConnected ||
      wasConnectedOnMount.current ||
      hasRejoined.current ||
      !state.pin ||
      !state.nickname ||
      !ACTIVE_STATUSES.includes(state.status)
    ) return;

    hasRejoined.current = true;

    if (state.status === 'lobby') {
      // Jogo ainda não começou — join normal
      emit('student:join', { pin: state.pin, nickname: state.nickname }, (response) => {
        if (response?.error) {
          dispatch({ type: 'RESET' });
          navigate('/');
        }
      });
      return;
    }

    // Função para aplicar o estado recebido do servidor (usada por ambos os caminhos)
    const applySyncState = (response) => {
      if (response.status === 'question' && !response.alreadyAnswered) {
        dispatch({
          type: 'SHOW_QUESTION',
          payload: {
            question: { ...response.question, timeLimit: response.timeRemaining },
            questionIndex: response.questionIndex,
            totalQuestions: response.totalQuestions,
          },
        });
        setCountdown(response.timeRemaining);
      } else if (response.status === 'question' && response.alreadyAnswered) {
        dispatch({ type: 'ANSWER_SUBMITTED', payload: { totalScore: response.score, streak: response.streak } });
      } else if (response.status === 'results') {
        dispatch({
          type: 'QUESTION_RESULTS',
          payload: {
            questionIndex: response.questionIndex,
            correctIndex: response.correctIndex,
            correctText: response.correctText,
            optionCounts: response.optionCounts,
            totalPlayers: response.totalPlayers,
            rankings: response.rankings,
          },
        });
      } else if (response.status === 'finished') {
        dispatch({ type: 'GAME_FINISHED', payload: { rankings: response.rankings, report: response.report } });
      }
    };

    // Tenta session:restore (busca do Redis) primeiro
    emit('session:restore', { pin: state.pin, nickname: state.nickname }, (response) => {
      if (response && !response.error) {
        applySyncState(response);
        return;
      }

      // Fallback: rejoin tradicional (busca da memória do servidor)
      emit('student:rejoin', { pin: state.pin, nickname: state.nickname }, (rejoinResponse) => {
        if (!rejoinResponse || rejoinResponse.error) {
          dispatch({ type: 'RESET' });
          navigate('/');
          return;
        }
        applySyncState(rejoinResponse);
      });
    });
  }, [isConnected, state.pin, state.nickname, state.status, emit, dispatch, navigate]);

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

  // Submit answer
  const submitAnswer = useCallback((optionIndex) => {
    if (selectedOption !== null || state.status !== 'question') return;
    setSelectedOption(optionIndex);

    emit('student:answer', {
      pin: state.pin,
      questionIndex: state.currentQuestionIndex,
      selectedOption: optionIndex,
    }, (response) => {
      if (response?.error) {
        console.error('Answer error:', response.error);
        return;
      }
      setAnswerFeedback(response);
      dispatch({ type: 'ANSWER_SUBMITTED', payload: response });
    });
  }, [selectedOption, state.status, state.pin, state.currentQuestionIndex, emit, dispatch]);

  // Redirect if no room
  useEffect(() => {
    if (!state.pin) navigate('/');
  }, [state.pin, navigate]);

  // Clears local session and returns to the landing page
  const handleLogout = useCallback(() => {
    dispatch({ type: 'RESET' });
    navigate('/');
  }, [dispatch, navigate]);

  // ── SCREENS ──

  let screen = null;

  // ── Waiting in Lobby ──
  if (state.status === 'lobby') {
    screen = (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-6"
          >
            <span className="text-3xl font-bold bg-gradient-to-br from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              {state.nickname?.[0]?.toUpperCase()}
            </span>
          </motion.div>

          <h2 className="text-2xl font-bold mb-1">{state.nickname}</h2>
          <p className="text-slate-400 mb-8">Você está na sala!</p>

          <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-6 inline-block">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full"
              />
              <span className="text-slate-300 text-sm">Aguardando o professor iniciar...</span>
            </div>
          </div>
        </motion.div>
      </div>
    );

  // ── Game Starting ──
  } else if (state.status === 'playing' && !state.currentQuestion) {
    screen = (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <motion.p
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.8, repeat: 2 }}
            className="text-5xl font-black text-violet-400"
          >
            Prepare-se!
          </motion.p>
        </motion.div>
      </div>
    );

  // ── Question (Student answering) ──
  } else if (state.status === 'question') {
    const q = state.currentQuestion;
    if (q) {
      const timeLimit = q.timeLimit || 20;
      const timerProgress = countdown !== null ? countdown / timeLimit : 1;
      const circumference = 2 * Math.PI * 20;

      screen = (
        <div className="min-h-screen flex flex-col p-4 pt-14">
          {/* Timer & Progress header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 bg-slate-800/60 px-2.5 py-1 rounded-lg">
                {state.currentQuestionIndex + 1} / {state.totalQuestions}
              </span>
            </div>
            {/* Circular timer with SVG progress ring */}
            <motion.div
              key={countdown}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              className="relative w-14 h-14 flex items-center justify-center"
            >
              <svg className="absolute inset-0 w-14 h-14 -rotate-90" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor"
                  className="text-slate-800" strokeWidth="3" />
                <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor"
                  className={countdown <= 5 ? 'text-rose-500' : 'text-violet-500'}
                  strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - timerProgress)}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <span className={`font-bold text-lg ${
                countdown <= 5 ? 'text-rose-400 animate-pulse' : 'text-violet-400'
              }`}>
                {countdown ?? '--'}
              </span>
            </motion.div>
          </div>

          {/* Question text */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xl font-bold text-center mb-6 leading-snug px-2"
          >
            {q.text}
          </motion.h2>

          {/* Option buttons — big touch-friendly for mobile */}
          <div className="flex-1 grid grid-cols-1 gap-3">
            {q.options.map((opt, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => submitAnswer(i)}
                disabled={selectedOption !== null}
                whileTap={{ scale: 0.95 }}
                className={`relative w-full py-5 px-6 rounded-2xl font-bold text-lg text-left flex items-center gap-4 transition-all ${
                  selectedOption === i
                    ? 'ring-4 ring-white/40 brightness-110 scale-[1.02]'
                    : selectedOption !== null
                    ? 'opacity-30 scale-[0.98]'
                    : 'hover:brightness-110'
                } bg-gradient-to-r ${OPTION_COLORS[i]} shadow-lg`}
              >
                <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-base">
                  {OPTION_SHAPES[i]}
                </span>
                <span className="flex-1">{opt.text}</span>
                {selectedOption === i && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.span>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      );
    }

  // ── Answered — waiting for results ──
  } else if (state.status === 'answered') {
    const q = state.currentQuestion;
    screen = (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <AnimatePresence mode="wait">
          {answerFeedback && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center w-full max-w-md"
            >
              {/* Show the question text */}
              {q && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-slate-400 text-sm mb-6 leading-relaxed px-2"
                >
                  {q.text}
                </motion.p>
              )}

              {answerFeedback.isCorrect ? (
                <>
                  <motion.div
                    initial={{ rotate: 0 }}
                    animate={{ rotate: [0, -10, 10, -10, 0] }}
                    transition={{ duration: 0.5 }}
                    className="mb-4"
                  >
                    <svg className="w-20 h-20 mx-auto text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </motion.div>
                  <h3 className="text-3xl font-black text-emerald-400 mb-2">Correto!</h3>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-violet-400 text-2xl font-bold"
                  >
                    +{answerFeedback.score}
                  </motion.p>
                  {answerFeedback.streak > 1 && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="text-amber-400 text-sm mt-2"
                    >
                      Sequência de {answerFeedback.streak}!
                    </motion.p>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <svg className="w-20 h-20 mx-auto text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-3xl font-black text-rose-400 mb-2">Errou!</h3>
                  {/* Show which option they picked */}
                  {q && selectedOption !== null && q.options[selectedOption] && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="text-slate-500 text-sm"
                    >
                      Sua resposta: <span className="text-slate-300">{q.options[selectedOption].text}</span>
                    </motion.p>
                  )}
                </>
              )}

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-slate-600 text-xs mt-8 flex items-center justify-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-pulse" />
                Aguardando resultados...
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );

  // ── Question Results (student sees correct answer) ──
  } else if (state.status === 'results' && state.questionResults) {
    const qr = state.questionResults;
    const q = state.currentQuestion;
    screen = (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center w-full max-w-sm"
        >
          {/* Show the question text */}
          {q && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-slate-300 text-base font-medium mb-5 leading-relaxed"
            >
              {q.text}
            </motion.p>
          )}

          <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">Resposta correta</p>
          <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl px-6 py-4 mb-6">
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-lg font-bold text-emerald-300">{qr.correctText}</span>
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-4 mb-6">
            <p className="text-xs text-slate-500 mb-1">Sua pontuação</p>
            <p className="text-3xl font-black text-violet-400">
              {state.myScore.toLocaleString()}
            </p>
          </div>

          {/* Mini ranking */}
          {qr.rankings && (
            <div className="space-y-2">
              {qr.rankings.slice(0, 3).map((r, i) => (
                <motion.div
                  key={r.nickname}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm ${
                    r.nickname === state.nickname
                      ? 'bg-violet-500/15 border border-violet-500/25'
                      : 'bg-slate-800/40'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-amber-500/20 text-amber-400' :
                    i === 1 ? 'bg-slate-500/20 text-slate-400' :
                    'bg-amber-700/20 text-amber-600'
                  }`}>{i + 1}</span>
                  <span className="flex-1 font-medium text-left">{r.nickname}</span>
                  <span className="text-violet-400 font-bold">{r.score.toLocaleString()}</span>
                </motion.div>
              ))}
            </div>
          )}

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-slate-600 text-xs mt-6 flex items-center justify-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-pulse" />
            Aguardando próxima questão...
          </motion.p>
        </motion.div>
      </div>
    );

  // ── Game Finished ──
  } else if (state.status === 'finished') {
    const myRank = state.rankings.findIndex(r => r.nickname === state.nickname) + 1;
    const isTop3 = myRank <= 3 && myRank > 0;

    screen = (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring' }}
          className="text-center"
        >
          {isTop3 && (
            <motion.div
              initial={{ rotate: -180, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', delay: 0.3 }}
              className="text-6xl mb-4"
            >
              {myRank === 1 ? '🏆' : myRank === 2 ? '🥈' : '🥉'}
            </motion.div>
          )}

          <h2 className="text-3xl font-black mb-2">
            {isTop3 ? (
              <span className="bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent">
                Parabéns!
              </span>
            ) : (
              <span className="text-white">Fim de Jogo!</span>
            )}
          </h2>

          <p className="text-slate-400 mb-6">
            Você ficou em <span className="text-white font-bold">{myRank}°</span> lugar
          </p>

          <div className="bg-slate-900/50 rounded-2xl p-6 mb-6">
            <p className="text-sm text-slate-400 mb-1">Pontuação final</p>
            <motion.p
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.5 }}
              className="text-4xl font-black text-violet-400"
            >
              {state.myScore.toLocaleString()}
            </motion.p>
          </div>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            onClick={() => {
              dispatch({ type: 'RESET' });
              navigate('/');
            }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-3 rounded-xl font-bold bg-slate-700 hover:bg-slate-600 transition-colors"
          >
            Jogar novamente
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      {/* Logout button — top-left to avoid overlapping the timer at top-right */}
      {state.pin && (
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={handleLogout}
          className="fixed top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 backdrop-blur-sm border border-slate-700/50 text-slate-500 hover:text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/10 text-xs font-medium transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          Sair
        </motion.button>
      )}
      {screen}
    </>
  );
}
