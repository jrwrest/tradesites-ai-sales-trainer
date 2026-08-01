const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_METHOD_PACK_ID = "hormozi-sales-2026";
const METHOD_PACKS_DIR = path.join(__dirname, "..", "method-packs");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadMethodPack(id = DEFAULT_METHOD_PACK_ID) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error("Invalid method pack id");
  }
  const packDir = path.join(METHOD_PACKS_DIR, id);
  if (!fs.existsSync(packDir) || !fs.statSync(packDir).isDirectory()) {
    throw new Error(`Unknown method pack: ${id}`);
  }
  const pack = {
    manifest: readJson(path.join(packDir, "manifest.json")),
    framework: readJson(path.join(packDir, "framework.json")),
    rubric: readJson(path.join(packDir, "rubric.json")),
    drills: readJson(path.join(packDir, "drills.json")),
  };
  const validation = validateMethodPack(pack);
  if (!validation.valid) {
    throw new Error(`Invalid method pack ${id}: ${validation.errors.join("; ")}`);
  }
  return pack;
}

function validateMethodPack(pack) {
  const errors = [];
  const manifest = pack && pack.manifest;
  const framework = pack && pack.framework;
  const rubric = pack && pack.rubric;
  const drills = pack && pack.drills;
  if (!manifest || !framework || !rubric || !drills) {
    return { valid: false, errors: ["manifest, framework, rubric, and drills are required"] };
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
  loadMethodPack,
  validateMethodPack,
};
