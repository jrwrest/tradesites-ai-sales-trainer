const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_METHOD_PACK_ID = "hormozi-sales-2026";
const METHOD_PACKS_DIR = path.join(__dirname, "..", "method-packs");
const METHOD_REGISTRY = Object.freeze([
  Object.freeze({ id: DEFAULT_METHOD_PACK_ID, version: "1.0.0-beta.3" }),
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function methodUnavailable(message = "Coaching method unavailable") {
  const error = new Error(message);
  error.code = "METHOD_UNAVAILABLE";
  return error;
}

function assertMethodId(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error("Invalid method pack id");
  }
}

function packDirectory(id, version = null) {
  const packDir = path.join(METHOD_PACKS_DIR, id);
  if (!fs.existsSync(packDir) || !fs.statSync(packDir).isDirectory()) {
    throw new Error(`Unknown method pack: ${id}`);
  }
  if (!version) return packDir;
  const currentManifest = readJson(path.join(packDir, "manifest.json"));
  if (currentManifest.version === version) return packDir;
  return path.join(packDir, "versions", version);
}

function loadMethodPackFiles(packDir, id) {
  if (!fs.existsSync(packDir) || !fs.statSync(packDir).isDirectory()) {
    throw methodUnavailable(`Unknown method pack version: ${id}`);
  }
  const pack = {
    manifest: readJson(path.join(packDir, "manifest.json")),
    framework: readJson(path.join(packDir, "framework.json")),
    rubric: readJson(path.join(packDir, "rubric.json")),
    drills: readJson(path.join(packDir, "drills.json")),
    coaching: readJson(path.join(packDir, "coaching.json")),
  };
  if (pack.manifest.id !== id) {
    throw new Error(`Invalid method pack ${id}: manifest id does not match its registry path`);
  }
  const validation = validateMethodPack(pack);
  if (!validation.valid) {
    throw new Error(`Invalid method pack ${id}: ${validation.errors.join("; ")}`);
  }
  return pack;
}

function loadMethodPack(id = DEFAULT_METHOD_PACK_ID) {
  assertMethodId(id);
  if (!METHOD_REGISTRY.some((item) => item.id === id)) {
    throw new Error(`Unknown method pack: ${id}`);
  }
  return loadMethodPackFiles(packDirectory(id), id);
}

function resolveMethodPack(pin = {}) {
  try {
    assertMethodId(String(pin.id || ""));
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(pin.version || ""))) {
      throw methodUnavailable("Invalid method pack version");
    }
    const registered = METHOD_REGISTRY.some(
      (item) => item.id === pin.id && item.version === pin.version,
    );
    const versionDir = path.join(METHOD_PACKS_DIR, pin.id, "versions", pin.version);
    if (!registered && !fs.existsSync(versionDir)) throw methodUnavailable();
    const pack = loadMethodPackFiles(packDirectory(pin.id, pin.version), pin.id);
    if (pack.manifest.id !== pin.id || pack.manifest.version !== pin.version) {
      throw methodUnavailable("Method manifest does not match the requested pin");
    }
    return pack;
  } catch (error) {
    if (error.code === "METHOD_UNAVAILABLE") throw error;
    throw methodUnavailable();
  }
}

function listMethodPacks() {
  const registryValidation = validateMethodRegistry();
  if (!registryValidation.valid) {
    throw new Error(`Invalid method registry: ${registryValidation.errors.join("; ")}`);
  }
  return METHOD_REGISTRY.map(({ id, version }) => {
    const pack = resolveMethodPack({ id, version });
    return {
      id,
      version,
      displayName: pack.manifest.displayName,
      status: pack.manifest.status,
    };
  });
}

