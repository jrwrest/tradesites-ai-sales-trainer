# 007 - Convert Help into retrieval-first coaching

Type: AFK
Status: Done
Labels: `ready-for-agent`, `coaching`, `ui`

## What to build

Change Help from immediate advice into a retrieval-first coaching interaction where the rep chooses their next move before seeing the suggestion.

## Acceptance criteria

- [ ] Help first asks "What is your next move?" with move choices.
- [ ] Suggestion stays hidden until a move is selected.
- [ ] The selected move and correctness are persisted without adding transcript turns.
- [ ] Hidden persona context is never surfaced in suggestions.
- [ ] Post-call scoring can include help accuracy.
- [ ] Browser smoke covers click Help, choose move, reveal suggestion.
- [ ] `npm test` passes.

## Blocked by

- 002 - Add fixed training fixtures and eval harness
- 003 - Add skill taxonomy and drill assignment
