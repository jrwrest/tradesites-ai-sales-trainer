#!/usr/bin/env node

import { spawn } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", async () => {
  const payload = JSON.parse(input || "{}");
  const prompt = [
    "You are the customer in a cold-call training simulation.",
    "Return only strict JSON with this shape: {\"reply\":\"short spoken customer response\",\"mood\":\"short mood\"}.",
    "Do not include markdown.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");

  const args = ["exec", "--ephemeral", "--skip-git-repo-check"];
  if (process.env.CODEX_MODEL) {
    args.push("--model", process.env.CODEX_MODEL);
  }
  args.push(prompt);

  const child = spawn("codex", args, {
    stdio: ["ignore", "pipe", "inherit"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.on("close", (code) => {
    if (code !== 0) {
      process.exit(code || 1);
    }
    const json = extractJson(output.trim());
    if (!json) {
      process.stdout.write(JSON.stringify({ reply: output.trim().slice(0, 1000), mood: "unknown" }));
      return;
    }
    process.stdout.write(json);
  });
});

function extractJson(text) {
  if (!text) return null;
  try {
    JSON.parse(text);
    return text;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const candidate = text.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      return null;
    }
  }
}
