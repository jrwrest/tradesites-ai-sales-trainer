#!/usr/bin/env node
const path = require("node:path");
const { verifyBackup } = require("../src/backup");

const backupDir = process.argv[2];
if (!backupDir) {
  console.error("Usage: npm run data:verify -- /absolute/backup/snapshot");
  process.exitCode = 1;
} else {
  verifyBackup({ backupDir: path.resolve(backupDir) })
    .then((result) => {
      console.log(JSON.stringify({ valid: result.valid, files: result.manifest?.files?.length || 0, errors: result.errors }));
      if (!result.valid) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(`Verification failed: ${error.message}`);
      process.exitCode = 1;
    });
}
