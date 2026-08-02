function renderCoachingTemplate(text, profile = {}, methodPack) {
  const allowed = new Set(methodPack.coaching.allowedTemplateTokens || []);
  const values = {
    repName: String(profile.repName || "the rep").trim().slice(0, 120),
    companyName: String(profile.companyName || "their company").trim().slice(0, 160),
  };
  return String(text || "").replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_match, token) => {
    if (!allowed.has(token) || !(token in values)) {
      const error = new Error(`Unapproved coaching template token: ${token}`);
      error.code = "METHOD_PACK_INVALID";
      throw error;
    }
    return values[token];
  });
}

function applyMethodCoaching({ suggestion, methodPack, profile = {} }) {
  if (methodPack.coaching.mode === "legacy_passthrough") return suggestion;
  const frameworkId = (suggestion.objectionId
    ? methodPack.coaching.frameworkByMove?.[suggestion.recommendedMove]
    : null)
    || methodPack.coaching.frameworkByStage[suggestion.stage]
    || methodPack.coaching.frameworkByStage.discovery;
  const framework = methodPack.framework.frameworks.find((item) => item.id === frameworkId);
  const technique = methodPack.coaching.techniques[frameworkId];
  if (!framework || !technique) {
    const error = new Error(`Missing coaching technique for ${suggestion.stage}`);
    error.code = "METHOD_PACK_INVALID";
    throw error;
  }
  const methodTemplate = suggestion.terminal && technique.exitTemplate
    ? technique.exitTemplate
    : technique.template;
  const methodGuidance = [...(technique.guidance || [])];
  const situationGuidance = Object.values(suggestion.industryFacts || {})
    .filter((value) => typeof value === "string" && value.trim());
  const methodExample = renderCoachingTemplate(methodTemplate, profile, methodPack);
  return {
    ...suggestion,
    methodMetadata: {
      id: methodPack.manifest.id,
      version: methodPack.manifest.version,
      displayName: methodPack.manifest.displayName,
      frameworkLabel: framework.label,
    },
    methodPrompt: technique.prompt,
    methodGuidance,
    situationGuidance,
    methodExample,
    situationExample: null,
    suggestions: [...methodGuidance, ...situationGuidance],
    tryThis: methodExample,
  };
}

module.exports = {
  applyMethodCoaching,
  renderCoachingTemplate,
};
