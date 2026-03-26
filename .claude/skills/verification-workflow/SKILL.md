# Verification-First Development

Write test → implement → verify — adapted for QuizArena's no-test-framework setup.

## Manual Test Protocol

Since QuizArena has no automated test runner, use this structured manual verification checklist.

### Before Any Change
```bash
node --check /c/Users/Usuario/Desktop/quizarena/backend/server.js
cd /c/Users/Usuario/Desktop/quizarena/frontend && npm run build
```

### Full Game Flow Checklist
- [ ] Professor uploads valid `.docx` → receives PIN + question count
- [ ] Professor opens `/host?pin=XXXXXX` → sees lobby
- [ ] Student opens `/` → enters PIN + nickname → appears in lobby
- [ ] Duplicate nickname rejected
- [ ] Professor clicks Start → question appears on both screens
- [ ] Student answers → receives `isCorrect`, `score`, `streak`
- [ ] Host sees `answerCount` update
- [ ] After 20s (or all answer) → results screen shows correct option + rankings
- [ ] Professor advances → next question shown
- [ ] After last question → podium + report appear
- [ ] Report JSON downloads correctly

### DOCX Parser Verification
```bash
node -e "
const { parseQuestions } = require('./backend/server.js');
// Test multiline format
const multi = \`1. What is 2+2?
a) 3
b) 4 (correta)
c) 5\`;
const r = parseQuestions(multi);
console.assert(r.length === 1, 'Should parse 1 question');
console.assert(r[0].correctIndex === 1, 'Correct index should be 1');
console.log('Parser test passed:', r[0]);
"
```

### Scoring Verification
```bash
node -e "
const { calculateScore } = require('./backend/server.js');
console.assert(calculateScore(false, 5000, 20000) === 0, 'Wrong answer = 0');
console.assert(calculateScore(true, 0, 20000) === 1500, 'Instant = 1500');
console.assert(calculateScore(true, 20000, 20000) === 1000, 'Last ms = 1000');
console.log('Scoring tests passed');
"
```

## Adding Real Tests Later

If a test framework is added (Jest recommended), place tests in:
- `backend/__tests__/parseQuestions.test.js`
- `backend/__tests__/calculateScore.test.js`
- `frontend/src/__tests__/` for React components

## Checklist Before Commit
- [ ] `node --check backend/server.js` passes
- [ ] `cd frontend && npm run build` succeeds
- [ ] Manual game flow tested end-to-end
- [ ] No `console.error` or `[Socket] Connection error` in logs
