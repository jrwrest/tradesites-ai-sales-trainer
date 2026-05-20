# 013 - Add PocketBase login and per-rep sync

Type: AFK
Status: Done
Labels: `ready-for-agent`, `auth`, `sync`, `safety`

## What to build

Add PocketBase-backed login so every training session, skill-memory update, due drill, help attempt, coach note, gauntlet, and review queue item can be tracked under a rep. Require login by default; keep the local no-login path only when `AUTH_REQUIRED=0` is explicitly set.

## Fastest Architecture

Use PocketBase as a sidecar auth and sync database:

- PocketBase runs on `127.0.0.1:8090`.
- Browser uses the trainer's Express auth endpoints, not direct PocketBase SDK calls.
- Express verifies PocketBase tokens by calling PocketBase `auth-refresh`.
- Express attaches `req.user = { id, email, name }`.
- Session JSON remains the first storage backend, but all records get `repId`.
- Review queue, due drills, skill memory, and coach notes filter by `repId`.
- Later, JSON-backed stores can be swapped for PocketBase collections without changing trainer routes.

## Acceptance criteria

- [x] `POST /api/auth/login` accepts email/password and returns a PocketBase auth token plus normalized user profile.
- [x] `POST /api/auth/signup` creates a PocketBase user and returns the same shape as login.
- [x] `GET /api/auth/me` returns the current user when a valid bearer token is supplied.
- [x] Protected trainer routes reject anonymous requests with `401` by default.
- [x] When auth is explicitly disabled with `AUTH_REQUIRED=0`, anonymous local use continues with `repId = "local"`.
- [x] New normal call sessions and gauntlet sessions persist `repId`.
- [x] Message, end-call, help, review-request, and coach-note routes reject cross-rep access.
- [x] Skill memory is stored per rep, not globally.
- [x] Due drills, review queue, and skill trends are scoped to the current rep.
- [x] UI shows login/signup/logout and current rep.
- [x] Smoke remains deterministic without PocketBase by default.
- [x] Tests cover anonymous mode, auth-required rejection, authenticated scoping, and cross-rep denial using a fake PocketBase verifier.

## QA and DevOps review notes

- Protected route matrix must be explicit: health, scenarios, login, and signup remain public; training, scoring, drill, review, coach, and session mutation routes are scoped to the current rep.
- Auth must fail closed. If a bearer token is supplied but invalid, expired, or unverifiable because PocketBase is down, do not fall back to `Local Rep`.
- Browser and API responses should expose only normalized user fields: `id`, `email`, `name`, and `source`.
- Legacy JSON sessions without `repId` are treated as `local`; signed-in reps cannot read or mutate them.
- Skill memory needs a separate file per rep so due drills cannot bleed between users.
- Review queue and skill trends must filter sessions before aggregation.
- Smoke and fixture evals must run without PocketBase by forcing optional local auth in the smoke environment.
- PocketBase data directories and the local binary should not be committed.

## Blocked by

None - can start immediately.
