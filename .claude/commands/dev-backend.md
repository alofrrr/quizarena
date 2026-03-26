# /dev-backend

Start the QuizArena backend in development mode with nodemon auto-reload.

## Steps
1. Navigate to the backend directory
2. Start nodemon server on port 4000
3. Confirm server is listening

## Command
```bash
cd /c/Users/Usuario/Desktop/quizarena/backend && npm run dev
```

Server will be available at http://localhost:4000

Socket.io endpoint: ws://localhost:4000
REST upload: POST http://localhost:4000/api/upload
Room status: GET http://localhost:4000/api/room/:pin
