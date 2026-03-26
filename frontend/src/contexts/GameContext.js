/**
 * GameContext.js
 * Manages game state: room data, current question, scores, rankings.
 * State is persisted to localStorage so that a page refresh restores the session.
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { salvarLocal, carregarLocal, removerLocal } from '../utils/storage';

const GameContext = createContext(null);

export const SESSION_KEY = 'quizarena_session';

const initialState = {
  role: null,         // 'host' | 'student'
  pin: null,
  nickname: null,
  status: 'idle',     // idle | lobby | playing | question | answered | results | finished
  players: [],
  questions: [],
  currentQuestion: null,
  currentQuestionIndex: -1,
  totalQuestions: 0,
  answerCount: 0,
  myAnswer: null,
  myScore: 0,
  myStreak: 0,
  rankings: [],
  report: null,
  questionResults: null,
};

function loadFromStorage() {
  // Usa o utilitário para não duplicar try/catch aqui
  const saved = carregarLocal(SESSION_KEY);
  if (!saved) return initialState;
  // Spread garante que campos novos em initialState nunca fiquem ausentes
  // caso a sessão salva seja de uma versão anterior do código
  return { ...initialState, ...saved };
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_ROLE':
      return { ...state, role: action.payload };
    case 'SET_ROOM':
      return { ...state, pin: action.payload.pin, status: 'lobby' };
    case 'SET_NICKNAME':
      return { ...state, nickname: action.payload };
    case 'SET_QUESTIONS':
      return { ...state, questions: action.payload, totalQuestions: action.payload.length };
    case 'PLAYER_JOINED':
      return {
        ...state,
        players: [...state.players.filter(p => p.nickname !== action.payload.nickname), action.payload],
      };
    case 'PLAYER_LEFT':
      return {
        ...state,
        players: state.players.filter(p => p.nickname !== action.payload.nickname),
      };
    case 'SET_PLAYERS':
      return { ...state, players: action.payload };
    case 'GAME_STARTED':
      return { ...state, status: 'playing', totalQuestions: action.payload.totalQuestions };
    case 'SHOW_QUESTION':
      return {
        ...state,
        status: 'question',
        currentQuestion: action.payload.question,
        currentQuestionIndex: action.payload.questionIndex,
        totalQuestions: action.payload.totalQuestions,
        myAnswer: null,
        answerCount: 0,
        questionResults: null,
      };
    case 'ANSWER_SUBMITTED':
      return {
        ...state,
        status: 'answered',
        myAnswer: action.payload,
        myScore: action.payload.totalScore,
        myStreak: action.payload.streak,
      };
    case 'ANSWER_RECEIVED':
      return {
        ...state,
        answerCount: action.payload.answerCount,
      };
    case 'QUESTION_RESULTS':
      return {
        ...state,
        status: 'results',
        questionResults: action.payload,
        rankings: action.payload.rankings || state.rankings,
      };
    case 'GAME_FINISHED':
      return {
        ...state,
        status: 'finished',
        rankings: action.payload.rankings,
        report: action.payload.report,
      };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

export function GameProvider({ children }) {
  // Initialise from localStorage so a page refresh restores the session
  const [state, dispatch] = useReducer(gameReducer, undefined, loadFromStorage);

  // Persiste o estado no localStorage a cada mudança.
  // Quando role é null (após RESET) remove a chave para não deixar lixo.
  useEffect(() => {
    if (state.role) {
      salvarLocal(SESSION_KEY, state);
    } else {
      removerLocal(SESSION_KEY);
    }
  }, [state]);

  const resetGame = useCallback(() => dispatch({ type: 'RESET' }), []);

  return (
    <GameContext.Provider value={{ state, dispatch, resetGame }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

export default GameContext;
