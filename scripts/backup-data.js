#!/usr/bin/env node
const path = require("node:path");
const { createBackup } = require("../src/backup");
const { getDataDir } = require("../src/store");

const backupRoot = process.argv[2] || process.env.BACKUP_ROOT;
if (!backupRoot) {
  console.error("Usage: npm run data:backup -- /absolute/backup/root");
  process.exitCode = 1;
} else {
  createBackup({ dataDir: getDataDir(), backupRoot: path.resolve(backupRoot) })
    .then((result) => console.log(JSON.stringify({ backupDir: result.backupDir, files: result.manifest.files.length })))
    .catch((error) => {
      console.error(`Backup failed: ${error.message}`);
      process.exitCode = 1;
    });
}
