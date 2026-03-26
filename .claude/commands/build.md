# /build

Build the frontend for production deployment.

## Steps
1. Run React production build
2. Report bundle size summary
3. List output directory contents

## Commands
```bash
cd /c/Users/Usuario/Desktop/quizarena/frontend && npm run build
```

Output goes to `frontend/build/`.

## Deploy Targets
- **Frontend**: Upload `build/` to Vercel, Netlify, or any static host
- **Backend**: Deploy `backend/` to Railway, Render, or Fly.io

## Required Env Vars for Production
- Frontend: `REACT_APP_API_URL`, `REACT_APP_SOCKET_URL` (set in hosting platform)
- Backend: `PORT`, `CLIENT_URL` (set in hosting platform)
