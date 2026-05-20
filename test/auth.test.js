const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  getBearerToken,
  LOCAL_USER,
  normalizePocketBaseAuth,
  resolveRequestUser,
  validatePocketBaseUrl,
} = require("../src/auth");

test("getBearerToken accepts bearer authorization headers only", () => {
  assert.equal(getBearerToken({ headers: { authorization: "Bearer abc123" } }), "abc123");
  assert.equal(getBearerToken({ headers: { authorization: "bearer token-with-space " } }), "token-with-space");
  assert.equal(getBearerToken({ headers: { authorization: "Basic abc123" } }), null);
  assert.equal(getBearerToken({ headers: {} }), null);
});

test("normalizePocketBaseAuth returns token and normalized public user only", () => {
  const auth = normalizePocketBaseAuth({
    token: "pb-token",
    record: {
      id: "rep-1",
      email: "rep@example.com",
      name: "Rep One",
      verified: true,
      passwordHash: "secret",
    },
  });

  assert.deepEqual(auth, {
    token: "pb-token",
    user: {
      id: "rep-1",
      email: "rep@example.com",
      name: "Rep One",
      source: "pocketbase",
    },
  });
  assert.equal("passwordHash" in auth.user, false);
  assert.equal("verified" in auth.user, false);
});

test("resolveRequestUser returns local user when auth is optional and no bearer token is supplied", async () => {
  const user = await resolveRequestUser({ headers: {} }, { authRequired: false });
  assert.deepEqual(user, LOCAL_USER);
});

test("resolveRequestUser rejects anonymous requests when auth is required", async () => {
  await assert.rejects(
    () => resolveRequestUser({ headers: {} }, { authRequired: true }),
    { code: "AUTH_REQUIRED" },
  );
});

test("resolveRequestUser rejects bad bearer tokens without falling back to local", async () => {
  await assert.rejects(
    () =>
      resolveRequestUser(
        { headers: { authorization: "Bearer bad-token" } },
        {
          authRequired: false,
          verifyToken: async () => {
            const error = new Error("bad token");
            error.status = 401;
            throw error;
          },
        },
      ),
    { code: "AUTH_INVALID" },
  );
});

test("resolveRequestUser rejects verifier responses without a user id", async () => {
  await assert.rejects(
    () =>
      resolveRequestUser(
        { headers: { authorization: "Bearer empty-user" } },
        {
          authRequired: false,
          verifyToken: async () => null,
        },
      ),
    { code: "AUTH_INVALID" },
  );
});

test("resolveRequestUser fails closed when auth service is unavailable", async () => {
  await assert.rejects(
    () =>
      resolveRequestUser(
        { headers: { authorization: "Bearer good-looking-token" } },
        {
          authRequired: false,
          verifyToken: async () => {
            const error = new Error("PocketBase down");
            error.status = 503;
            throw error;
          },
        },
      ),
    { code: "AUTH_UNAVAILABLE" },
  );
});

test("validatePocketBaseUrl allows loopback http and rejects unsafe remote http by default", () => {
  const previousUrl = process.env.POCKETBASE_URL;
  const previousUnsafe = process.env.ALLOW_REMOTE_POCKETBASE_UNSAFE;
  try {
    delete process.env.ALLOW_REMOTE_POCKETBASE_UNSAFE;
    assert.equal(validatePocketBaseUrl("http://127.0.0.1:8090"), "http://127.0.0.1:8090");
    assert.equal(validatePocketBaseUrl("https://auth.example.com"), "https://auth.example.com");
    assert.throws(
      () => validatePocketBaseUrl("http://auth.example.com"),
      { code: "POCKETBASE_URL_UNSAFE" },
    );
    process.env.ALLOW_REMOTE_POCKETBASE_UNSAFE = "1";
    assert.equal(validatePocketBaseUrl("http://auth.example.com"), "http://auth.example.com");
  } finally {
    if (previousUrl === undefined) {
      delete process.env.POCKETBASE_URL;
    } else {
      process.env.POCKETBASE_URL = previousUrl;
    }
    if (previousUnsafe === undefined) {
      delete process.env.ALLOW_REMOTE_POCKETBASE_UNSAFE;
    } else {
      process.env.ALLOW_REMOTE_POCKETBASE_UNSAFE = previousUnsafe;
    }
  }
});
