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
const Redis = require('ioredis');

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

// ─── Redis Client ───
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
let redis = null;
let redisReady = false;

try {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) return null; // para de tentar após 5 falhas
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  redis.connect().then(async () => {
    redisReady = true;
    console.log('[Redis] Conectado com sucesso');

    // Preload: restaura salas ativas do Redis para a memória
    try {
      const stream = redis.scanStream({ match: 'quizarena:room:*', count: 100 });
      let loaded = 0;
      stream.on('data', async (keys) => {
        for (const key of keys) {
          try {
            const data = await redis.get(key);
            if (!data) continue;
            const room = JSON.parse(data);
            if (!rooms.has(room.pin)) {
              rooms.set(room.pin, { ...room, questionTimer: null });
              loaded++;
            }
          } catch (e) {
            console.warn(`[Redis] Erro ao restaurar ${key}:`, e.message);
          }
        }
      });
      stream.on('end', () => {
        if (loaded > 0) console.log(`[Redis] ${loaded} sala(s) restaurada(s) do cache`);
      });
    } catch (err) {
      console.warn('[Redis] Erro no preload de salas:', err.message);
    }
  }).catch((err) => {
    console.warn('[Redis] Não foi possível conectar — operando apenas com memória:', err.message);
    redisReady = false;
  });

  redis.on('error', (err) => {
    if (redisReady) console.warn('[Redis] Erro de conexão:', err.message);
    redisReady = false;
  });

  redis.on('ready', () => {
    redisReady = true;
  });
} catch (err) {
  console.warn('[Redis] Falha ao criar cliente — operando apenas com memória:', err.message);
}

// ─── Redis Helpers ───

// Chave dinâmica por sala — garante isolamento entre salas
function redisKey(pin) {
  return `quizarena:room:${pin}`;
}

// Debounce por sala: evita escritas excessivas durante mudanças rápidas
const debounceTimers = new Map();
const DEBOUNCE_MS = 300;

// Grace period para reconexão — evita deletar jogador durante page refresh
const disconnectTimers = new Map();
const DISCONNECT_GRACE_MS = 30000; // 30 segundos

/**
 * Salva o estado da sala no Redis com debounce.
 * Serializa apenas os campos necessários (funções e timers não são serializáveis).
 */
function saveRoomToRedis(pin, room) {
  if (!redisReady || !redis) return;

  // Cancela timer anterior para esta sala
  if (debounceTimers.has(pin)) {
    clearTimeout(debounceTimers.get(pin));
  }

  debounceTimers.set(pin, setTimeout(async () => {
    debounceTimers.delete(pin);
    try {
      const serializable = {
        pin: room.pin,
        questions: room.questions,
        players: room.players,
        answers: room.answers,
        currentQuestion: room.currentQuestion,
        status: room.status,
        questionStartTime: room.questionStartTime,
        hostSocketId: room.hostSocketId,
        createdAt: room.createdAt,
        currentAnswerCount: room.currentAnswerCount || 0,
      };
      // TTL de 3h — mesmo tempo de vida das salas em memória
      await redis.set(redisKey(pin), JSON.stringify(serializable), 'EX', 3 * 60 * 60);
    } catch (err) {
      console.warn(`[Redis] Erro ao salvar sala ${pin}:`, err.message);
    }
  }, DEBOUNCE_MS));
}

/**
 * Salva imediatamente (sem debounce) — para momentos críticos como
 * início de questão ou fim de jogo onde o estado precisa estar disponível
 * instantaneamente para reconexões.
 */
