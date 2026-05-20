# 006 - Add due drill startup flow

Type: AFK
Status: Done
Labels: `ready-for-agent`, `ui`, `scheduler`

## What to build

Add a due-drill API and app-load strip so the trainer suggests the most urgent skill to practise while still letting the user pick any scenario.

## Acceptance criteria

- [ ] `GET /api/drills/due` returns deterministic due drills from skill memory.
- [ ] Due drill sorting favours overdue weak skills.
- [ ] App load shows a due-drill strip when a drill is due.
- [ ] The user can ignore the due drill and choose any scenario.
- [ ] Tests use a fixed clock and temp `DATA_DIR`.
- [ ] `npm test` passes.

## Blocked by

- 005 - Add spaced repetition skill memory
