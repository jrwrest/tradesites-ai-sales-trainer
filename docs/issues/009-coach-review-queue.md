# 009 - Add coach review queue and notes

Type: AFK
Status: Done
Labels: `ready-for-agent`, `coach-review`

## What to build

Add a local coach review queue so low scores, hard-no failures, high improvements, repeated missed skills, and user-marked calls can be reviewed without changing transcript text.

## Acceptance criteria

- [ ] Review queue is generated from stored sessions.
- [ ] Queue rules use explicit thresholds from the implementation plan.
- [ ] Coach notes can be added without mutating transcript turns.
- [ ] Coach notes are not logged and are ignored by provider payloads unless explicitly needed.
- [ ] Dashboard summary shows skill trends from local memory.
- [ ] Integration tests use temp `DATA_DIR`.
- [ ] `npm test` passes.

## Blocked by

- 005 - Add spaced repetition skill memory
