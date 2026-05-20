const fs = require("node:fs/promises");
const path = require("node:path");

function getDataDir() {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, "..", "data");
}

function getSessionsDir() {
  return path.join(getDataDir(), "sessions");
}

async function ensureStore() {
  await fs.mkdir(getSessionsDir(), { recursive: true });
}

function sessionPath(sessionId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    const error = new Error("Invalid session id");
    error.code = "INVALID_SESSION_ID";
    throw error;
  }
  return path.join(getSessionsDir(), `${sessionId}.json`);
}

async function saveSession(session) {
  await ensureStore();
  const target = sessionPath(session.id);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(session, null, 2)}\n`);
  await fs.rename(temp, target);
}

async function loadSession(sessionId) {
  const raw = await fs.readFile(sessionPath(sessionId), "utf8");
  return JSON.parse(raw);
}

async function listSessions(repId = null) {
  await ensureStore();
  const entries = await fs.readdir(getSessionsDir(), { withFileTypes: true });
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(getSessionsDir(), entry.name), "utf8");
    const session = JSON.parse(raw);
    if (!repId || (session.repId || "local") === repId) {
      sessions.push(session);
    }
  }
  return sessions;
}

module.exports = {
  ensureStore,
  getDataDir,
  getSessionsDir,
  listSessions,
  saveSession,
  loadSession,
};
