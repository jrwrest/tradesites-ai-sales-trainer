# 004 - Show next drill after call end

Type: AFK
Status: Done
Labels: `ready-for-agent`, `ui`, `training`

## What to build

Show the assigned next drill in the right panel after a call ends, with enough context for the rep to immediately understand what to practise next.

## Acceptance criteria

- [ ] Ending a call displays the assigned drill skill and plain-English reason.
- [ ] The UI handles no-drill or scoring-error states without breaking the transcript.
- [ ] The drill display uses existing visual patterns and stays readable on mobile and desktop.
- [ ] A browser smoke path can end a mock call and see the next drill.
- [ ] `npm test` passes.

## Blocked by

- 003 - Add skill taxonomy and drill assignment
