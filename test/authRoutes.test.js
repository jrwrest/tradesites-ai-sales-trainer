const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const { createApp } = require("../src/server");

let previousDataDir;
let tempDataDir;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tradesites-auth-test-"));
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

async function withServer(app, run) {
  let server;
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  async function request(route, options = {}) {
    const response = await fetch(`${baseUrl}${route}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => null);
    return { response, body };
  }

  try {
    await run(request);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const usersByToken = {
  "token-a": { id: "rep-a", email: "a@example.com", name: "Rep A", source: "pocketbase" },
  "token-b": { id: "rep-b", email: "b@example.com", name: "Rep B", source: "pocketbase" },
};

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

test("auth endpoints use injected PocketBase client and return normalized auth shape", async () => {
  const app = createApp({
    authRequired: true,
    authClient: {
      login: async ({ email, password }) => {
        assert.equal(email, "a@example.com");
        assert.equal(password, "secret");
        return { token: "token-a", user: usersByToken["token-a"] };
      },
      signup: async ({ email, password, name }) => {
        assert.equal(email, "new@example.com");
        assert.equal(password, "secret");
        assert.equal(name, "New Rep");
        return {
          token: "token-new",
          user: { id: "rep-new", email, name, source: "pocketbase" },
        };
      },
    },
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const login = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@example.com", password: "secret" }),
    });
    assert.equal(login.response.status, 200);
    assert.deepEqual(login.body, { token: "token-a", user: usersByToken["token-a"] });

    const signup = await request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com", password: "secret", name: "New Rep" }),
    });
    assert.equal(signup.response.status, 201);
    assert.equal(signup.body.token, "token-new");
    assert.equal(signup.body.user.id, "rep-new");
  });
});

test("auth-required mode rejects anonymous trainer routes", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const routes = [
      ["/api/drills/due", {}],
      ["/api/review-queue", {}],
      ["/api/sessions", { method: "POST", body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }) }],
      ["/api/gauntlets", { method: "POST", body: JSON.stringify({ rounds: 3 }) }],
      ["/api/reply", { method: "POST", body: JSON.stringify({ scenarioId: "roofing-owner", text: "hello" }) }],
      ["/api/score", { method: "POST", body: JSON.stringify({ scenarioId: "roofing-owner", turns: [] }) }],
    ];

    for (const [route, options] of routes) {
      const result = await request(route, options);
      assert.equal(result.response.status, 401, route);
      assert.equal(result.body.code, "auth_required", route);
    }
  });
});

test("auth is required by default when AUTH_REQUIRED is unset", async () => {
  const previousAuthRequired = process.env.AUTH_REQUIRED;
  delete process.env.AUTH_REQUIRED;
  const app = createApp({
    authVerifier: async (token) => usersByToken[token],
  });

  try {
    await withServer(app, async (request) => {
      const response = await request("/api/drills/due");
      assert.equal(response.response.status, 401);
      assert.equal(response.body.code, "auth_required");
    });
  } finally {
    if (previousAuthRequired === undefined) {
      delete process.env.AUTH_REQUIRED;
    } else {
      process.env.AUTH_REQUIRED = previousAuthRequired;
    }
  }
});

test("signup can be disabled for shared deployments", async () => {
  const app = createApp({
    authRequired: true,
    signupEnabled: false,
    authVerifier: async (token) => usersByToken[token],
    authClient: {
      login: async () => ({ token: "token-a", user: usersByToken["token-a"] }),
      signup: async () => {
        throw new Error("signup should not be called");
      },
    },
  });

  await withServer(app, async (request) => {
    const response = await request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com", password: "secret", name: "New Rep" }),
    });
    assert.equal(response.response.status, 403);
    assert.equal(response.body.code, "signup_disabled");
  });
});

test("auth me returns the current normalized user", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const me = await request("/api/auth/me", { headers: authHeader("token-a") });
    assert.equal(me.response.status, 200);
    assert.deepEqual(me.body, {
      user: usersByToken["token-a"],
      authRequired: true,
    });
  });
});

test("profile endpoints return and save the current rep profile", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const loaded = await request("/api/profile", { headers: authHeader("token-a") });
    assert.equal(loaded.response.status, 200);
    assert.equal(loaded.body.profile.repId, "rep-a");
    assert.equal(loaded.body.profile.companyName, "BrightTrade Solar");

    const saved = await request("/api/profile", {
      method: "PUT",
      headers: authHeader("token-a"),
      body: JSON.stringify({
        profile: {
          repName: "Alex Morgan",
          companyName: "BrightTrade Solar",
          callGoal: "Book useful commercial solar follow-ups.",
        },
      }),
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.profile.repId, "rep-a");
    assert.equal(saved.body.profile.repName, "Alex Morgan");
    assert.equal(saved.body.profile.callGoal, "Book useful commercial solar follow-ups.");
  });
});

test("authenticated sessions are saved under the current rep and denied to other reps", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const created = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.session.repId, "rep-a");

    const sessionId = created.body.session.id;
    const loadedByOwner = await request(`/api/sessions/${sessionId}`, {
      headers: authHeader("token-a"),
    });
    assert.equal(loadedByOwner.response.status, 200);

    const loadedByOther = await request(`/api/sessions/${sessionId}`, {
      headers: authHeader("token-b"),
    });
    assert.equal(loadedByOther.response.status, 404);
    assert.equal(loadedByOther.body.code, "not_found");

    const mutatedByOther = await request(`/api/sessions/${sessionId}/coach-notes`, {
      method: "POST",
      headers: authHeader("token-b"),
      body: JSON.stringify({ note: "Should not save." }),
    });
    assert.equal(mutatedByOther.response.status, 404);
  });
});

test("review queue and due drills are scoped to the authenticated rep", async () => {
  const app = createApp({
    authRequired: true,
    authVerifier: async (token) => usersByToken[token],
  });

  await withServer(app, async (request) => {
    const repA = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }),
    });
    const repB = await request("/api/sessions", {
      method: "POST",
      headers: authHeader("token-b"),
      body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }),
    });
    await request(`/api/sessions/${repA.body.session.id}/message`, {
      method: "POST",
      headers: authHeader("token-a"),
      body: JSON.stringify({ text: "James from SFS. Can I take 20 seconds?" }),
    });
    await request(`/api/sessions/${repB.body.session.id}/message`, {
      method: "POST",
      headers: authHeader("token-b"),
      body: JSON.stringify({ text: "Just calling about solar." }),
    });
    await request(`/api/sessions/${repA.body.session.id}/end`, {
      method: "POST",
      headers: authHeader("token-a"),
    });
    await request(`/api/sessions/${repB.body.session.id}/end`, {
      method: "POST",
      headers: authHeader("token-b"),
    });

    const queueA = await request("/api/review-queue", { headers: authHeader("token-a") });
    const queueB = await request("/api/review-queue", { headers: authHeader("token-b") });
    const sessionIdsA = queueA.body.queue.map((item) => item.sessionId);
    const sessionIdsB = queueB.body.queue.map((item) => item.sessionId);
    assert.ok(sessionIdsA.includes(repA.body.session.id));
    assert.equal(sessionIdsA.includes(repB.body.session.id), false);
    assert.ok(sessionIdsB.includes(repB.body.session.id));
    assert.equal(sessionIdsB.includes(repA.body.session.id), false);

    const dueA = await request("/api/drills/due?now=2030-01-01T00:00:00.000Z", {
      headers: authHeader("token-a"),
    });
    const dueB = await request("/api/drills/due?now=2030-01-01T00:00:00.000Z", {
      headers: authHeader("token-b"),
    });
    assert.equal(dueA.response.status, 200);
    assert.equal(dueB.response.status, 200);
    assert.ok(Array.isArray(dueA.body.drills));
    assert.ok(Array.isArray(dueB.body.drills));
  });
});

test("bad bearer tokens fail closed when auth is optional", async () => {
  const app = createApp({
    authRequired: false,
    authVerifier: async () => {
      const error = new Error("PocketBase down");
      error.status = 503;
      throw error;
    },
  });

  await withServer(app, async (request) => {
    const response = await request("/api/auth/me", { headers: authHeader("bad") });
    assert.equal(response.response.status, 503);
    assert.equal(response.body.code, "auth_unavailable");
    assert.equal(response.body.error, "Authentication service unavailable.");
  });
});
