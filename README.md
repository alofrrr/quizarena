# 🏟️ QuizArena

**Plataforma educacional de quiz em tempo real** inspirada no Kahoot, construída com React + Node.js + Socket.io.

---

## 📋 Visão Geral

O QuizArena permite que professores criem salas de quiz a partir de arquivos `.docx`, enquanto alunos respondem em tempo real pelo celular. O ranking é atualizado ao vivo e um relatório detalhado é gerado ao final.

### Fluxo Principal

```
Professor                          Alunos
   │                                  │
   ├── Upload .docx ──────────────────┤
   ├── Recebe PIN (6 dígitos) ────────┤
   │                                  ├── Acessam URL
   │                                  ├── Inserem PIN + Nickname
   ├── Vê lobby com jogadores ◄───────┤
   ├── Inicia jogo ───────────────────┤
   │                                  │
   │    ┌─── Loop por questão ───┐    │
   │    │ Projeta pergunta       │    │
   │    │                        │    ├── Respondem no celular
   │    │ Vê distribuição        │    ├── Recebem feedback
   │    │ Vê ranking top 5       │    ├── Veem pontuação
   │    │ Avança ────────────────│────┤
   │    └────────────────────────┘    │
   │                                  │
   ├── Pódio final animado           ├── Veem posição final
   ├── Baixa relatório JSON          │
   └──────────────────────────────────┘
```

---

## 🗂️ Estrutura de Pastas

```
quizarena/
├── backend/
│   ├── server.js              # Servidor Express + Socket.io
│   └── package.json           # Dependências do backend
│
├── frontend/
│   ├── public/
│   │   └── index.html         # HTML base
│   ├── src/
│   │   ├── components/
│   │   │   ├── LandingPage.js   # Tela inicial / entrada do aluno
│   │   │   ├── HostPage.js      # Dashboard do professor
│   │   │   └── StudentPage.js   # Tela de jogo do aluno
│   │   ├── contexts/
│   │   │   ├── SocketContext.js  # Provider Socket.io
│   │   │   └── GameContext.js    # Estado global do jogo
│   │   ├── utils/
│   │   │   └── antiCheat.js     # Bloqueio de cópia/seleção
│   │   ├── App.js               # Rotas principais
│   │   ├── index.js             # Entry point React
│   │   └── index.css            # Tailwind + estilos globais
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
│
├── sample-questions.txt       # Exemplo de formato de questões
├── .env.example               # Variáveis de ambiente
└── README.md
```

---

## 🚀 Instalação e Execução

### Pré-requisitos
- Node.js 18+
- npm ou yarn

### 1. Backend

```bash
cd backend
npm install
npm run dev    # desenvolvimento (com nodemon)
# ou
npm start      # produção
```

O servidor roda em `http://localhost:4000`.

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

A aplicação React roda em `http://localhost:3000`.

### 3. Variáveis de Ambiente

Crie um `.env` em cada diretório:

**frontend/.env**
```
REACT_APP_API_URL=http://localhost:4000
REACT_APP_SOCKET_URL=http://localhost:4000
```

**backend/.env**
```
PORT=4000
CLIENT_URL=http://localhost:3000
```

---

## 📝 Formato do Arquivo .docx

O sistema faz parsing de arquivos Word com o seguinte padrão:

```
1. Texto da pergunta aqui?
a) Primeira opção
b) Segunda opção
c) Terceira opção (correta)
d) Quarta opção

2. Outra pergunta?
a) Opção A (correta)
b) Opção B
c) Opção C
```

### Regras:
- Cada questão começa com **número seguido de ponto** (`1.`) ou parêntese (`1)`)
- Opções usam **letras de a) até e)**
- A resposta correta é marcada com **(correta)** ao final da opção
- Suporta de 2 a 5 opções por questão
- Quebras de linha e espaçamento variado são tolerados

---

## ⚡ Tecnologias

