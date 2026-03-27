/**
 * QuizArena — Backend Server
 * Node.js + Express + Socket.io
 * 
 * Handles:
 *  - DOCX file upload & parsing
 *  - Room creation with 6-digit PIN
 *  - Real-time WebSocket game flow
 *  - Scoring with speed bonus
 *  - Report generation
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const mammoth = require('mammoth');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        process.env.CLIENT_URL,
        'http://localhost:3000',
        'http://localhost:3001',
      ].filter(Boolean);

      // Check exact match or if origin contains vercel.app or railway.app
      const isAllowed = allowedOrigins.some(allowed => origin === allowed || origin === allowed.replace(/\/$/, ''))
        || origin.includes('vercel.app')
        || origin.includes('railway.app')
        || origin.includes('localhost');

      callback(null, isAllowed);
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 5e6, // 5MB
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// ─── File Upload Config ───
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.docx') {
      return cb(new Error('Apenas arquivos .docx são permitidos'));
    }
    cb(null, true);
  },
});

// ─── In-Memory Data Store ───
const rooms = new Map();

// ─── Helpers ───

function generatePin() {
  let pin;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(pin));
  return pin;
}

/**
 * Parse DOCX content into structured questions.
 * Supports both formats:
 *   Inline:    1. Pergunta? a) opção b) opção c) opção (correta) d) opção
 *   Multiline: 1. Pergunta?
 *              a) opção
 *              b) opção (correta)
 *              c) opção
 *              d) opção
 */
function parseQuestions(text) {
  const questions = [];
  
  // Normalize: collapse all whitespace into single line, then re-split by question numbers
  const collapsed = text
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Split by question number pattern: "1." or "1)" preceded by space or start
  const blocks = collapsed.split(/(?=(?:^|\s)\d+[\.\)]\s)/g).filter(b => b.trim());

  for (const block of blocks) {
    try {
      // Extract question number and text (everything before first a) b) c) etc)
      const qMatch = block.match(/^\s*(\d+)[\.\)]\s*(.+?)(?=\s+[a-eA-E]\s*\))/s);
      if (!qMatch) continue;

      const questionNumber = parseInt(qMatch[1]);
      const questionText = qMatch[2].trim();

      // Extract options — look for a) b) c) d) e) patterns
      const optionRegex = /([a-eA-E])\s*\)\s*(.+?)(?=\s+[a-eA-E]\s*\)|$)/g;
      const options = [];
      let correctIndex = -1;
      let match;

      while ((match = optionRegex.exec(block)) !== null) {
        let optionText = match[2].trim();
        const letter = match[1].toLowerCase();

        // Check if this option is marked as correct
        const isCorrect = /\(correta\)/i.test(optionText);
        if (isCorrect) {
          optionText = optionText.replace(/\s*\(correta\)\s*/gi, '').trim();
          correctIndex = options.length;
        }

        // Clean trailing dots
        optionText = optionText.replace(/\.\s*$/, '').trim();

        options.push({
          letter,
          text: optionText,
        });
      }

      if (options.length >= 2 && correctIndex !== -1) {
        questions.push({
          id: questionNumber,
          text: questionText,
          options,
          correctIndex,
          timeLimit: 20, // seconds per question
        });
      }
    } catch (e) {
      console.error(`Erro ao processar bloco de questão: ${e.message}`);
    }
  }

  return questions;
}

/**
 * Calculate score with speed bonus.
 * Base: 1000 points for correct answer.
 * Speed bonus: up to +500 points, linearly decreasing with time.
 */
function calculateScore(isCorrect, responseTimeMs, timeLimitMs) {
  if (!isCorrect) return 0;
  
  const BASE_SCORE = 1000;
  const MAX_SPEED_BONUS = 500;
  
  const timeRatio = Math.max(0, 1 - (responseTimeMs / timeLimitMs));
  const speedBonus = Math.round(MAX_SPEED_BONUS * timeRatio);
  
  return BASE_SCORE + speedBonus;
}

/**
 * Generate a class performance report.
 */
