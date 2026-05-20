const fs = require("node:fs/promises");
const path = require("node:path");
const { getDataDir } = require("./store");

const PROFILE_FIELDS = [
  "repName",
  "companyName",
  "role",
  "offer",
  "targetCustomers",
  "callGoal",
  "opener",
  "notes",
];

function safeRepId(repId = "local") {
  return Buffer.from(String(repId || "local"), "utf8").toString("base64url");
}

function profilesDir() {
  return path.join(getDataDir(), "profiles");
}

function profilePath(repId = "local") {
  return path.join(profilesDir(), `${safeRepId(repId)}.json`);
}

function defaultProfile(user = {}) {
  const repName = user.name && user.name !== "Rep" ? user.name : "Alex Morgan";
  return {
    schemaVersion: 1,
    repId: user.id || "local",
    repName,
    companyName: "BrightTrade Solar",
    role: "Commercial sales rep",
    offer: "Help larger businesses assess commercial solar fit and funded/PPA options.",
    targetCustomers: "Large businesses, property owners, and commercial sites exploring solar.",
    callGoal: "Earn permission, qualify fit, identify the decision process, and book a useful follow-up.",
    opener: `Hi, it's ${repName} from BrightTrade Solar. I'm calling about commercial solar for your site. Can I take 20 seconds?`,
    notes: "Keep the tone practical, low pressure, and useful. Respect hard no responses cleanly.",
    updatedAt: null,
  };
}

function cleanField(value, maxLength = 800) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeProfile(input = {}, user = {}) {
  const base = defaultProfile(user);
  const profile = {
    ...base,
    ...Object.fromEntries(
      PROFILE_FIELDS.map((field) => [field, cleanField(input[field] ?? base[field])]),
    ),
    schemaVersion: 1,
    repId: user.id || input.repId || "local",
    updatedAt: input.updatedAt || null,
  };
  return profile;
}

async function loadProfile(user = {}) {
  try {
    const raw = await fs.readFile(profilePath(user.id || "local"), "utf8");
    return normalizeProfile(JSON.parse(raw), user);
  } catch (error) {
    if (error.code === "ENOENT") return defaultProfile(user);
    error.code = "PROFILE_READ_FAILED";
    throw error;
  }
}

async function saveProfile(user = {}, input = {}) {
  await fs.mkdir(profilesDir(), { recursive: true });
  const profile = {
    ...normalizeProfile(input, user),
    updatedAt: new Date().toISOString(),
  };
  const target = profilePath(user.id || "local");
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(profile, null, 2)}\n`);
  await fs.rename(temp, target);
  return profile;
}

module.exports = {
  defaultProfile,
  loadProfile,
  normalizeProfile,
  profilePath,
  saveProfile,
};
