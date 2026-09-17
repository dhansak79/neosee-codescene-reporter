#!/usr/bin/env node

import { runCli } from "./cli-app.js";

runCli(process.argv.slice(2), process.env).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
