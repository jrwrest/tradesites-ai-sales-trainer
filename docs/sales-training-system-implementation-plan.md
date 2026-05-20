# Sales Training System Implementation Plan

Branch: `feature/sales-training-system-roadmap`

Goal: evolve the local cold-call trainer from a scenario roleplay tool into a training system that builds and maintains high-performing reps through deliberate practice, spaced repetition, retrieval-first coaching, and coach review.

## Current Baseline

Already built:

- local browser call simulator;
- mock, Codex command, and OpenClaw gateway brain providers;
- enterprise commercial solar objection playbook;
- right-side in-call Help panel;
- transcript persistence;
- post-call scoring;
- Synthetic food distributor rejection fixture;
- branch `feature/enterprise-objection-trainer` with tests passing.

Known constraints:

- local prototype, not a multi-user production app;
- data is JSON files under `data/sessions`;
- no auth;
- OpenClaw latency can be 8-15 seconds per response;
- scoring is heuristic, not yet a durable skill model.

Non-goals for this branch:

- no production dialer;
- no CRM writeback;
- no multi-user auth system;
- no dashboard-first build before the skill model works.

## Product Architecture

The training system should separate five domains:

1. **Scenario Runtime**
   Owns call sessions, transcript turns, customer persona, objections, and provider response.

2. **Skill Model**
   Owns sales capabilities, scores, confidence, last practised date, and next due date.

3. **Drill Scheduler**
   Chooses what the rep should practise next using spaced repetition and weak-skill targeting.

4. **Coaching Layer**
   Handles retrieval-first Help, in-call suggestions, and post-call feedback.

5. **Coach Review**
   Surfaces calls, skill trends, and review notes for a human coach/manager.

## Data Model

For the local prototype, use JSON files first. Move to SQLite only when concurrent users or reporting need it.

Rules:

- every persisted object gets a `schemaVersion`;
- all write paths validate required fields before saving;
- corrupt or missing local JSON files fail closed with a clear local error and never delete data automatically;
- tests and smoke runs must use an isolated `DATA_DIR`, not the user's real `data` directory.

### `data/profile.json`

```json
{
  "schemaVersion": 1,
  "repId": "james",
  "displayName": "Alex Morgan",
  "createdAt": "2026-05-20T00:00:00.000Z"
}
```

### `data/skill-memory.json`

```json
{
  "schemaVersion": 1,
  "repId": "james",
  "skills": {
    "permission_ask": {
      "score": 6,
      "confidence": 0.7,
      "attempts": 4,
      "lastPractisedAt": "2026-05-20T10:00:00.000Z",
      "nextDueAt": "2026-05-23T10:00:00.000Z",
      "intervalDays": 3,
      "recentSessionIds": []
    }
  }
}
```

### `session.evaluation.skillScores`

```json
{
  "schemaVersion": 1,
  "permission_ask": 7,
  "objection_acknowledgement": 5,
  "hard_no_clean_exit": 9
}
```

### `session.assignedDrill`

```json
{
  "schemaVersion": 1,
  "skill": "objection_acknowledgement",
  "objectionType": "dismissive",
  "reason": "Lowest scored active skill",
  "nextDueAt": "2026-05-21T10:00:00.000Z"
}
```

## Skill Taxonomy V1

Use stable IDs so scoring, scheduling, and reporting can share the same vocabulary.

- `opener_clarity`
- `permission_ask`
- `relevance_statement`
- `gatekeeper_control`
- `discovery_question_quality`
- `objection_acknowledgement`
- `authority_mapping`
- `commercial_model_explanation`
- `ppa_capex_distinction`
- `landlord_tenant_routing`
- `procurement_navigation`
- `incumbent_handling`
- `timing_followup`
- `hard_no_clean_exit`
- `next_step_close`

## Fixed Fixture Gates

Build scoring and scheduling around named fixtures so acceptance criteria are testable.

- `sample-foods-hard-no-failed-context`: synthetic food distributor call. Expected weak skills: `opener_clarity`, `relevance_statement`, `hard_no_clean_exit`. Expected assigned drill: `hard_no_clean_exit` or `relevance_statement`, depending on the scoring phase under test.
- `clean-hard-no-exit`: prospect says there is no requirement, rep acknowledges, exits without pushing. Expected `hard_no_clean_exit >= 8` and no meeting-booking penalty.
- `permission-led-open`: rep asks for 20 seconds, states commercial solar relevance, asks a question. Expected `permission_ask >= 8`, `opener_clarity >= 7`.
- `send-info-brush-off`: prospect says send something over, rep clarifies whether there is any live energy-cost priority. Expected assigned drill: `discovery_question_quality` if no clarifying question is asked.
- `landlord-routing`: prospect says landlord owns the building, rep asks who manages energy decisions and whether landlord approval is blocker. Expected assigned drill: `landlord_tenant_routing` when missed.

