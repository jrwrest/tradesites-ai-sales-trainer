const fs = require("node:fs/promises");
const path = require("node:path");
const { withKeyLock } = require("./keyLock");

function getDataDir() {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, "..", "data");
}

function getSessionsDir() {
  return path.join(getDataDir(), "sessions");
}

async function ensureStore() {
  await fs.mkdir(getSessionsDir(), { recursive: true, mode: 0o700 });
  await fs.chmod(getDataDir(), 0o700);
  await fs.chmod(getSessionsDir(), 0o700);
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
  return withKeyLock(`session:${session.id}`, async () => {
    await ensureStore();
    const target = sessionPath(session.id);
    let currentRevision = null;
    try {
      const current = JSON.parse(await fs.readFile(target, "utf8"));
      currentRevision = Number(current.revision || 0);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const expectedRevision = Number(session.revision || 0);
    if (currentRevision === null && expectedRevision !== 0) {
      const error = new Error("Session was deleted while this request was in progress");
      error.code = "SESSION_CONFLICT";
      throw error;
    }
    if (currentRevision !== null && currentRevision !== expectedRevision) {
      const error = new Error("Session changed while this request was in progress");
      error.code = "SESSION_CONFLICT";
      throw error;
    }
    const nextRevision = (currentRevision || 0) + 1;
    const persisted = { ...session, revision: nextRevision };
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(persisted, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temp, target);
    await fs.chmod(target, 0o600);
    session.revision = nextRevision;
    return session;
  });
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

async function deleteSessionsForRep(repId) {
  const sessions = await listSessions(repId);
  let deleted = 0;
  for (const session of sessions) {
    await withKeyLock(`session:${session.id}`, async () => {
      await fs.unlink(sessionPath(session.id)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    });
    deleted += 1;
  }
  return { deleted };
}

async function purgeExpiredSessions({ retentionDays = 90, now = new Date() } = {}) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error("retentionDays must be positive");
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const sessions = await listSessions();
  const expired = sessions
    .filter((session) => session.status === "ended" && session.endedAt
      && new Date(session.endedAt).getTime() < cutoff)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const session of expired) {
    await withKeyLock(`session:${session.id}`, () => fs.unlink(sessionPath(session.id)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    }));
  }
  return { deleted: expired.length, deletedSessionIds: expired.map((session) => session.id) };
}

module.exports = {
  ensureStore,
  deleteSessionsForRep,
  getDataDir,
  getSessionsDir,
  listSessions,
  saveSession,
  loadSession,
  purgeExpiredSessions,
};
