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
  return {
    ...suggestion,
    methodMetadata: {
      id: methodPack.manifest.id,
      version: methodPack.manifest.version,
      displayName: methodPack.manifest.displayName,
      frameworkLabel: framework.label,
    },
    methodPrompt: technique.prompt,
    suggestions: [
      ...(technique.guidance || []),
      ...(suggestion.suggestions || []),
    ],
    tryThis: renderCoachingTemplate(suggestion.tryThis || technique.template, profile, methodPack),
  };
}

module.exports = {
  applyMethodCoaching,
  renderCoachingTemplate,
};
