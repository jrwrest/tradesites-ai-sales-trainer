# 011 - Add deterministic browser smoke script

Type: AFK
Status: Done
Labels: `ready-for-agent`, `testing`, `devops`

## What to build

Add a deterministic browser smoke command for UI paths that can run without mic input, Web Speech, OpenClaw, Codex, or real user data.

## Acceptance criteria

- [ ] Smoke uses forced mock provider.
- [ ] Smoke uses temp `DATA_DIR`.
- [ ] Smoke uses typed input only.
- [ ] Smoke has fixed scenario and fixture data.
- [ ] Smoke uses fixed clock where scheduler screens are tested.
- [ ] Smoke artifacts are ignored by git.
- [ ] `npm run smoke` exists only once deterministic.
- [ ] `npm test` passes.

## Blocked by

- 001 - Add isolated data directory and safety foundation
- 004 - Show next drill after call end
