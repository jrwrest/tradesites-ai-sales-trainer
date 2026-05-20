# 005 - Add spaced repetition skill memory

Type: AFK
Status: Done
Labels: `ready-for-agent`, `training`, `scheduler`

## What to build

Persist per-skill practice memory and compute deterministic next due dates so weak skills return for spaced repetition.

## Acceptance criteria

- [ ] `skill-memory.json` includes `schemaVersion`, `repId`, skill scores, confidence, attempts, last practised time, next due time, interval days, and recent session IDs.
- [ ] Scheduler uses an injectable clock.
- [ ] Intervals are deterministic: 0-4 = 1 day, 5 = 3 days, 6 = 5 days, 7 = 7 days, 8 = 14 days, 9 = 21 days, 10 = 30 days.
- [ ] The same skill is not over-scheduled if already practised today.
- [ ] Integration tests write only to temp `DATA_DIR`.
- [ ] `npm test` passes.

## Blocked by

- 001 - Add isolated data directory and safety foundation
- 003 - Add skill taxonomy and drill assignment
