# /dev-frontend

Start the QuizArena React frontend in development mode.

## Steps
1. Verify backend is running on port 4000 (or set REACT_APP_SOCKET_URL)
2. Start the React development server on port 3000

## Command
```bash
cd /c/Users/Usuario/Desktop/quizarena/frontend && npm start
```

App routes:
- http://localhost:3000/        — Landing page / student join
- http://localhost:3000/host    — Professor dashboard (upload + game control)
- http://localhost:3000/play    — Student game screen

## Prerequisites
Ensure `frontend/.env` exists:
```
REACT_APP_API_URL=http://localhost:4000
REACT_APP_SOCKET_URL=http://localhost:4000
```
