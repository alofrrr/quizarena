# QuizArena

Real-time quiz platform. Professor uploads `.docx`, students join via 6-digit PIN.
Primary state lives in a `rooms` Map on the backend process. Optional Redis for persistence across restarts and late-student sync.

## Stack

- **Backend**: Node.js, Express 4, Socket.io 4.7, Mammoth.js, Multer — `backend/server.js`
- **Frontend**: React 18, React Router v6, Tailwind CSS 3.4, Framer Motion 11 — `frontend/src/`
- **Package manager**: npm (two separate workspaces: `backend/` and `frontend/`)

## Commands

```bash
# Backend (port 4000)
cd backend && npm run dev       # development with nodemon
cd backend && npm start         # production

# Frontend (port 3000)
cd frontend && npm start        # development
cd frontend && npm run build    # production build

# Install all deps
cd backend && npm install && cd ../frontend && npm install

# Verify frontend builds cleanly
cd frontend && npm run build 2>&1 | tail -5
```

## Environment Variables

```
# frontend/.env
REACT_APP_API_URL=http://localhost:4000
REACT_APP_SOCKET_URL=http://localhost:4000

# backend/.env
PORT=4000
CLIENT_URL=http://localhost:3000
REDIS_URL=redis://127.0.0.1:6379   # opcional — sem Redis, opera apenas em memória
```

## Architecture

- `backend/server.js` — single file: REST upload endpoint + all Socket.io event handlers + Redis persistence
- `frontend/src/contexts/SocketContext.js` — singleton socket, exposes `emit`, `on`, `off`
- `frontend/src/contexts/GameContext.js` — shared React state for game flow
- `frontend/src/components/` — HostPage (professor), StudentPage (student), LandingPage (join)
- Room lifecycle: `lobby → playing → question → results → finished`
- Rooms auto-deleted after 3 hours; max 30 players per room

## Socket.io Events (Quick Reference)

| Direction      | Event               | Key payload                        |
|----------------|---------------------|------------------------------------|
| Host → Server  | `host:join`         | `pin`                              |
| Host → Server  | `host:startGame`    | `pin`                              |
| Host → Server  | `host:nextQuestion` | `pin`                              |
| Student → Server | `student:join`    | `{ pin, nickname }`                |
| Student → Server | `student:answer`  | `{ pin, questionIndex, selectedOption }` |
| Server → All   | `question:show`     | `{ question, questionIndex }`      |
| Server → All   | `question:results`  | `{ correctIndex, rankings }`       |
| Server → All   | `game:finished`     | `{ rankings, report }`             |
| Student → Server | `session:restore` | `{ pin, nickname }` → callback with sync state |

## .docx Question Format

```
1. Question text here?
a) Option A
b) Option B
c) Correct option (correta)
d) Option D
```

Rules: number + `.` or `)`, options `a)`–`e)`, correct answer marked `(correta)`.

## Code Style

- Portuguese for user-facing strings and comments; English for code identifiers
- No linter configured — keep existing style consistent (2-space indent, single quotes)
- Socket event names: `noun:verb` pattern (e.g. `host:join`, `game:started`)
- Framer Motion for all transitions; avoid plain CSS animations

## Workflow

Use Plan Mode (Shift+Tab twice) for: multi-file refactors, new Socket.io events, scoring changes.

Always verify before committing:
```bash
cd frontend && npm run build
```

For Socket.io bugs, use the `/socket-debugger` subagent.
After fixing bugs, run `/evolve-claude-md` to capture learnings.

## Conventions

- Commits: `feat(scope): description` / `fix(scope): description` (Conventional Commits)
- Scopes: `backend`, `frontend`, `socket`, `parser`, `scoring`, `ui`

Last updated: 2026-03-26