Every fixture must define expected score bands, expected `assignedDrill.skill`, and expected persisted JSON shape before implementation starts.

## Phase 1: Drill Engine

Purpose: every call should produce a next practice assignment.

Scope:

- Add skill taxonomy module.
- Extend scoring to return `skillScores`.
- Add `assignNextDrill(evaluation)` function.
- Save `assignedDrill` into the session.
- Show "Next Drill" in the right panel after call end.
- Add a small "Due Drill" strip on app load if a drill is due.

Acceptance criteria:

- Ending a call always returns `evaluation.skillScores`.
- A fixture with any skill score `<= 5` assigns exactly one next drill.
- A hard-no fixture with `hard_no_clean_exit <= 4` assigns `hard_no_clean_exit`.
- A clean hard-no exit fixture scores `hard_no_clean_exit >= 8` even when no meeting is booked.
- Existing scoring tests still pass.

Tests:

- unit: skill scoring maps transcript behaviours to skill IDs;
- unit: lowest weak skill becomes assigned drill;
- unit: clean exit after hard no gets high `hard_no_clean_exit`;
- integration: session end persists `assignedDrill`;
- browser smoke: end call, see next drill.

## Phase 2: Spaced Repetition Scheduler

Purpose: keep reps sharp over time, not just immediately after feedback.

Scope:

- Add `skillMemory` store.
- Update skill memory on call end.
- Implement deterministic intervals with an injectable clock:
  - score 0-4: 1 day;
  - score 5: 3 days;
  - score 6: 5 days;
  - score 7: 7 days;
  - score 8: 14 days;
  - score 9: 21 days;
  - score 10: 30 days.
- Add due-drill endpoint.
- Default scenario selection to the most urgent due drill.

Acceptance criteria:

- Skill memory updates after each ended call.
- Due drills are deterministic by current date.
- The same skill is not over-scheduled if already practised today.
- Users can still freely choose any scenario.

Tests:

- unit: scheduler computes intervals from score;
- unit: due drill sorting favours overdue weak skills;
- unit: no duplicate same-day scheduling;
- unit: fixed clock makes `nextDueAt` deterministic;
- integration: call end updates `data/skill-memory.json`;
- integration: `GET /api/drills/due` returns due drills.

## Phase 3: Retrieval-First Help

Purpose: make Help train recall instead of creating dependence.

Scope:

- Replace immediate suggestion with a short "What is your next move?" prompt.
- Choices:
  - acknowledge;
  - clarify;
  - ask permission;
  - qualify;
  - route;
  - commercial explain;
  - exit.
- After user chooses, reveal the suggestion and mark whether the choice matched the recommended move.
- Persist help attempts on the session.

Acceptance criteria:

- Help first asks for a move choice.
- Suggestion is hidden until a choice is made.
- Choice result is stored without adding transcript turns.
- Post-call score can include help accuracy.

Tests:

- unit: each objection has a recommended move;
- unit: hidden persona context is never surfaced in suggestions;
- integration: help attempt persists selected move and correctness;
- browser smoke: click Help, choose move, reveal suggestion.

## Phase 4: Interleaved Objection Gauntlets

Purpose: train diagnosis, not memorized responses.

Scope:

- Add gauntlet mode: 5 mini-calls or 5 objection turns.
- Mix near-miss categories:
  - send info vs hard no;
  - landlord vs procurement;
  - already solar vs energy consultant;
  - not priority vs no requirement;
  - no upfront cost skepticism vs budget/timing.
- Score each round and summarize pattern.

Acceptance criteria:

- Gauntlet has a generated plan before starting.
- Objection types are interleaved and not repeated back-to-back.
- The summary reports strongest and weakest objection families.
- Hard-no handling remains a separate safety score.

Tests:

- unit: gauntlet generator avoids adjacent same type;
- unit: near-miss pairs are represented;
- integration: gauntlet sessions persist round results;
- browser smoke: complete a 3-round shortened gauntlet.

## Phase 5: Coach Review

Purpose: add human review loops for durable improvement.

