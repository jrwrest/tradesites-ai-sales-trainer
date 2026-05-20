# 008 - Add interleaved objection gauntlet mode

Type: HITL
Status: Done
Labels: `needs-triage`, `training`, `ui`

## What to build

Add a gauntlet mode that runs several short objection rounds in one session, mixing near-miss objection families so the rep practises diagnosis instead of memorized replies.

## Acceptance criteria

- [ ] Gauntlet has a generated plan before starting.
- [ ] Objection types are interleaved and not repeated back-to-back.
- [ ] Near-miss families are represented: send info vs hard no, landlord vs procurement, already solar vs energy consultant, not priority vs no requirement, no-upfront-cost skepticism vs budget/timing.
- [ ] Summary reports strongest and weakest objection families.
- [ ] Hard-no handling remains a separate score.
- [ ] A shortened 3-round browser smoke path is deterministic.
- [ ] `npm test` passes.

## Blocked by

- 003 - Add skill taxonomy and drill assignment
- 007 - Convert Help into retrieval-first coaching
