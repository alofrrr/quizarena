# /socket-events

Quick reference for all Socket.io events in QuizArena.

## Host → Server
| Event | Payload | When |
|-------|---------|------|
| `host:join` | `pin` (string) | After upload, professor opens lobby |
| `host:startGame` | `pin` | Professor clicks "Start" in lobby |
| `host:nextQuestion` | `pin` | Professor advances to next question |
| `host:getReport` | `pin` | Professor requests final report |

## Student → Server
| Event | Payload | When |
|-------|---------|------|
| `student:join` | `{ pin, nickname }` | Student enters PIN + nickname |
| `student:answer` | `{ pin, questionIndex, selectedOption }` | Student taps answer |

## Server → Clients
| Event | Sent To | Payload |
|-------|---------|---------|
| `player:joined` | Host only | `{ nickname, playerCount }` |
| `player:left` | Host only | `{ nickname, playerCount }` |
| `game:started` | Room | `{ totalQuestions }` |
| `question:show` | Room | `{ questionIndex, totalQuestions, question }` |
| `answer:received` | Host only | `{ answerCount, totalPlayers }` |
| `question:results` | Room | `{ correctIndex, correctText, optionCounts, rankings }` |
| `game:finished` | Room | `{ rankings, report }` |

## Callbacks (acknowledgements)
- `host:join` → `{ success, players, questionCount, status }` or `{ error }`
- `student:join` → `{ success, nickname }` or `{ error }`
- `student:answer` → `{ isCorrect, score, totalScore, streak }` or `{ error }`
- `host:getReport` → full report object

## Room Status Flow
```
lobby → playing → question → results → question → ... → finished
```

## Scoring Formula
```
score = isCorrect ? 1000 + Math.round(500 * (1 - responseTimeMs / timeLimitMs)) : 0
```
Time limit per question: 20 seconds.
