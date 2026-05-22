# LLM-Rendered Dialogue Replies Plan

Status: planning review for issue #15.

## Goal

Every generated customer reply after the rep speaks should hit the configured brain provider when one is available, so the trainer feels like a normal conversation instead of a set of local templates.

The dialogue manager should still decide the safe conversation action: whether the customer is asking for identity, answering a routing question, blocking scheduling, ending after a hard no, or raising a relevant objection. The LLM should render the actual customer wording inside those constraints.

## Non-Goals

- Do not create a new OpenClaw instance for the trainer.
- Do not add new voice infrastructure in this slice.
- Do not remove the existing deterministic dialogue manager.
- Do not log raw transcripts by default.
- Do not deploy this broadly without a feature flag and rollback path.

## Current Problem

The current dialogue manager and flow guards can locally write final customer replies. That protects flow, but it can sound robotic and can jump to a stored objection instead of answering the rep's latest question naturally.

There is also a provider-payload risk: the existing brain flow can choose a forced objection. For contract rendering, that must be suppressed when the contract says the customer should answer, clarify, route, repair context, or end the call.

## Proposed Architecture

1. Classify the rep turn and build a `dialogueContract`.
2. Include the transcript, scenario, latest rep message, and dialogue contract in a render request.
3. Convert both `dialogue_manager` and `flow_guard` replies into render contracts.
4. Call the configured provider when `DIALOGUE_LLM_RENDER_ENABLED=1`.
5. Suppress unrelated `forcedObjection` behavior when the dialogue contract owns the next action.
6. Validate the returned customer text against contract-specific constraints.
7. Retry once with stricter instructions if the response violates constraints and the remaining turn budget allows it.
8. Fall back to the existing deterministic local reply if the provider fails or the second response is invalid.
9. Persist a compact trace showing whether the turn was LLM-rendered or fallback-rendered.

## Feature Flags

- `DIALOGUE_MANAGER_ENABLED=1`: keeps the current state and guardrail layer enabled.
- `DIALOGUE_LLM_RENDER_ENABLED=1`: enables provider rendering for dialogue-manager and flow-guard turns.
- `DIALOGUE_LLM_RENDER_RETRY_ON_VIOLATION=1`: optional retry when the provider violates a critical constraint.
- `DIALOGUE_LLM_RENDER_TIMEOUT_MS=10000`: separate per-turn render timeout. This must be lower than the general OpenClaw timeout.
- `DIALOGUE_LLM_RENDER_MAX_CONCURRENT_PER_SESSION=1`: blocks overlapping render calls for one session.

Rollback is to set `DIALOGUE_LLM_RENDER_ENABLED=0` and restart the service. The existing deterministic dialogue manager remains the fallback path.

## Dialogue Contract

```js
{
  state: "opening",
  repAct: "identity_only",
  customerAction: "ask_company_and_reason",
  activeObjectionId: null,
  requiredTopic: "caller identity and reason for call",
  forbiddenTopics: ["existing solar", "multi-site complexity", "procurement"],
  mustAnswerLatestQuestion: true,
  schedulerBlocked: true,
  tone: "busy, natural, guarded",
  maxWords: 28,
  fallbackText: "James from where, and what is this about?"
}
```

The contract is a behavior boundary, not a script. The provider can phrase the line naturally, but it cannot switch to an unrelated objection or ignore the rep's latest question.

## Trace Shape

```js
{
  dialogue: {
    state: "opening",
    repAct: "identity_only",
    customerAction: "ask_company_and_reason",
    renderedBy: "llm",
    rendererProvider: "openclaw",
    fallbackReason: null,
    constraintViolation: null,
    latencyMs: 740,
    schedulerBlocked: true
  }
}
```

Trace data should be structured and compact. Avoid raw transcript logging unless an explicit debug flag is enabled for a short internal test window.

## Acceptance Criteria