Scope:

- Add review queue:
  - low score: any active skill `<= 4`;
  - hard-no failure: `hard_no_clean_exit <= 4` when a hard-no objection appeared;
  - high improvement: skill improves by `>= 3` points against the previous rolling average;
  - repeated missed skill: same skill `<= 5` across 3 sessions;
  - user-marked review.
- Add coach notes to session JSON.
- Add approved example response bank.
- Add simple dashboard summary.

Acceptance criteria:

- Review queue is generated from stored sessions.
- Coach note can be added without mutating transcript text.
- Approved examples are separate from AI suggestions.
- Dashboard shows skill trends from local memory.

Tests:

- unit: review queue rules;
- integration: add coach note;
- integration: approved example appears in relevant Help suggestion;
- browser smoke: review queue renders.

## DevOps / Safety Requirements

- Keep default bind to `127.0.0.1`.
- Keep `ALLOW_REMOTE_UNSAFE=1` required for remote binding, and treat remote binding as demo-only.
- Before documenting any non-loopback runbook, add a local bearer token or keep the app loopback-only.
- Do not use real transcripts, secrets, or customer data in remote demos.
- Mock provider remains the default and requires no secrets.
- External or command providers require explicit environment opt-in, and the UI/runbook must warn that transcript text leaves the app boundary.
- Do not log full transcripts, full prompts, tokens, or coach notes.
- Log only startup config, request id, route, status, duration, provider, provider latency, fallback code, timeout code, and hashed session id.
- Do not commit local user data: `data/*.json`, `data/sessions/*.json`, review queues, coach notes, or smoke artifacts.
- Add `DATA_DIR` override before integration, scheduler, and browser smoke tests to avoid test pollution.
- Every integration and smoke test must create a temp `DATA_DIR` and tear it down.
- Sanitize provider errors in browser as `{ "error": "Provider unavailable", "code": "...", "requestId": "..." }`; detailed provider errors can go to local console only, redacted and capped.
- Keep OpenClaw timeout at `45000ms` unless explicitly overridden.
- Keep command brain timeout at `30000ms` unless `BRAIN_TIMEOUT_MS` is explicitly overridden.
- Cap provider output size before returning it to the browser.
- Add a `npm run smoke` script only when browser smoke is deterministic.

## Model Output Evals

AI behavior needs evals as well as tests.

- Use fixed transcript fixtures and fixed scenario/persona seeds.
- Expected outputs are score bands, recommended move IDs, assigned drill IDs, and forbidden leakage strings.
- Pass gate: `>= 90%` fixture agreement, zero hidden-context leaks, zero transcript/provider-error leaks, and no unsafe remote-binding regressions.
- Evals run against mock fixtures first; Codex/OpenClaw provider evals are optional and clearly marked nondeterministic.
- Any prompt or provider change must run the eval set before merge.

## Deterministic Smoke Requirements

Browser smoke is required for UI acceptance criteria only when these prerequisites are met:

- forced mock provider;
- temp `DATA_DIR`;
- fixed scenario and fixture;
- fixed clock for scheduler screens;
- typed input only, no mic or Web Speech dependency;
- no network provider dependency;
- cleanup of generated sessions and smoke artifacts.

## Runbook Requirements

README updates must include:

- `npm ci`, `npm test`, and `npm start`;
- expected health response;
- provider env examples for mock, Codex command, and OpenClaw gateway;
- data directory location and `DATA_DIR` override;
- cleanup instructions for demo data;
- host/port behavior and remote-binding warning;
- expected latency for mock, Codex command, and OpenClaw.

## Release Gates

Each phase must pass:

- `npm test`;
- no `git diff --check` issues;
- manual browser smoke for the new flow;
- deterministic `npm run smoke` when the phase adds a browser-smokeable UI path;
- model-output evals when prompt, scoring, coaching, or provider behavior changes;
- no secrets in diff;
- no committed session transcript JSON, profile JSON, skill-memory JSON, coach notes, or smoke artifacts;
- intended branch confirmed before commit;
- reviewed diff contains no accidental local data;
- README updated when user-facing behavior changes.

## Build Recommendation

Build in this order:

1. Phase 1 Drill Engine.
2. Phase 2 Scheduler.
3. Phase 3 Retrieval-First Help.
4. Phase 4 Gauntlets.
5. Phase 5 Coach Review.

Do not start with dashboard or gamification. The durable value comes from the skill model and scheduler.
