# LLM-Rendered Dialogue Replies Plan

Status: planning review for issue #15.

## Goal

Every customer turn should hit the configured brain provider when one is available, so the trainer feels like a normal conversation instead of a set of local templates.

The dialogue manager should still decide the safe conversation action: whether the customer is asking for identity, answering a routing question, blocking scheduling, ending after a hard no, or raising a relevant objection. The LLM should render the actual customer wording inside those constraints.

## Non-Goals

- Do not create a new OpenClaw instance for the trainer.
- Do not add new voice infrastructure in this slice.
- Do not remove the existing deterministic dialogue manager.
- Do not log raw transcripts by default.
- Do not deploy this broadly without a feature flag and rollback path.

## Current Problem

The current dialogue manager can locally write final customer replies. That protects flow, but it can sound robotic and can jump to a stored objection instead of answering the rep's latest question naturally.

There is also a provider-payload risk: the existing brain flow can choose a forced objection. For dialogue-manager rendering, that must be suppressed when the contract says the customer should answer, clarify, route, repair context, or end the call.

## Proposed Architecture

1. Classify the rep turn and build a `dialogueContract`.
2. Include the transcript, scenario, latest rep message, and dialogue contract in a render request.
3. Call the configured provider when `DIALOGUE_LLM_RENDER_ENABLED=1`.
4. Suppress unrelated `forcedObjection` behavior when the dialogue contract owns the next action.
5. Validate the returned customer text against critical constraints.
6. Retry once with stricter instructions if the response violates constraints.
7. Fall back to the existing deterministic local reply if the provider fails or the second response is invalid.
8. Persist a compact trace showing whether the turn was LLM-rendered or fallback-rendered.

## Feature Flags

- `DIALOGUE_MANAGER_ENABLED=1`: keeps the current state and guardrail layer enabled.
- `DIALOGUE_LLM_RENDER_ENABLED=1`: enables provider rendering for dialogue-manager turns.
- `DIALOGUE_LLM_RENDER_RETRY_ON_VIOLATION=1`: optional retry when the provider violates a critical constraint.

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
- Dialogue-manager handled turns pass a contract to the provider before using local fallback.
- Flow-guard replies also use provider rendering, or the code documents why a specific guard is intentionally deterministic.
- Context repair, routing, existing-solar follow-up, and hard-no cases render through the LLM when the provider succeeds.
- Dialogue render payloads include `customerAction`, `requiredTopic`, `forbiddenTopics`, `tone`, `maxWords`, and `schedulerBlocked`.
- Dialogue render payloads do not include unrelated forced objections.
- Provider failure falls back to the current deterministic local response.
- Critical violations are blocked, retried once, or fallback-rendered.
- API response and saved transcript metadata show `renderedBy`, `rendererProvider`, `fallbackReason`, and `constraintViolation`.
- Feature flag off preserves current deterministic behavior.

## Tests

- Unit test contract generation for opener repair, routing, existing-solar follow-up, complexity, procurement, and hard no.
- Unit test that a fake provider is called for every non-ended customer turn when `DIALOGUE_LLM_RENDER_ENABLED=1`.
- Unit test that the fake provider is not called when the flag is off.
- Unit test provider failure falls back to the deterministic reply.
- Unit test unrelated forced-objection output is rejected for context repair and routing.
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

## Ops Gates

- Add a provider timeout budget for render calls.
- Track provider latency, failure rate, fallback rate, and constraint-violation rate.
- Keep transcript logging off by default.
- Keep the rollout behind `DIALOGUE_LLM_RENDER_ENABLED=0` until local QA passes.
- Canary enable internally before public deploy.
- Verify rollback by turning `DIALOGUE_LLM_RENDER_ENABLED=0` and restarting the service.

## Ship Recommendation

Build this behind `DIALOGUE_LLM_RENDER_ENABLED=1`. Do not deploy it broadly until the fake-provider tests, fallback tests, constraint-violation tests, and messy-call eval pass.
