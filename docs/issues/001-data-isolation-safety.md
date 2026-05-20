# 001 - Add isolated data directory and safety foundation

Type: AFK
Status: Done
Labels: `ready-for-agent`, `safety`, `devops`

## What to build

Make the local trainer safe to test and extend by adding explicit `DATA_DIR` support, isolated test data, and browser-safe provider errors before new training memory is added.

## Acceptance criteria

- [ ] Runtime data path can be overridden with `DATA_DIR`.
- [ ] Existing server and integration tests use a temp `DATA_DIR` with teardown.
- [ ] Default app behavior still writes to local `data/` when `DATA_DIR` is unset.
- [ ] Browser-facing errors use a safe shape with `error`, `code`, and `requestId`.
- [ ] Provider stderr, gateway details, prompts, transcripts, tokens, and coach notes are not returned to the browser.
- [ ] Tests cover default localhost binding and remote binding requiring `ALLOW_REMOTE_UNSAFE=1`.
- [ ] `npm test` passes.

## Blocked by

None - can start immediately.
