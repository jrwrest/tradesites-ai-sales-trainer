const { assignNextDrill, buildSkillScores } = require("./skills");

function summarizeHelpAccuracy(helpAttempts = []) {
  const attempts = helpAttempts.length;
  const correct = helpAttempts.filter((attempt) => attempt.correct === true).length;
  return {
    attempts,
    correct,
    accuracy: attempts ? correct / attempts : null,
  };
}

function scoreTranscript({ scenario, turns, helpAttempts = [] }) {
  const repTurns = turns.filter((turn) => turn.role === "user" || turn.speaker === "rep");
  const repText = repTurns.map((turn) => turn.text.toLowerCase()).join(" ");
  const customerText = turns
    .filter((turn) => turn.role === "persona" || turn.speaker === "customer")
    .map((turn) => turn.text.toLowerCase())
    .join(" ");

  const askedQuestions = (repText.match(/\?/g) || []).length;
  const mentionedNextStep =
    /\b(meeting|call|next step|book|schedule|review|audit|tomorrow|today|monday|tuesday|wednesday|thursday|friday)\b/.test(
      repText,
    );
  const handledObjection =
    /\b(understand|understood|fair|makes sense|previous|tried|expensive|send|information|busy|referrals|lead quality)\b/.test(
      repText,
    );
  const discovery =
    /\b(current|today|how do you|what happens|lead|enquir|review|referral|follow.?up|competitor|problem|challenge)\b/.test(
      repText,
    );
  const listened =
    /\b(you mentioned|sounds like|so|because|that means|if i heard you)\b/.test(repText) ||
    repTurns.length >= 3;
  const hardRejection =
    /\b(no requirement|take us off|call list|wasting your time|no use for it|absolutely no use|do not call)\b/.test(
      customerText,
    );

  const opener = Math.min(10, 4 + (repTurns[0]?.text.length > 20 ? 2 : 0) + (repText.includes("quick") ? 1 : 0));
  const discoveryScore = Math.min(10, 2 + askedQuestions * 2 + (discovery ? 3 : 0));
  const objectionScore = hardRejection
    ? handledObjection
      ? 4
      : 2
    : handledObjection
      ? 8
      : customerText.includes("expensive") || customerText.includes("send me")
        ? 3
        : 5;
  const listeningScore = listened ? 7 : 4;
  const closingScore = mentionedNextStep ? 8 : 2;
  const controlScore = Math.min(10, 3 + repTurns.length + (mentionedNextStep ? 2 : 0));

  const categories = {
    opener: opener,
    discovery: discoveryScore,
    listening: listeningScore,
    objectionHandling: objectionScore,
    callControl: controlScore,
    close: closingScore,
  };

  let overall = Math.round(
    Object.values(categories).reduce((total, score) => total + score, 0) /
      Object.keys(categories).length,
  );
  if (hardRejection && !mentionedNextStep) {
    overall = Math.min(overall, 5);
  }

  const missedOpportunities = [];
  if (!discovery) missedOpportunities.push("Ask more about the prospect's current lead flow and follow-up process.");
  if (!handledObjection) missedOpportunities.push("Acknowledge and unpack objections before moving on.");
  if (!mentionedNextStep) missedOpportunities.push("Close with a specific next step instead of leaving the call open-ended.");

  const strengths = [];
  if (askedQuestions >= 2) strengths.push("You asked discovery questions instead of jumping straight into a pitch.");
  if (handledObjection) strengths.push("You attempted to handle resistance in the conversation.");
  if (mentionedNextStep) strengths.push("You pushed toward a concrete next action.");

  const helpAccuracy = summarizeHelpAccuracy(helpAttempts);
  const skillScores = buildSkillScores({ turns, categories });
  const evaluation = {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    overallScore: overall,
    categories,
    helpAccuracy,
    skillScores,
    strengths,
    missedOpportunities,
    recommendedDrill:
      missedOpportunities.length > 0
        ? "Run the same scenario again and focus only on the first missed opportunity."
        : "Increase the difficulty and practise handling sharper objections.",
  };
  evaluation.assignedDrill = assignNextDrill(evaluation);
  return evaluation;
}

module.exports = {
  scoreTranscript,
  summarizeHelpAccuracy,
};
