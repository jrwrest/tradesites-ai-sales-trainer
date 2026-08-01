#!/usr/bin/env node
const path = require("node:path");
const { restoreBackup } = require("../src/backup");

const [backupDir, targetDir] = process.argv.slice(2);
if (!backupDir || !targetDir) {
  console.error("Usage: npm run data:restore -- /absolute/backup/snapshot /absolute/empty/restore-target");
  process.exitCode = 1;
} else {
  restoreBackup({ backupDir: path.resolve(backupDir), targetDir: path.resolve(targetDir) })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(`Restore failed: ${error.message}`);
      process.exitCode = 1;
    });
}