function validateMethodRegistry(entries = METHOD_REGISTRY) {
  const errors = [];
  const pins = new Set();
  for (const entry of entries) {
    const pin = `${entry?.id || ""}@${entry?.version || ""}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry?.id || "")) errors.push(`invalid method id ${entry?.id || ""}`);
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry?.version || "")) errors.push(`invalid method version ${entry?.version || ""}`);
    if (pins.has(pin)) errors.push(`duplicate method pin ${pin}`);
    pins.add(pin);
  }
  if (!entries.some((entry) => entry.id === DEFAULT_METHOD_PACK_ID)) {
    errors.push("default method is not registered");
  }
  return { valid: errors.length === 0, errors };
}

function defaultMethodPackPin() {
  const entry = METHOD_REGISTRY.find((item) => item.id === DEFAULT_METHOD_PACK_ID);
  return { id: entry.id, version: entry.version };
}

function validateMethodPack(pack) {
  const errors = [];
  const manifest = pack && pack.manifest;
  const framework = pack && pack.framework;
  const rubric = pack && pack.rubric;
  const drills = pack && pack.drills;
  const coaching = pack && pack.coaching;
  if (!manifest || !framework || !rubric || !drills || !coaching) {
    return { valid: false, errors: ["manifest, framework, rubric, drills, and coaching are required"] };
  }

  if (manifest.schemaVersion !== 1) errors.push("manifest schemaVersion must be 1");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id || "")) errors.push("manifest id is invalid");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version || "")) errors.push("manifest version is invalid");
  if (!/^https:\/\//.test(manifest.primarySource && manifest.primarySource.url || "")) {
    errors.push("primary source must use https");
  }

  const sourceSections = Array.isArray(manifest.sourceSections) ? manifest.sourceSections : [];
  const sourceIds = uniqueIds(sourceSections, "source section", errors);
  for (const section of sourceSections) {
    if (!Number.isInteger(section.startSeconds) || !Number.isInteger(section.endSeconds)) {
      errors.push(`source section ${section.id || "unknown"} needs integer timestamps`);
    } else if (section.startSeconds < 0 || section.endSeconds <= section.startSeconds) {
      errors.push(`source section ${section.id || "unknown"} has an invalid range`);
    }
  }

  const behaviors = Array.isArray(framework.behaviors) ? framework.behaviors : [];
  const behaviorIds = uniqueIds(behaviors, "behavior", errors);
  const stages = Array.isArray(framework.stages) ? framework.stages : [];
  const stageIds = uniqueIds(stages, "stage", errors);
  const frameworks = Array.isArray(framework.frameworks) ? framework.frameworks : [];
  uniqueIds(frameworks, "framework", errors);

  for (const behavior of behaviors) {
    if (!stageIds.has(behavior.stageId)) errors.push(`behavior ${behavior.id} has unknown stage ${behavior.stageId}`);
    validateRefs(behavior.sourceRefs, sourceIds, `behavior ${behavior.id}`, errors);
    if (!Array.isArray(behavior.positiveEvidence) || !Array.isArray(behavior.counterEvidence)) {
      errors.push(`behavior ${behavior.id} needs positiveEvidence and counterEvidence arrays`);
    }
  }
  for (const stage of stages) {
    validateRefs(stage.behaviorIds, behaviorIds, `stage ${stage.id}`, errors);
  }
  for (const item of frameworks) {
    validateRefs(item.behaviorIds, behaviorIds, `framework ${item.id}`, errors);
  }

  const weights = Array.isArray(rubric.stageWeights) ? rubric.stageWeights : [];
  if (weights.reduce((total, item) => total + Number(item.weight || 0), 0) !== 100) {
    errors.push("stage weights must total 100");
  }
  for (const weight of weights) {
    if (!stageIds.has(weight.stageId)) errors.push(`stage weight has unknown stage ${weight.stageId}`);
  }
  const criticalGates = Array.isArray(rubric.criticalGates) ? rubric.criticalGates : [];
  uniqueIds(criticalGates, "critical gate", errors);
  for (const gate of criticalGates) {
    validateRefs(gate.sourceRefs, sourceIds, `critical gate ${gate.id}`, errors);
    if (gate.effect && gate.effect.requiredDrillBehaviorId
      && !behaviorIds.has(gate.effect.requiredDrillBehaviorId)) {
      errors.push(`critical gate ${gate.id} has unknown drill behavior`);
    }
  }

  validateRefs(drills.sourceRefs, sourceIds, "drills", errors);
  const drillItems = Array.isArray(drills.drills) ? drills.drills : [];
  uniqueIds(drillItems, "drill", errors);
  for (const drill of drillItems) {
    if (!behaviorIds.has(drill.behaviorId)) errors.push(`drill ${drill.id} has unknown behavior ${drill.behaviorId}`);
    if (!drill.constraintId) errors.push(`drill ${drill.id} needs one constraintId`);
    if (!Array.isArray(drill.focusBehaviors) || drill.focusBehaviors.length !== 1
      || drill.focusBehaviors[0] !== drill.behaviorId) {
      errors.push(`drill ${drill.id} must focus on exactly its behaviorId`);
    }
  }

  const allowedTokens = new Set(coaching.allowedTemplateTokens || []);
  if (!["method_owned", "legacy_passthrough"].includes(coaching.mode)) {
    errors.push("coaching mode must be method_owned or legacy_passthrough");
  }
  const supportedTokens = new Set(["repName", "companyName"]);
  for (const token of allowedTokens) {
    if (!supportedTokens.has(token)) errors.push(`coaching has unsupported template token ${token}`);
  }
  for (const [stage, frameworkId] of Object.entries(coaching.frameworkByStage || {})) {
    if (!stageIds.has(stage) && !["opener", "permission", "discovery", "qualification", "commercial", "close"].includes(stage)) {
      errors.push(`coaching has unknown stage ${stage}`);
    }
    if (!frameworks.some((item) => item.id === frameworkId)) {
      errors.push(`coaching stage ${stage} has unknown framework ${frameworkId}`);
    }
  }
  for (const [move, frameworkId] of Object.entries(coaching.frameworkByMove || {})) {
    if (!/^[a-z]+(?:_[a-z]+)*$/.test(move)) errors.push(`coaching has invalid move ${move}`);
    if (!frameworks.some((item) => item.id === frameworkId)) {
      errors.push(`coaching move ${move} has unknown framework ${frameworkId}`);
    }
  }
  const templates = JSON.stringify(coaching.techniques || {});
  for (const [techniqueId, technique] of Object.entries(coaching.techniques || {})) {
    validateRefs(technique.sourceRefs, sourceIds, `coaching technique ${techniqueId}`, errors);
    if (typeof technique.prompt !== "string" || !technique.prompt.trim()) {
      errors.push(`coaching technique ${techniqueId} needs a prompt`);
    }
    if (!Array.isArray(technique.guidance) || technique.guidance.length === 0) {
      errors.push(`coaching technique ${techniqueId} needs guidance`);
    }
    if (typeof technique.template !== "string" || !technique.template.trim()) {
      errors.push(`coaching technique ${techniqueId} needs a template`);
    }
  }
  for (const match of templates.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)) {
    if (!allowedTokens.has(match[1])) errors.push(`coaching template uses unapproved token ${match[1]}`);
  }

  return { valid: errors.length === 0, errors };
}

function uniqueIds(items, label, errors) {
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !item.id) {
      errors.push(`${label} is missing an id`);
    } else if (ids.has(item.id)) {
      errors.push(`duplicate ${label} id ${item.id}`);
    } else {
      ids.add(item.id);
    }
  }
  return ids;
}

function validateRefs(refs, validIds, label, errors) {
  if (!Array.isArray(refs) || refs.length === 0) {
    errors.push(`${label} needs references`);
    return;
  }
  for (const ref of refs) {
    if (!validIds.has(ref)) errors.push(`${label} has unknown reference ${ref}`);
  }
}

module.exports = {
  DEFAULT_METHOD_PACK_ID,
  defaultMethodPackPin,
  listMethodPacks,
  loadMethodPack,
  resolveMethodPack,
  validateMethodRegistry,
  validateMethodPack,
};