- Every customer turn attempts provider rendering when `DIALOGUE_LLM_RENDER_ENABLED=1` and a provider is configured.
- Customer turn means every generated customer reply after the rep speaks when a provider is configured. Initial scripted openers and provider-disabled fallback modes are excluded.
- Dialogue-manager handled turns pass a contract to the provider before using local fallback.
- Flow-guard handled turns pass a contract to the provider before using local fallback.
- Context repair, routing, existing-solar follow-up, and hard-no cases render through the LLM when the provider succeeds.
- Dialogue render payloads include `customerAction`, `requiredTopic`, `forbiddenTopics`, `tone`, `maxWords`, and `schedulerBlocked`.
- Dialogue render payloads do not include `forcedObjection` unless it matches `activeObjectionId`.
- Provider failure falls back to the current deterministic local response.
- Provider timeout, empty output, and invalid output fall back to the current deterministic local response.
- Critical violations are blocked, retried once within the same total turn budget, or fallback-rendered.
- The render provider is injectable or otherwise replaceable in tests, so tests can prove call count, payload shape, timeout, failure, and fallback without OpenClaw.
- API response and saved transcript metadata show `renderedBy`, `rendererProvider`, `fallbackReason`, and `constraintViolation`.
- Feature flag off preserves current deterministic behavior.
- `/api/health` shows the render flag, provider type, and safe timeout summary.

## Tests

- Unit test contract generation for opener repair, routing, existing-solar follow-up, complexity, procurement, and hard no.
- Unit test that a fake provider is called for every non-ended generated customer turn when `DIALOGUE_LLM_RENDER_ENABLED=1`.
- Unit test that the fake provider is not called when the flag is off.
- Unit test provider timeout, thrown error, empty output, and invalid output fall back to the deterministic reply.
- Unit test unrelated forced-objection output is rejected for context repair and routing.
- Unit test provider payload omits `forcedObjection` during opener repair, routing, and latest-question answers unless it matches `activeObjectionId`.
- Unit test a fake provider cannot make opener repair return an unrelated "we already have solar" objection.
- Unit test a fake provider cannot make a routing question jump to procurement.
- Unit test a fake provider cannot reopen the sale after a hard no.
- Unit test a fake provider cannot ignore the rep's latest direct question without triggering retry or fallback.
- Unit test per-session concurrency blocks overlapping render calls.
- Integration test API response metadata for `renderedBy`, `rendererProvider`, and fallback reasons.
- Regression tests for examples the trainer previously failed:
  - "this is James" should ask where James is from and what the call is about.
  - "what are you about what are you doing" should respond as a confused business person, not jump to solar.
  - "where is your site" should answer or challenge naturally instead of moving to a generic relevance line.

## Evals

Run a messy-call fixture set before deploy:

- 20 normal commercial solar openings.
- 10 unclear or garbled rep turns.
- 10 hard objections from large businesses.
- 10 deliberate attempts to derail the customer.

Judge the output on intent, not exact wording:

- Did the customer answer or challenge the latest rep turn?
- Did the customer stay in role?
- Did the customer avoid unrelated objection jumps?
- Did the customer sound like a normal busy decision-maker?
- Did the guardrails prevent scheduling after a hard no?

Minimum pass thresholds before live enablement:

- 90% latest-turn relevance.
- 90% no unrelated objection jumps.
- 0 hard-no scheduling or sale-reopening failures.
- 85% judged as a natural busy decision-maker.
- Fixtures are committed so regressions are repeatable.

## Ops Gates

- `DIALOGUE_LLM_RENDER_ENABLED=0` remains the production default until local QA and canary pass.
- Add a separate `DIALOGUE_LLM_RENDER_TIMEOUT_MS` for render calls, with an initial target of 8-12 seconds.
- Retry must share the same total turn budget as the original call, or stay disabled.
- Add a per-user or per-session rate/concurrency limit before public enablement.
- Track provider latency, failure rate, fallback rate, and constraint-violation rate.
- `/api/health` exposes render enabled/disabled state, provider type, and timeout summary.
- Keep transcript logging off by default.
- Keep the rollout behind `DIALOGUE_LLM_RENDER_ENABLED=0` until local QA passes.
- Canary enable internally before public deploy.
- Verify rollback by turning `DIALOGUE_LLM_RENDER_ENABLED=0` and restarting the service.
- Confirm provider errors, stdout/stderr, prompts, traces, and health output do not expose raw transcripts, tokens, or provider secrets by default.

## Ship Recommendation

Build this behind `DIALOGUE_LLM_RENDER_ENABLED=1`. Do not deploy it broadly until the fake-provider tests, fallback tests, constraint-violation tests, and messy-call eval pass.
