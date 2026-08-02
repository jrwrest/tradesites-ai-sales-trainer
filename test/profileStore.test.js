const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const { loadProfile, profilePath, saveProfile } = require("../src/profileStore");

let previousDataDir;
let tempDataDir;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tradesites-profile-test-"));
  process.env.DATA_DIR = tempDataDir;
});

afterEach(async () => {
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = previousDataDir;
  }
  await fs.rm(tempDataDir, { recursive: true, force: true });
});

test("loadProfile returns neutral commercial solar defaults", async () => {
  const profile = await loadProfile({ id: "rep-a", name: "Alex Morgan" });

  assert.equal(profile.repId, "rep-a");
  assert.equal(profile.repName, "Alex Morgan");
  assert.equal(profile.companyName, "BrightTrade Solar");
  assert.match(profile.offer, /commercial solar/i);
  assert.match(profile.opener, /Alex Morgan from BrightTrade Solar/);
  assert.equal(profile.coachingMethodId, "hormozi-sales-2026");
});

test("saveProfile persists a scoped editable profile", async () => {
  const user = { id: "rep/a", name: "Alex Morgan" };
  const saved = await saveProfile(user, {
    companyName: "BrightTrade Solar",
    targetCustomers: "Large UK businesses",
    coachingMethodId: "hormozi-sales-2026",
    ignored: "not stored",
  });
  const loaded = await loadProfile(user);

  assert.equal(saved.repId, "rep/a");
  assert.equal(loaded.companyName, "BrightTrade Solar");
  assert.equal(loaded.targetCustomers, "Large UK businesses");
  assert.equal(loaded.coachingMethodId, "hormozi-sales-2026");
  assert.equal(loaded.ignored, undefined);
  assert.match(profilePath("rep/a"), /profiles\/[a-zA-Z0-9_-]+\.json$/);
  assert.notEqual(profilePath("rep/a"), profilePath("rep_a"));
});

test("saveProfile rejects unknown and traversal coaching method ids", async () => {
  const user = { id: "rep-a", name: "Alex Morgan" };

  for (const coachingMethodId of ["missing-pack", "../data", "hormozi-sales-2026/../../data"]) {
    await assert.rejects(
      saveProfile(user, { coachingMethodId }),
      (error) => error && error.code === "INVALID_COACHING_METHOD",
      coachingMethodId,
    );
  }
});

test("legacy profiles without a coaching method load with the default selection", async () => {
  const user = { id: "legacy-rep", name: "Legacy Rep" };
  await fs.mkdir(path.dirname(profilePath(user.id)), { recursive: true });
  await fs.writeFile(profilePath(user.id), JSON.stringify({
    schemaVersion: 1,
    repId: user.id,
    repName: "Legacy Rep",
    companyName: "Legacy Co",
  }));

  const profile = await loadProfile(user);

  assert.equal(profile.companyName, "Legacy Co");
  assert.equal(profile.coachingMethodId, "hormozi-sales-2026");
});