async function saveRoomToRedisImmediate(pin, room) {
  if (!redisReady || !redis) return;

  // Cancela qualquer debounce pendente
  if (debounceTimers.has(pin)) {
    clearTimeout(debounceTimers.get(pin));
    debounceTimers.delete(pin);
  }

  try {
    const serializable = {
      pin: room.pin,
      questions: room.questions,
      players: room.players,
      answers: room.answers,
      currentQuestion: room.currentQuestion,
      status: room.status,
      questionStartTime: room.questionStartTime,
      hostSocketId: room.hostSocketId,
      createdAt: room.createdAt,
      currentAnswerCount: room.currentAnswerCount || 0,
    };
    await redis.set(redisKey(pin), JSON.stringify(serializable), 'EX', 3 * 60 * 60);
  } catch (err) {
    console.warn(`[Redis] Erro ao salvar sala ${pin}:`, err.message);
  }
}

/**
 * Recupera o estado da sala do Redis.
 * Retorna null se a chave não existir ou Redis estiver indisponível.
 */
async function getRoomFromRedis(pin) {
  if (!redisReady || !redis) return null;

  try {
    const data = await redis.get(redisKey(pin));
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    console.warn(`[Redis] Erro ao recuperar sala ${pin}:`, err.message);
    return null;
  }
}

/**
 * Remove a sala do Redis.
 */
async function deleteRoomFromRedis(pin) {
  if (!redisReady || !redis) return;
  try {
    await redis.del(redisKey(pin));
  } catch (err) {
    console.warn(`[Redis] Erro ao remover sala ${pin}:`, err.message);
  }
}

/**
 * Cancela o timer de desconexão de um jogador (se existir).
 * Chamado quando o jogador reconecta antes do grace period expirar.
 */
function cancelDisconnectTimer(pin, nickname) {
  const key = `${pin}:${nickname.toLowerCase()}`;
  if (disconnectTimers.has(key)) {
    clearTimeout(disconnectTimers.get(key));
    disconnectTimers.delete(key);
  }
}

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

    const room = {
      pin,
      questions,
      players: {},
      answers: [],
      currentQuestion: -1,
      status: 'lobby', // lobby | playing | question | results | finished
      questionStartTime: null,
      hostSocketId: null,
      createdAt: Date.now(),
    };
    rooms.set(pin, room);
    saveRoomToRedis(pin, room);

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

