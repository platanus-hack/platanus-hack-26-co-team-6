/**
 * Creates the local env files from their committed examples.
 *
 * Node instead of `cp` because the team runs this from PowerShell, cmd and
 * Git Bash, and only Node behaves identically in all three.
 *
 * Never overwrites an existing file: a real .env holds real credentials.
 */

import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Each app owns its own example. The frontend example holds only NEXT_PUBLIC_*
// keys: server credentials belong in core/.env and must never reach the bundle.
const COPIES = [
  { from: "apps/frontend/env.example", to: "apps/frontend/.env.local" },
  { from: "apps/backend/core/env.example", to: "apps/backend/core/.env" },
  { from: "apps/backend/ai-core/env.example", to: "apps/backend/ai-core/.env" },
];

let created = 0;

for (const { from, to } of COPIES) {
  const source = resolve(ROOT, from);
  const target = resolve(ROOT, to);

  if (!existsSync(source)) {
    console.warn(`skip  ${to}  (missing example: ${from})`);
    continue;
  }
  if (existsSync(target)) {
    console.log(`keep  ${to}  (already exists)`);
    continue;
  }

  copyFileSync(source, target);
  console.log(`new   ${to}`);
  created += 1;
}

console.log(
  created === 0
    ? "\nEnv files already in place."
    : `\n${created} env file(s) created. Fill in the credentials you have; every value has a working default.`,
);
