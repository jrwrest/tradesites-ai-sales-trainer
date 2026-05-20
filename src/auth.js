const LOCAL_USER = {
  id: "local",
  email: "local@tradesites.ai",
  name: "Local Rep",
  source: "local",
};

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

function pocketBaseUrl() {
  return (process.env.POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
}

function isLoopbackHost(hostname) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
}

function validatePocketBaseUrl(rawUrl = pocketBaseUrl()) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    const error = new Error("Invalid PocketBase URL");
    error.code = "POCKETBASE_URL_INVALID";
    throw error;
  }

  const unsafeAllowed = process.env.ALLOW_REMOTE_POCKETBASE_UNSAFE === "1";
  if (!["http:", "https:"].includes(url.protocol)) {
    const error = new Error("PocketBase URL must use http or https");
    error.code = "POCKETBASE_URL_INVALID";
    throw error;
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname) && !unsafeAllowed) {
    const error = new Error("Refusing insecure non-loopback PocketBase URL");
    error.code = "POCKETBASE_URL_UNSAFE";
    throw error;
  }
  return url.toString().replace(/\/$/, "");
}

function pocketBaseTimeoutMs() {
  const value = Number(process.env.POCKETBASE_TIMEOUT_MS || 5000);
  return Number.isFinite(value) && value > 0 ? value : 5000;
}

function normalizePocketBaseUser(record = {}) {
  return {
    id: record.id,
    email: record.email || record.username || "",
    name: record.name || record.email || record.username || "Rep",
    source: "pocketbase",
  };
}

function normalizePocketBaseAuth(payload = {}) {
  return {
    token: payload.token,
    user: normalizePocketBaseUser(payload.record),
  };
}

async function pocketBaseRequest(path, { method = "GET", token, body, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), pocketBaseTimeoutMs());
  try {
    const response = await fetchImpl(`${validatePocketBaseUrl()}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("PocketBase request failed");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      error.code = "POCKETBASE_TIMEOUT";
      error.status = 503;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyPocketBaseToken(token, options = {}) {
  const payload = await pocketBaseRequest("/api/collections/users/auth-refresh", {
    method: "POST",
    token,
    fetchImpl: options.fetchImpl,
  });
  return normalizePocketBaseAuth(payload).user;
}

async function loginWithPocketBase({ email, password }, options = {}) {
  const payload = await pocketBaseRequest("/api/collections/users/auth-with-password", {
    method: "POST",
    body: { identity: email, password },
    fetchImpl: options.fetchImpl,
  });
  return normalizePocketBaseAuth(payload);
}

async function signupWithPocketBase({ email, password, name }, options = {}) {
  const body = {
    email,
    password,
    passwordConfirm: password,
    ...(name ? { name } : {}),
  };
  await pocketBaseRequest("/api/collections/users/records", {
    method: "POST",
    body,
    fetchImpl: options.fetchImpl,
  });
  return loginWithPocketBase({ email, password }, options);
}

async function resolveRequestUser(req, { authRequired = false, verifyToken = verifyPocketBaseToken } = {}) {
  const token = getBearerToken(req);
  if (!token) {
    if (authRequired) {
      const error = new Error("Authentication required");
      error.code = "AUTH_REQUIRED";
      throw error;
    }
    return LOCAL_USER;
  }
  try {
    const user = await verifyToken(token);
    if (!user || !user.id) {
      const error = new Error("Invalid auth token");
      error.status = 401;
      throw error;
    }
    return user;
  } catch (error) {
    error.code = error.status && error.status < 500 ? "AUTH_INVALID" : "AUTH_UNAVAILABLE";
    throw error;
  }
}

module.exports = {
  LOCAL_USER,
  getBearerToken,
  loginWithPocketBase,
  normalizePocketBaseAuth,
  normalizePocketBaseUser,
  pocketBaseUrl,
  resolveRequestUser,
  signupWithPocketBase,
  validatePocketBaseUrl,
  verifyPocketBaseToken,
};
