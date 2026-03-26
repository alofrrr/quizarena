# /setup

Install all dependencies for both backend and frontend workspaces.

## Steps
1. Install backend dependencies
2. Install frontend dependencies
3. Verify .env files exist (create from examples if missing)
4. Report ready status

## Commands
```bash
cd /c/Users/Usuario/Desktop/quizarena/backend && npm install
cd /c/Users/Usuario/Desktop/quizarena/frontend && npm install
```

## Environment Setup
After installing, ensure both `.env` files exist:

**backend/.env**
```
PORT=4000
CLIENT_URL=http://localhost:3000
```

**frontend/.env**
```
REACT_APP_API_URL=http://localhost:4000
REACT_APP_SOCKET_URL=http://localhost:4000
```

## Verify
```bash
node -e "require('./backend/server.js')" 2>&1 | head -3
```