| Camada     | Tecnologia                     |
|------------|--------------------------------|
| Frontend   | React 18, React Router 6       |
| Estilo     | Tailwind CSS 3.4               |
| Animações  | Framer Motion 11               |
| Backend    | Node.js, Express 4             |
| WebSocket  | Socket.io 4.7                  |
| Parsing    | Mammoth.js (DOCX → texto)      |
| Upload     | Multer                         |

---

## 🎮 Funcionalidades

### Sistema de Salas
- PIN único de 6 dígitos gerado automaticamente
- Suporte para até **30 conexões simultâneas**
- Limpeza automática de salas inativas (3h)

### Gamificação
- **1000 pontos** base por acerto
- **Bônus de velocidade**: até +500 pontos (decrescente linearmente)
- **Streak**: sequência de acertos consecutivos exibida
- Fórmula: `score = 1000 + 500 × (1 - tempoResposta/tempoLimite)`

### Anti-Cola (tela do aluno)
- Seleção de texto bloqueada (CSS `user-select: none`)
- Menu de clique direito bloqueado
- Atalhos bloqueados: Ctrl+C, Ctrl+A, Ctrl+U, Ctrl+S, Ctrl+P
- F12 e Ctrl+Shift+I (DevTools) bloqueados
- Arrastar texto/elementos bloqueado

### Interface
- **Mobile-first** para alunos (botões grandes, touch-friendly)
- **Desktop-optimized** para professor (projeção em tela grande)
- Animações de transição entre questões
- Barras animadas de distribuição de respostas
- Pódio 3D estilizado no final
- Cores por opção (rosa, azul, âmbar, verde) com formas geométricas

### Relatório
Ao encerrar, gera JSON com:
- Resumo da turma (média de acertos, média de pontuação)
- Performance individual (acertos, tempo médio, pontuação por questão)
- Estatísticas por questão (dificuldade, % de acerto)

---

## 🔌 Eventos Socket.io

### Emitidos pelo Host
| Evento              | Payload              | Descrição                  |
|---------------------|----------------------|----------------------------|
| `host:join`         | `pin`                | Host entra na sala         |
| `host:startGame`    | `pin`                | Inicia o jogo              |
| `host:nextQuestion` | `pin`                | Avança para próxima questão|
| `host:getReport`    | `pin`                | Solicita relatório         |

### Emitidos pelo Aluno
| Evento            | Payload                              | Descrição          |
|-------------------|--------------------------------------|--------------------|
| `student:join`    | `{ pin, nickname }`                  | Aluno entra na sala|
| `student:answer`  | `{ pin, questionIndex, selectedOption }` | Envia resposta |

### Emitidos pelo Servidor
| Evento              | Payload                    | Descrição                    |
|---------------------|----------------------------|------------------------------|
| `player:joined`     | `{ nickname, playerCount }`| Novo jogador no lobby        |
| `player:left`       | `{ nickname, playerCount }`| Jogador saiu                 |
| `game:started`      | `{ totalQuestions }`       | Jogo iniciado                |
| `question:show`     | `{ question, questionIndex }` | Nova pergunta             |
| `question:results`  | `{ correctIndex, rankings }` | Resultado da questão      |
| `answer:received`   | `{ answerCount }`          | Contagem de respostas        |
| `game:finished`     | `{ rankings, report }`    | Fim do jogo + relatório      |

---

## 🏗️ Deploy

### Backend (Railway / Render / Fly.io)
```bash
cd backend
# Defina PORT e CLIENT_URL nas variáveis de ambiente
npm start
```

### Frontend (Vercel / Netlify)
```bash
cd frontend
npm run build
# Deploy da pasta build/
# Defina REACT_APP_API_URL e REACT_APP_SOCKET_URL
```

### Docker (opcional)
```dockerfile
# backend/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 4000
CMD ["node", "server.js"]
```

---

## 📄 Licença

MIT — Uso livre para fins educacionais.
