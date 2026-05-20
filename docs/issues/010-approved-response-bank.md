# 010 - Add approved response bank

Type: HITL
Status: Done
Labels: `needs-triage`, `coaching`, `content`

## What to build

Add a small approved response bank for common enterprise objections so Help and post-call review can show trusted examples separate from AI-generated suggestions.

## Acceptance criteria

- [ ] Approved examples are stored separately from AI suggestions.
- [ ] Each example maps to objection type, recommended move, and skill ID.
- [ ] Examples never include hidden persona context.
- [ ] Help can show a relevant approved example after retrieval choice.
- [ ] Post-call review can reference approved examples.
- [ ] `npm test` passes.

## Blocked by

- 007 - Convert Help into retrieval-first coaching
