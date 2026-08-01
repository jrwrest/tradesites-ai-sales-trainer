const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRelativePath(relativePath) {
  return typeof relativePath === "string"
    && relativePath.length > 0
    && !path.isAbsolute(relativePath)
    && !relativePath.split(/[\\/]/).includes("..");
}

async function listRegularFiles(root, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.endsWith(".tmp")) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Backup source contains a symbolic link: ${absolute}`);
    if (entry.isDirectory()) files.push(...await listRegularFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute));
  }
  return files.sort();
}

async function createBackup({ dataDir, backupRoot, now = new Date() } = {}) {
  if (!dataDir || !backupRoot) throw new Error("dataDir and backupRoot are required");
  const source = path.resolve(dataDir);
  const destinationRoot = path.resolve(backupRoot);
  if (isWithin(source, destinationRoot) || isWithin(destinationRoot, source)) {
    throw new Error("dataDir and backupRoot must not overlap");
  }
  const sourceStat = await fs.stat(source);
  if (!sourceStat.isDirectory()) throw new Error("dataDir must be a directory");

  await fs.mkdir(destinationRoot, { recursive: true, mode: 0o700 });
  await fs.chmod(destinationRoot, 0o700);
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(destinationRoot, `${timestamp}-${crypto.randomBytes(4).toString("hex")}`);
  const payloadDir = path.join(backupDir, "data");
  await fs.mkdir(payloadDir, { recursive: true, mode: 0o700 });

  const manifestFiles = [];
  for (const relativePath of await listRegularFiles(source)) {
    const input = await fs.readFile(path.join(source, relativePath));
    const target = path.join(payloadDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, input, { mode: 0o600 });
    manifestFiles.push({ path: relativePath, bytes: input.length, sha256: sha256(input) });
  }
  const manifest = {
    schemaVersion: 1,
    createdAt: now.toISOString(),
    consistency: "application-stopped-or-filesystem-snapshot-required",
    files: manifestFiles,
  };
  await fs.writeFile(
    path.join(backupDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { backupDir, manifest };
}

async function verifyBackup({ backupDir } = {}) {
  const root = path.resolve(backupDir || "");
  const errors = [];
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
  } catch (error) {
    return { valid: false, errors: [`manifest unreadable: ${error.message}`], manifest: null };
  }
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
    return { valid: false, errors: ["manifest schema is invalid"], manifest };
  }
  const declaredPaths = new Set();
  for (const file of manifest.files) {
    if (!safeRelativePath(file.path)) {
      errors.push(`unsafe manifest path: ${file.path}`);
      continue;
    }
    if (declaredPaths.has(file.path)) {
      errors.push(`duplicate manifest path: ${file.path}`);
      continue;
    }
    declaredPaths.add(file.path);
    try {
      const contents = await fs.readFile(path.join(root, "data", file.path));
      if (contents.length !== file.bytes) errors.push(`size mismatch: ${file.path}`);
      if (sha256(contents) !== file.sha256) errors.push(`checksum mismatch: ${file.path}`);
    } catch (error) {
      errors.push(`payload unreadable: ${file.path}: ${error.code || error.message}`);
    }
  }
  try {
    const actualPaths = await listRegularFiles(path.join(root, "data"));
    for (const actualPath of actualPaths) {
      if (!declaredPaths.has(actualPath)) errors.push(`undeclared payload file: ${actualPath}`);
    }
  } catch (error) {
    errors.push(`payload directory unreadable: ${error.message}`);
  }
  return { valid: errors.length === 0, errors, manifest };
}

async function restoreBackup({ backupDir, targetDir } = {}) {
  if (!backupDir || !targetDir) throw new Error("backupDir and targetDir are required");
  const verification = await verifyBackup({ backupDir });
  if (!verification.valid) throw new Error(`Backup verification failed: ${verification.errors.join("; ")}`);
  const target = path.resolve(targetDir);
  try {
    if ((await fs.readdir(target)).length > 0) throw new Error("Restore target must be empty");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.mkdir(target, { recursive: true, mode: 0o700 });
  await fs.chmod(target, 0o700);
  for (const file of verification.manifest.files) {
    const input = await fs.readFile(path.join(path.resolve(backupDir), "data", file.path));
    const destination = path.join(target, file.path);
    if (!isWithin(target, destination)) throw new Error(`Unsafe restore path: ${file.path}`);
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.writeFile(destination, input, { mode: 0o600 });
  }
  return { files: verification.manifest.files.length, targetDir: target };
}

module.exports = { createBackup, restoreBackup, verifyBackup };
