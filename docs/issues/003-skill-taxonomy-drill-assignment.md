# 003 - Add skill taxonomy and drill assignment

Type: AFK
Status: Done
Labels: `ready-for-agent`, `training`

## What to build

Add the V1 sales skill taxonomy, extend post-call scoring with `skillScores`, and assign one next drill from the weakest active skill after every ended call.

## Acceptance criteria

- [ ] Skill IDs match the taxonomy in the implementation plan.
- [ ] Ending a call returns `evaluation.skillScores`.
- [ ] A fixture with any skill score `<= 5` assigns exactly one next drill.
- [ ] A hard-no fixture with `hard_no_clean_exit <= 4` assigns `hard_no_clean_exit`.
- [ ] A clean hard-no exit can score `hard_no_clean_exit >= 8` without a booked meeting.
- [ ] Session JSON persists `assignedDrill`.
- [ ] Existing scoring tests and fixture evals pass.

## Blocked by

- 002 - Add fixed training fixtures and eval harness
