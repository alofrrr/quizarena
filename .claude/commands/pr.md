# /pr

Create a pull request with a structured description.

## Steps
1. Check git status — ensure working tree is clean
2. Review commits since branch diverged from main
3. Identify what changed: backend, frontend, socket events, parser, scoring, or UI
4. Draft PR title using Conventional Commits format
5. Create PR with gh CLI

## Prerequisite Check
```bash
git status
git log main..HEAD --oneline
git diff main...HEAD --stat
```

## PR Creation
```bash
gh pr create --title "<type>(<scope>): <description>" --body "$(cat <<'EOF'
## Summary
-

## Changes
-

## Test Plan
- [ ] Backend starts cleanly (`node --check backend/server.js`)
- [ ] Frontend builds (`cd frontend && npm run build`)
- [ ] Manual: upload sample .docx, verify PIN generated
- [ ] Manual: students can join and answer questions
- [ ] Manual: rankings and report appear correctly

## Socket Events Affected
<!-- List any new/changed events -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Scopes
`backend` | `frontend` | `socket` | `parser` | `scoring` | `ui` | `deploy`
