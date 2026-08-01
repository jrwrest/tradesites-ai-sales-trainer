# Source-grounded method evaluation

The trainer's primary score is produced by the versioned `hormozi-sales-2026` method pack. Every completed call records the pack ID and version, a 0–100 method score, evidence confidence, stage scores, behavior scores, critical gates, and one assigned constraint drill. The UI presents the method score as 0–10; the previous keyword score remains in `legacyOverallScore` only for migration analysis.

## Evidence contract

Each behavior is scored on the pack's 0–4 scale:

- `0`: not observed; never treated as neutral competence.
- `1`: harmful counter-evidence.
- `2`: attempted but contradicted or materially incomplete.
- `3`: effective direct evidence.
- `4`: adaptive evidence across multiple required elements.

Every non-zero score contains a transcript turn index, a bounded excerpt, and the reason it counted. Unreached and non-applicable stages are marked explicitly and excluded from weighted stage scoring. Truth claims remain `review` unless an external evidence audit is supplied; the transcript alone cannot prove a claimed result is true.

Critical gates currently cover:

- pushing after an explicit hard no;
- unverified or false claims;
- bypassing real authority or procurement;
- asking for commitment despite evidence of no fit.

A failed gate applies its configured score cap and can force the relevant drill.

## Calibration gate

Run:

```bash
npm run eval:fixtures
```

The current deterministic set contains 12 synthetic calls, 56 explicitly labelled behavior decisions, and all four gate paths. It currently produces 100% check agreement and quadratic weighted kappa of 1.000. CI fails below 90% total agreement, below 0.70 weighted kappa, or on any failed fixture check.

This result proves deterministic conformance to the labelled synthetic set; it does **not** prove real-world human agreement. Before broad release, add de-identified, consented call samples, have at least two reviewers label them blind to model output, adjudicate disagreements, and report per-behavior precision/recall plus hard-gate false passes. Transcript retention and reviewer access rules must be approved before real calls enter this set.

## Change control

Any framework, detector, rubric, gate, weight, or drill change requires:

1. a method-pack version bump;
2. a new or updated labelled fixture showing the intended change;
3. the complete test, evaluator, security-audit, and browser-smoke gates;
4. release notes explaining expected score movement.
