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
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-20 h-20 rounded-full bg-violet-500/20 border-2 border-violet-500/50 flex items-center justify-center mx-auto mb-6"
          >
            <span className="text-3xl font-bold text-violet-400">
              {state.nickname?.[0]?.toUpperCase()}
            </span>
          </motion.div>

          <h2 className="text-2xl font-bold mb-1">{state.nickname}</h2>
          <p className="text-slate-400 mb-8">Você está na sala!</p>

          <div className="bg-slate-900/50 rounded-2xl p-6 inline-block">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full"
              />
              <span className="text-slate-300">Aguardando o professor iniciar...</span>
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
      screen = (
        <div className="min-h-screen flex flex-col p-4">
          {/* Timer & Progress */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-slate-500">
              {state.currentQuestionIndex + 1}/{state.totalQuestions}
            </span>
            <motion.div
              key={countdown}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl border-2 ${
                countdown <= 5 ? 'border-rose-500 text-rose-400 animate-pulse' : 'border-violet-500 text-violet-400'
              }`}
            >
              {countdown ?? '--'}
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
                    ? 'ring-4 ring-white/50 brightness-110'
                    : selectedOption !== null
                    ? 'opacity-40'
                    : ''
                } bg-gradient-to-r ${OPTION_COLORS[i]} shadow-lg`}
              >
                <span className="text-2xl opacity-70">{OPTION_SHAPES[i]}</span>
                <span className="flex-1">{opt.text}</span>
                {selectedOption === i && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center"
                  >
                    ✓
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
    screen = (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <AnimatePresence mode="wait">
          {answerFeedback && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              {answerFeedback.isCorrect ? (
                <>
                  <motion.div
                    initial={{ rotate: 0 }}
                    animate={{ rotate: [0, -10, 10, -10, 0] }}
                    transition={{ duration: 0.5 }}
                    className="text-7xl mb-4"
                  >
                    <svg className="w-24 h-24 mx-auto text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                  <div className="text-7xl mb-4">
                    <svg className="w-24 h-24 mx-auto text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-3xl font-black text-rose-400">Errou!</h3>
                </>
              )}

              <p className="text-slate-500 text-sm mt-6">
                Aguardando próxima questão...
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );

  // ── Question Results (student sees correct answer) ──
  } else if (state.status === 'results' && state.questionResults) {
    const qr = state.questionResults;
    screen = (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center w-full max-w-sm"
        >
          <p className="text-slate-400 text-sm mb-2">Resposta correta</p>
          <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-2xl px-6 py-4 mb-6">
            <span className="text-xl font-bold text-emerald-300">{qr.correctText}</span>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
            <p className="text-sm text-slate-400 mb-1">Sua pontuação</p>
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
                  className={`flex items-center gap-3 px-4 py-2 rounded-xl text-sm ${
                    r.nickname === state.nickname
                      ? 'bg-violet-500/20 border border-violet-500/30'
                      : 'bg-slate-800/50'
                  }`}
                >
                  <span className="font-bold text-slate-500 w-5">{i + 1}</span>
                  <span className="flex-1 font-medium">{r.nickname}</span>
                  <span className="text-violet-400 font-bold">{r.score.toLocaleString()}</span>
                </motion.div>
              ))}
            </div>
          )}

          <p className="text-slate-600 text-xs mt-6">Aguardando próxima questão...</p>
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
      {/* Logout button — visible whenever there is an active session */}
      {state.pin && (
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={handleLogout}
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/90 backdrop-blur border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/10 text-sm font-medium transition-all shadow-lg"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sair
        </motion.button>
      )}
      {screen}
    </>
  );
}
