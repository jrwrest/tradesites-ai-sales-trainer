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
