routerAdd("GET", "/api/trainer/provisioning-health", (e) => {
  const configured = String($os.getenv("POCKETBASE_PROVISIONING_SECRET") || "");
  const supplied = String(e.request.header.get("X-Trainer-Provisioning-Key") || "");
  if (configured.length < 32) throw new ApiError(503, "Provisioning is not configured");
  if (!$security.equal(supplied, configured)) throw new ForbiddenError("Provisioning is not authorized");
  e.app.findCollectionByNameOrId("users");
  return e.json(200, { ok: true });
});

routerAdd("POST", "/api/trainer/provision-approved-user", (e) => {
  const configured = String($os.getenv("POCKETBASE_PROVISIONING_SECRET") || "");
  const supplied = String(e.request.header.get("X-Trainer-Provisioning-Key") || "");
  if (configured.length < 32) throw new ApiError(503, "Provisioning is not configured");
  if (!$security.equal(supplied, configured)) throw new ForbiddenError("Provisioning is not authorized");
  const body = e.requestInfo().body;
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 120);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestError("A valid email is required");
  }
  if (password.length < 8 || password.length > 256) {
    throw new BadRequestError("Password does not meet policy");
  }

  const matches = e.app.findRecordsByFilter(
    "users",
    "email = {:email}",
    "",
    2,
    0,
    { email },
  );
  if (matches.length > 1) throw new ApiError(500, "User identity is ambiguous");

  let record = matches[0];
  const created = !record;
  if (!record) {
    const collection = e.app.findCollectionByNameOrId("users");
    record = new Record(collection);
    record.set("email", email);
  }

  // Existing records are updated in place: email, id and saved training data
  // are never replaced. Only an empty display name may be filled.
  record.setPassword(password);
  record.set("verified", true);
  if (name && !String(record.get("name") || "").trim()) record.set("name", name);
  if (!created) record.refreshTokenKey();
  e.app.save(record);

  return e.json(created ? 201 : 200, {
    created,
    user: {
      id: record.id,
      email: record.get("email"),
      name: record.get("name") || "",
    },
  });
});
