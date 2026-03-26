# /verify

Full validation of the QuizArena project before committing.

## Steps
1. Check frontend builds without errors (this catches JSX errors, missing imports, type issues)
2. Verify backend starts cleanly (no syntax errors)
3. Report any failures with context

## Commands
```bash
# Step 1: Frontend build (catches most issues)
cd /c/Users/Usuario/Desktop/quizarena/frontend && npm run build 2>&1

# Step 2: Backend syntax check
node --check /c/Users/Usuario/Desktop/quizarena/backend/server.js && echo "Backend syntax OK"
```

## What This Catches
- Broken JSX / missing React imports
- Undefined component imports
- Tailwind build errors
- Node.js syntax errors in server.js
- Missing env variable references

## What This Does NOT Catch
- Socket.io runtime errors (need manual testing)
- DOCX parsing edge cases (run against real .docx files)
- Browser-specific rendering issues
