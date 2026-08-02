# Coaching methods

The trainer treats a coaching method as a versioned domain contract, not a visual preference.

## User selection

`profile.coachingMethodId` stores the user's selected method. Existing profiles without the field migrate in memory to `hormozi-sales-2026`. `GET /api/methods` returns the closed registry available to the authenticated user; arbitrary IDs and filesystem paths are rejected.

## Session pinning

Every call and gauntlet pins `session.methodPack = { id, version }` at creation. Live coaching, end-of-call evaluation, approved examples, assigned drills, due drills, trends, and review queues use that pin. Changing the profile cannot alter an active call. A pin that is no longer installed returns `409 method_unavailable`; it never silently changes the coach.

When releasing a new pack version, keep the old version under `method-packs/<id>/versions/<version>/` while sessions or retained records can still reference it.

Legacy sessions without a pin use the default method and record `methodMigration: "legacy_default"` the next time they are saved.

## Content boundary

- Method packs own frameworks, rubrics, drills, technique guidance, and technique templates.
- Scenarios and objection playbooks own industry facts, commercial claims, and customer resistance.
- Profiles supply only allowlisted identity fields used by templates (`repName` and `companyName`).

Browser output uses text nodes, and server-side template rendering rejects tokens that are not explicitly allowlisted. Notes, offers, and other free-form profile fields cannot enter coaching templates.

## Learning memory

Skill memory schema version 2 namespaces progress under `methods["<id>@<version>"]`. Schema version 1 records were produced under `hormozi-sales-2026@1.0.0-beta.2`, so they migrate once into that historical namespace. The current-version namespace starts empty and the compatibility `skills` view points only to the current version, preventing historical beta.2 results from contaminating beta.3 learning.

## Installed methods

- `hormozi-sales-2026@1.0.0-beta.3` uses the Alex Hormozi PPP, CLOSER, BANT, three-pillar presentation, and AAA adaptation.
- `jeremy-miner-nepq-ppa@1.0.0-beta.1` uses the Jeremy Miner / 7th Level NEPQ connecting, awareness-question, consequence, qualifying, transition, presentation, commitment, and objection-dialogue adaptation.

Both methods train against the same commercial-solar situation catalog. Solar/PPA facts, fit thresholds, landlord and procurement constraints, and opt-outs remain identical; coaching language, examples, detectors, stage scores, and drills change with the selected method.

## Readiness gate

“Ready” means ready for a supervised live call, not unobserved independent selling. The selected method is assessed separately and requires:

- three recent passing attempts in every commercial-solar situation family;
- focused, situation-relevant answers that are not exact or near-duplicate scripts;
- no failed truth, fit, authority, or do-not-call gate;
- every recent situation attempt at or above the configured score floor;
- at least 80% passing consistency within each family; and
- three recent complete simulated calls at or above the score floor with medium or high transcript confidence.

Only the latest required attempts count, so earlier beginner failures age out after demonstrated improvement. Claims marked for review remain visible for coach verification. Typed transcripts cannot prove pace, tone, interruption handling, or vocal composure; final sign-off must therefore be a coach-reviewed recording or supervised call.
