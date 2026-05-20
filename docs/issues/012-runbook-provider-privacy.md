# 012 - Update runbook and provider privacy warnings

Type: AFK
Status: Done
Labels: `ready-for-agent`, `docs`, `safety`

## What to build

Update the runbook so local use, mock provider use, Codex command use, OpenClaw gateway use, data cleanup, and privacy boundaries are explicit.

## Acceptance criteria

- [ ] README documents `npm ci`, `npm test`, `npm start`, and expected health response.
- [ ] README documents mock, Codex command, and OpenClaw provider env examples.
- [ ] README documents `DATA_DIR` and cleanup instructions for demo data.
- [ ] README warns that command/OpenClaw providers receive transcript text.
- [ ] README describes host/port behavior and remote-binding risks.
- [ ] README lists expected latency for mock, Codex command, and OpenClaw.
- [ ] `npm test` passes.

## Blocked by

- 001 - Add isolated data directory and safety foundation