function generateReport(room) {
  const { questions, players, answers } = room;
  
  const playerStats = {};
  
  for (const [socketId, player] of Object.entries(players)) {
    const playerAnswers = answers.filter(a => a.socketId === socketId);
    const correct = playerAnswers.filter(a => a.isCorrect).length;
    const avgTime = playerAnswers.length > 0
      ? Math.round(playerAnswers.reduce((sum, a) => sum + a.responseTimeMs, 0) / playerAnswers.length)
      : 0;

    const perQuestion = questions.map((q, qi) => {
      const ans = playerAnswers.find(a => a.questionIndex === qi);
      return {
        questionId: q.id,
        questionText: q.text,
        answered: !!ans,
        selectedOption: ans ? ans.selectedOption : null,
        isCorrect: ans ? ans.isCorrect : false,
        responseTimeMs: ans ? ans.responseTimeMs : null,
        score: ans ? ans.score : 0,
      };
    });

    playerStats[player.nickname] = {
      nickname: player.nickname,
      totalScore: player.score,
      correctAnswers: correct,
      totalQuestions: questions.length,
      accuracy: questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0,
      avgResponseTimeMs: avgTime,
      perQuestion,
    };
  }

  // Class-level stats
  const allPlayers = Object.values(playerStats);
  const classAvgScore = allPlayers.length > 0
    ? Math.round(allPlayers.reduce((s, p) => s + p.totalScore, 0) / allPlayers.length)
    : 0;
  const classAvgAccuracy = allPlayers.length > 0
    ? Math.round(allPlayers.reduce((s, p) => s + p.accuracy, 0) / allPlayers.length)
    : 0;

  // Per-question difficulty
  const questionStats = questions.map((q, qi) => {
    const questionAnswers = answers.filter(a => a.questionIndex === qi);
    const correctCount = questionAnswers.filter(a => a.isCorrect).length;
    return {
      questionId: q.id,
      questionText: q.text,
      totalAnswers: questionAnswers.length,
      correctAnswers: correctCount,
      accuracy: questionAnswers.length > 0
        ? Math.round((correctCount / questionAnswers.length) * 100)
        : 0,
    };
  });

  return {
    summary: {
      totalPlayers: allPlayers.length,
      totalQuestions: questions.length,
      classAvgScore,
      classAvgAccuracy,
    },
    playerStats,
    questionStats,
    generatedAt: new Date().toISOString(),
  };
}

// ─── REST Endpoints ───

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const result = await mammoth.extractRawText({ buffer: req.file.buffer });
    const questions = parseQuestions(result.value);

    if (questions.length === 0) {
      return res.status(400).json({
        error: 'Nenhuma questão encontrada. Verifique o formato do arquivo.',
        hint: 'Formato esperado: 1. Pergunta? a) opção b) opção c) opção (correta)',
      });
    }

    const pin = generatePin();

    rooms.set(pin, {
      pin,
      questions,
      players: {},
      answers: [],
      currentQuestion: -1,
      status: 'lobby', // lobby | playing | question | results | finished
      questionStartTime: null,
      hostSocketId: null,
      createdAt: Date.now(),
    });

    res.json({
      pin,
      questionCount: questions.length,
      questions: questions.map((q, i) => ({
        id: q.id,
        text: q.text,
        options: q.options.map(o => o.text),
      })),
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Erro ao processar arquivo' });
  }
});

app.get('/api/room/:pin', (req, res) => {
  const room = rooms.get(req.params.pin);
  if (!room) {
    return res.status(404).json({ error: 'Sala não encontrada' });
  }
  res.json({
    pin: room.pin,
    status: room.status,
    playerCount: Object.keys(room.players).length,
    questionCount: room.questions.length,
  });
});

