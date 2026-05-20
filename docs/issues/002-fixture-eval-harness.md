# 002 - Add fixed training fixtures and eval harness

Type: AFK
Status: Done
Labels: `ready-for-agent`, `evals`, `testing`

## What to build

Create a deterministic fixture and eval harness so scoring, coaching, and drill assignment can be checked against named sales-call examples before model-backed behavior is changed.

## Acceptance criteria

- [ ] Fixtures exist for `sample-foods-hard-no-failed-context`, `clean-hard-no-exit`, `permission-led-open`, `send-info-brush-off`, and `landlord-routing`.
- [ ] Each fixture defines expected score bands, expected assigned drill skill, and forbidden leakage strings.
- [ ] An eval command can run the fixture set locally without OpenClaw or Codex.
- [ ] The eval reports pass/fail with fixture agreement percentage.
- [ ] Pass gate is documented as `>= 90%` agreement and zero leakage failures.
- [ ] `npm test` passes.

## Blocked by

None - can start immediately.
