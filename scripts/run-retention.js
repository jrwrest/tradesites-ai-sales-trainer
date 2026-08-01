#!/usr/bin/env node
const { runRetention } = require("../src/retention");

runRetention()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(`Retention failed: ${error.message}`);
    process.exitCode = 1;
  });
