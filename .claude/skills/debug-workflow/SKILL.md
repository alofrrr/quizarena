# Debug Workflow

Systematic debugging for QuizArena issues.

## When to Use
- Socket.io events not reaching clients
- Students can't join or answer
- DOCX parsing produces wrong/missing questions
- Scoring or ranking is incorrect
- React state not updating after socket event

## Workflow

### 1. Reproduce
- [ ] Identify which role is affected: host, student, or both
- [ ] Note the room status at the time (`lobby | playing | question | results | finished`)
- [ ] Check browser console for socket connection errors
- [ ] Check backend terminal for `[Socket]` log lines

### 2. Isolate

**For socket issues:**
```bash
# Add temporary logging to server.js
io.on('connection', (socket) => {
  socket.onAny((event, ...args) => console.log('[DEBUG]', socket.id, event, args));
});
```

**For DOCX parsing issues:**
```bash
# Test parseQuestions directly
node -e "
const { parseQuestions } = require('./backend/server.js');
const text = \`1. Test question? a) Option A b) Option B (correta) c) Option C\`;
console.log(JSON.stringify(parseQuestions(text), null, 2));
"
```

**For React state issues:**
- Check `SocketContext.js` — are `on`/`off` calls balanced in useEffect cleanup?
- Check `GameContext.js` — is the event listener registered before the event fires?

### 3. Common Root Causes
| Symptom | Likely Cause |
|---------|-------------|
| Students can't join | Room status is not `lobby` (game started) |
| Answer not registering | `room.status !== 'question'` at time of answer |
| Questions missing from DOCX | `(correta)` marker missing or misspelled |
| Ranking not updating | `player.score` not updated before `getRankings()` |
| Socket event fires but UI doesn't update | Missing dependency in useEffect or stale closure |

### 4. Fix & Validate
- [ ] Implement minimal fix
- [ ] Run `node --check backend/server.js`
- [ ] Run `cd frontend && npm run build`
- [ ] Test manually: upload sample .docx, join as student, play through
- [ ] Run `/evolve-claude-md` to capture the lesson
