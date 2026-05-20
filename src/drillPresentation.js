function humanizeSkill(skill) {
  return String(skill || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function describeAssignedDrill(drill) {
  if (!drill || !drill.skill) {
    return {
      title: "No Drill Assigned",
      skillLabel: "Keep practising",
      reason: "This call did not produce a specific weak-skill drill.",
    };
  }

  return {
    title: "Next Drill",
    skillLabel: humanizeSkill(drill.skill),
    reason: drill.reason || "Practise this skill on your next call.",
    nextDueAt: drill.nextDueAt || null,
  };
}

module.exports = {
  describeAssignedDrill,
  humanizeSkill,
};