// ─── Socket.io Events ───

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── Host joins room ──
  socket.on('host:join', (pin, callback) => {
    const room = rooms.get(pin);
    if (!room) return callback?.({ error: 'Sala não encontrada' });

    room.hostSocketId = socket.id;
    socket.join(pin);
    socket.data = { role: 'host', pin };

    callback?.({
      success: true,
      players: Object.values(room.players).map(p => ({
        nickname: p.nickname,
        score: p.score,
      })),
      questionCount: room.questions.length,
      status: room.status,
    });
  });

  // ── Student joins room ──
  socket.on('student:join', ({ pin, nickname }, callback) => {
    const room = rooms.get(pin);
    if (!room) return callback?.({ error: 'Sala não encontrada' });
    if (room.status !== 'lobby') return callback?.({ error: 'O jogo já começou' });
    if (Object.keys(room.players).length >= 30) return callback?.({ error: 'Sala cheia (máx. 30)' });

    // Check nickname uniqueness in room
    const nickTaken = Object.values(room.players).some(
      p => p.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (nickTaken) return callback?.({ error: 'Nickname já em uso nesta sala' });

    room.players[socket.id] = {
      socketId: socket.id,
      nickname,
      score: 0,
      streak: 0,
    };

    socket.join(pin);
    socket.data = { role: 'student', pin, nickname };

    // Notify host
    io.to(room.hostSocketId).emit('player:joined', {
      nickname,
      playerCount: Object.keys(room.players).length,
    });

    callback?.({ success: true, nickname });
  });

  // ── Student rejoin (reconexão mid-game) ──
  socket.on('student:rejoin', ({ pin, nickname }, callback) => {
    const room = rooms.get(pin);
    if (!room) return callback?.({ error: 'Sala não encontrada' });

    // Localiza o jogador pelo nickname independente do socketId antigo
    const oldEntry = Object.entries(room.players).find(
      ([, p]) => p.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (!oldEntry) return callback?.({ error: 'Jogador não encontrado na sala' });

    const [oldSocketId, playerData] = oldEntry;

    // Migra para o novo socketId
    delete room.players[oldSocketId];
    room.players[socket.id] = { ...playerData, socketId: socket.id };

    // Atualiza respostas antigas para o novo socketId
    room.answers.forEach(a => {
      if (a.socketId === oldSocketId) a.socketId = socket.id;
    });

    socket.join(pin);
    socket.data = { role: 'student', pin, nickname };

    // Monta estado atual para o aluno se resincronizar
    const player = room.players[socket.id];
    const base = { status: room.status, score: player.score, streak: player.streak };

    if (room.status === 'question') {
      const q = room.questions[room.currentQuestion];
      const elapsed = Math.floor((Date.now() - room.questionStartTime) / 1000);
      const timeRemaining = Math.max(0, q.timeLimit - elapsed);
      const alreadyAnswered = room.answers.some(
        a => a.socketId === socket.id && a.questionIndex === room.currentQuestion
      );
      return callback?.({
        ...base,
        questionIndex: room.currentQuestion,
        totalQuestions: room.questions.length,
        question: {
          id: q.id,
          text: q.text,
          options: q.options.map(o => ({ letter: o.letter, text: o.text })),
          timeLimit: q.timeLimit,
        },
        timeRemaining,
        alreadyAnswered,
      });
    }

    if (room.status === 'results') {
      const q = room.questions[room.currentQuestion];
      const questionAnswers = room.answers.filter(a => a.questionIndex === room.currentQuestion);
      const optionCounts = q.options.map((_, i) =>
        questionAnswers.filter(a => a.selectedOption === i).length
      );
      return callback?.({
        ...base,
        questionIndex: room.currentQuestion,
        totalQuestions: room.questions.length,
        correctIndex: q.correctIndex,
        correctText: q.options[q.correctIndex].text,
        optionCounts,
        totalPlayers: Object.keys(room.players).length,
        rankings: getRankings(room).slice(0, 5),
      });
    }

    if (room.status === 'finished') {
      const report = generateReport(room);
      return callback?.({ ...base, rankings: getRankings(room), report });
    }

    // lobby ou playing
    callback?.({ ...base, totalQuestions: room.questions.length });
  });

  // ── Host starts game ──
  socket.on('host:startGame', (pin) => {
    const room = rooms.get(pin);
    if (!room || room.hostSocketId !== socket.id) return;
    if (Object.keys(room.players).length === 0) return;

    room.status = 'playing';
    io.to(pin).emit('game:started', {
      totalQuestions: room.questions.length,
    });

    // Start first question after brief delay
    setTimeout(() => emitQuestion(pin), 2000);
  });

  // ── Emit next question ──
  function emitQuestion(pin) {
    const room = rooms.get(pin);
    if (!room) return;

    room.currentQuestion++;

    if (room.currentQuestion >= room.questions.length) {
      // Game over
      room.status = 'finished';
      const report = generateReport(room);
      const rankings = getRankings(room);
      io.to(pin).emit('game:finished', { rankings, report });
      return;
    }

    const q = room.questions[room.currentQuestion];
    room.status = 'question';
    room.questionStartTime = Date.now();
    room.currentAnswerCount = 0;

    // Send question to all
    io.to(pin).emit('question:show', {
      questionIndex: room.currentQuestion,
      totalQuestions: room.questions.length,
      question: {
        id: q.id,
        text: q.text,
        options: q.options.map(o => ({ letter: o.letter, text: o.text })),
        timeLimit: q.timeLimit,
      },
    });

    // Auto-advance after time limit + buffer
    room.questionTimer = setTimeout(() => {
      showQuestionResults(pin);
    }, (q.timeLimit + 1) * 1000);
  }

  function showQuestionResults(pin) {
    const room = rooms.get(pin);
    if (!room || room.status !== 'question') return;

    clearTimeout(room.questionTimer);
    room.status = 'results';

    const q = room.questions[room.currentQuestion];
    const questionAnswers = room.answers.filter(
      a => a.questionIndex === room.currentQuestion
    );

    const optionCounts = q.options.map((_, i) =>
      questionAnswers.filter(a => a.selectedOption === i).length
    );

    const rankings = getRankings(room);

    io.to(pin).emit('question:results', {
      questionIndex: room.currentQuestion,
      correctIndex: q.correctIndex,
      correctText: q.options[q.correctIndex].text,
      optionCounts,
      totalPlayers: Object.keys(room.players).length,
      rankings: rankings.slice(0, 5),
    });
  }

  // ── Host advances to next question ──
  socket.on('host:nextQuestion', (pin) => {
    const room = rooms.get(pin);
    if (!room || room.hostSocketId !== socket.id) return;
    emitQuestion(pin);
  });

  // ── Student submits answer ──
  socket.on('student:answer', ({ pin, questionIndex, selectedOption }, callback) => {
    const room = rooms.get(pin);
    if (!room || room.status !== 'question') return callback?.({ error: 'Tempo esgotado' });
    if (room.currentQuestion !== questionIndex) return callback?.({ error: 'Questão incorreta' });

    const player = room.players[socket.id];
    if (!player) return callback?.({ error: 'Jogador não encontrado' });

    // Check if already answered
    const alreadyAnswered = room.answers.some(
      a => a.socketId === socket.id && a.questionIndex === questionIndex
    );
    if (alreadyAnswered) return callback?.({ error: 'Já respondeu' });

    const q = room.questions[questionIndex];
    const responseTimeMs = Date.now() - room.questionStartTime;
    const isCorrect = selectedOption === q.correctIndex;
    const score = calculateScore(isCorrect, responseTimeMs, q.timeLimit * 1000);

    if (isCorrect) {
      player.streak++;
    } else {
      player.streak = 0;
    }
    player.score += score;

    room.answers.push({
      socketId: socket.id,
      nickname: player.nickname,
      questionIndex,
      selectedOption,
      isCorrect,
      responseTimeMs,
      score,
    });

    room.currentAnswerCount++;

    // Notify student
    callback?.({
      isCorrect,
      score,
      totalScore: player.score,
      streak: player.streak,
    });

    // Notify host of answer count
    io.to(room.hostSocketId).emit('answer:received', {
      answerCount: room.currentAnswerCount,
      totalPlayers: Object.keys(room.players).length,
    });

    // Auto-advance if all answered
    if (room.currentAnswerCount >= Object.keys(room.players).length) {
      clearTimeout(room.questionTimer);
      setTimeout(() => showQuestionResults(pin), 500);
    }
  });

  // ── Get report ──
  socket.on('host:getReport', (pin, callback) => {
    const room = rooms.get(pin);
    if (!room) return callback?.({ error: 'Sala não encontrada' });
    const report = generateReport(room);
    callback?.(report);
  });

  // ── Disconnect handling ──
  socket.on('disconnect', () => {
    const { role, pin, nickname } = socket.data || {};
    if (!pin) return;

    const room = rooms.get(pin);
    if (!room) return;

    if (role === 'student' && room.players[socket.id]) {
      delete room.players[socket.id];
      io.to(room.hostSocketId).emit('player:left', {
        nickname,
        playerCount: Object.keys(room.players).length,
      });
    }

    console.log(`[Socket] Disconnected: ${socket.id} (${role})`);
  });
});

function getRankings(room) {
  return Object.values(room.players)
    .map(p => ({
      nickname: p.nickname,
      score: p.score,
      streak: p.streak,
    }))
    .sort((a, b) => b.score - a.score);
}

// ─── Cleanup stale rooms (older than 3 hours) ───
setInterval(() => {
  const now = Date.now();
  for (const [pin, room] of rooms) {
    if (now - room.createdAt > 3 * 60 * 60 * 1000) {
      rooms.delete(pin);
      console.log(`[Cleanup] Room ${pin} removed (stale)`);
    }
  }
}, 30 * 60 * 1000);

// ─── Start Server ───
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 QuizArena server running on port ${PORT}`);
});

module.exports = { app, server, io, parseQuestions, calculateScore };