app.get('/api/room/:pin', async (req, res) => {
  let room = rooms.get(req.params.pin);

  // Fallback: tenta recuperar do Redis se não está em memória
  if (!room && redisReady) {
    const cached = await getRoomFromRedis(req.params.pin);
    if (cached) {
      rooms.set(req.params.pin, { ...cached, questionTimer: null });
      room = rooms.get(req.params.pin);
      console.log(`[Redis] Sala ${req.params.pin} restaurada do cache (GET /api/room)`);
    }
  }

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

  // ── Sincronização inicial: aluno atrasado ou reconexão após restart do servidor ──
  // O frontend emite 'session:restore' com { pin, nickname } se tiver sessão salva.
  // Usamos socket.emit (privado) para não afetar outros clientes na sala.
  socket.on('session:restore', async ({ pin, nickname }, callback) => {
    // 1. Tenta encontrar a sala na memória
    let room = rooms.get(pin);

    // 2. Se não está em memória, tenta recuperar do Redis (ex: após restart do servidor)
    if (!room && redisReady) {
      const cached = await getRoomFromRedis(pin);
      if (cached) {
        // Reconstrói a sala na memória a partir do Redis
        rooms.set(pin, {
          ...cached,
          questionTimer: null, // timers não são serializáveis
        });
        room = rooms.get(pin);
        console.log(`[Redis] Sala ${pin} restaurada do cache`);
      }
    }

    if (!room) return callback?.({ error: 'Sala não encontrada' });

    // Verifica se o jogador existe na sala
    const playerEntry = Object.entries(room.players).find(
      ([, p]) => p.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (!playerEntry) return callback?.({ error: 'Jogador não encontrado na sala' });

    const [oldSocketId, playerData] = playerEntry;

    // Cancela timer de desconexão pendente (page refresh rápido)
    cancelDisconnectTimer(pin, nickname);

    // Migra para o novo socketId
    if (oldSocketId !== socket.id) {
      delete room.players[oldSocketId];
      room.players[socket.id] = { ...playerData, socketId: socket.id };
      room.answers.forEach(a => {
        if (a.socketId === oldSocketId) a.socketId = socket.id;
      });
      saveRoomToRedis(pin, room);
    }

    socket.join(pin);
    socket.data = { role: 'student', pin, nickname };

    // Monta estado atual — apenas para quem conectou (socket.emit, NÃO io.emit)
    const player = room.players[socket.id];
    const syncPayload = {
      status: room.status,
      score: player.score,
      streak: player.streak,
      totalQuestions: room.questions.length,
    };

    if (room.status === 'question') {
      const q = room.questions[room.currentQuestion];
      const elapsed = Math.floor((Date.now() - room.questionStartTime) / 1000);
      const timeRemaining = Math.max(0, q.timeLimit - elapsed);
      const alreadyAnswered = room.answers.some(
        a => a.socketId === socket.id && a.questionIndex === room.currentQuestion
      );
      syncPayload.questionIndex = room.currentQuestion;
      syncPayload.question = {
        id: q.id,
        text: q.text,
        options: q.options.map(o => ({ letter: o.letter, text: o.text })),
        timeLimit: q.timeLimit,
      };
      syncPayload.timeRemaining = timeRemaining;
      syncPayload.alreadyAnswered = alreadyAnswered;
    } else if (room.status === 'results') {
      const q = room.questions[room.currentQuestion];
      const questionAnswers = room.answers.filter(a => a.questionIndex === room.currentQuestion);
      syncPayload.questionIndex = room.currentQuestion;
      syncPayload.correctIndex = q.correctIndex;
      syncPayload.correctText = q.options[q.correctIndex].text;
      syncPayload.optionCounts = q.options.map((_, i) =>
        questionAnswers.filter(a => a.selectedOption === i).length
      );
      syncPayload.totalPlayers = Object.keys(room.players).length;
      syncPayload.rankings = getRankings(room).slice(0, 5);
    } else if (room.status === 'finished') {
      syncPayload.rankings = getRankings(room);
      syncPayload.report = generateReport(room);
    }

    // Emite APENAS para este socket — não afeta outros clientes
    callback?.(syncPayload);
  });

  // ── Host joins room ──
  socket.on('host:join', async (pin, callback) => {
    let room = rooms.get(pin);

    // Fallback: tenta recuperar do Redis se não está em memória
    if (!room && redisReady) {
      const cached = await getRoomFromRedis(pin);
      if (cached) {
        rooms.set(pin, { ...cached, questionTimer: null });
        room = rooms.get(pin);
        console.log(`[Redis] Sala ${pin} restaurada do cache (host:join)`);
      }
    }

    if (!room) return callback?.({ error: 'Sala não encontrada' });

    room.hostSocketId = socket.id;
    socket.join(pin);
    socket.data = { role: 'host', pin };
    saveRoomToRedis(pin, room);

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
  socket.on('student:join', async ({ pin, nickname }, callback) => {
    let room = rooms.get(pin);

    // Fallback: tenta recuperar do Redis se não está em memória
    if (!room && redisReady) {
      const cached = await getRoomFromRedis(pin);
      if (cached) {
        rooms.set(pin, { ...cached, questionTimer: null });
        room = rooms.get(pin);
        console.log(`[Redis] Sala ${pin} restaurada do cache (student:join)`);
      }
    }

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

    saveRoomToRedis(pin, room);
    callback?.({ success: true, nickname });
  });

  // ── Student rejoin (reconexão mid-game) ──
  socket.on('student:rejoin', async ({ pin, nickname }, callback) => {
    let room = rooms.get(pin);

    // Fallback: tenta recuperar do Redis se não está em memória
    if (!room && redisReady) {
      const cached = await getRoomFromRedis(pin);
      if (cached) {
        rooms.set(pin, { ...cached, questionTimer: null });
        room = rooms.get(pin);
        console.log(`[Redis] Sala ${pin} restaurada do cache (rejoin)`);
      }
    }

    if (!room) return callback?.({ error: 'Sala não encontrada' });

    // Localiza o jogador pelo nickname independente do socketId antigo
    const oldEntry = Object.entries(room.players).find(
      ([, p]) => p.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (!oldEntry) return callback?.({ error: 'Jogador não encontrado na sala' });

    const [oldSocketId, playerData] = oldEntry;

    // Cancela timer de desconexão pendente (page refresh rápido)
    cancelDisconnectTimer(pin, nickname);

    // Migra para o novo socketId
    delete room.players[oldSocketId];
    room.players[socket.id] = { ...playerData, socketId: socket.id };

    // Atualiza respostas antigas para o novo socketId
    room.answers.forEach(a => {
      if (a.socketId === oldSocketId) a.socketId = socket.id;
    });

    socket.join(pin);
    socket.data = { role: 'student', pin, nickname };
    saveRoomToRedis(pin, room);

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
    saveRoomToRedisImmediate(pin, room);
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
      saveRoomToRedisImmediate(pin, room);
      io.to(pin).emit('game:finished', { rankings, report });
      return;
    }

    const q = room.questions[room.currentQuestion];
    room.status = 'question';
    room.questionStartTime = Date.now();
    room.currentAnswerCount = 0;

    // Salva imediatamente — alunos reconectando precisam ver a questão atual
    saveRoomToRedisImmediate(pin, room);

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
    saveRoomToRedisImmediate(pin, room);

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

    // Debounced — respostas podem chegar em rajada
    saveRoomToRedis(pin, room);

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
  socket.on('host:getReport', async (pin, callback) => {
    let room = rooms.get(pin);

    // Fallback: tenta recuperar do Redis
    if (!room && redisReady) {
      const cached = await getRoomFromRedis(pin);
      if (cached) {
        rooms.set(pin, { ...cached, questionTimer: null });
        room = rooms.get(pin);
        console.log(`[Redis] Sala ${pin} restaurada do cache (host:getReport)`);
      }
    }

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
      // No lobby, remove imediatamente — não há rejoin esperado
      if (room.status === 'lobby') {
        delete room.players[socket.id];
        io.to(room.hostSocketId).emit('player:left', {
          nickname,
          playerCount: Object.keys(room.players).length,
        });
        saveRoomToRedis(pin, room);
      } else {
        // Durante o jogo, aguarda grace period antes de remover
        // Permite que o aluno reconecte após page refresh
        const key = `${pin}:${nickname.toLowerCase()}`;
        const timer = setTimeout(() => {
          disconnectTimers.delete(key);
          const currentRoom = rooms.get(pin);
          if (!currentRoom) return;

          // Verifica se o jogador ainda está com o socketId antigo
          // (se reconectou, o socketId já mudou e não deve ser removido)
          if (currentRoom.players[socket.id]) {
            delete currentRoom.players[socket.id];
            io.to(currentRoom.hostSocketId).emit('player:left', {
              nickname,
              playerCount: Object.keys(currentRoom.players).length,
            });
            saveRoomToRedis(pin, currentRoom);
            console.log(`[Disconnect] Jogador ${nickname} removido da sala ${pin} (grace period expirou)`);
          }
        }, DISCONNECT_GRACE_MS);
        disconnectTimers.set(key, timer);
        console.log(`[Disconnect] Grace period iniciado para ${nickname} na sala ${pin}`);
      }
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
      deleteRoomFromRedis(pin);
      console.log(`[Cleanup] Room ${pin} removed (stale)`);
    }
  }
}, 30 * 60 * 1000);

// ─── Serve Frontend (production) ───
// Em produção o backend serve os arquivos estáticos do React build
const frontendBuild = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuild, 'index.html'));
  });
  console.log('[Static] Servindo frontend build de', frontendBuild);
}

// ─── Start Server ───
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 QuizArena server running on port ${PORT}`);
});

module.exports = { app, server, io, parseQuestions, calculateScore };
