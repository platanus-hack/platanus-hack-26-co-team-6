/**
 * PULSO — environment doctor.
 *
 * Answers one question: can `task dev` start all three apps right now?
 *
 * Checks tooling, the ai-core virtualenv, installed dependencies, local env
 * files and the three dev ports. Exits 1 on any FAIL so CI can gate on it;
 * WARN never fails the run, because every app boots with working defaults.
 */

import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WINDOWS = process.platform === "win32";

const FRONTEND = join(ROOT, "apps", "frontend");
const CORE = join(ROOT, "apps", "backend", "core");
const AI_CORE = join(ROOT, "apps", "backend", "ai-core");
const VENV = join(AI_CORE, ".venv");
// uv puts the interpreter in Scripts/ on Windows and bin/ everywhere else.
const VENV_PYTHON = join(VENV, IS_WINDOWS ? "Scripts" : "bin", IS_WINDOWS ? "python.exe" : "python");

const MIN_PYTHON = [3, 12];

const results = [];

function record(level, label, detail) {
  results.push({ level, label, detail });
}

const pass = (label, detail) => record("PASS", label, detail);
const warn = (label, detail) => record("WARN", label, detail);
const fail = (label, detail) => record("FAIL", label, detail);

/** Runs a command and returns its trimmed stdout, or null if it cannot run. */
function capture(command, args, options = {}) {
  const { shell = IS_WINDOWS, ...rest } = options;

  // Windows resolves pnpm/uv through .cmd shims, which need a shell. Node warns
  // (DEP0190) when args are passed alongside shell:true, so collapse them into
  // the command string instead. Only fixed, non-user-supplied args reach here.
  const result = shell
    ? spawnSync([command, ...args].join(" "), { encoding: "utf8", shell: true, ...rest })
    : spawnSync(command, args, { encoding: "utf8", shell: false, ...rest });

  if (result.error || result.status !== 0) return null;
  return String(result.stdout ?? "").trim();
}

/** Resolves true when nothing is listening on the port. */
function isPortFree(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", (error) => {
      resolvePort(error.code !== "EADDRINUSE" && error.code !== "EACCES");
    });
    server.once("listening", () => server.close(() => resolvePort(true)));
    server.listen(port, "127.0.0.1");
  });
}

// ------------------------------------------------------------- tooling ---

function checkTooling() {
  const required = [
    { name: "node", args: ["--version"] },
    { name: "pnpm", args: ["--version"] },
    { name: "uv", args: ["--version"] },
  ];

  for (const { name, args } of required) {
    const version = capture(name, args);
    if (version === null) {
      fail(`tool: ${name}`, `not on PATH — install it before running 'task dev'`);
    } else {
      pass(`tool: ${name}`, version.split("\n")[0]);
    }
  }
}

// -------------------------------------------------------------- venv ---

function checkVenv() {
  if (!existsSync(VENV)) {
    fail("ai-core venv", "apps/backend/ai-core/.venv missing — run 'task setup'");
    return false;
  }
  if (!existsSync(VENV_PYTHON)) {
    fail("ai-core venv", `interpreter missing at ${VENV_PYTHON} — run 'task setup'`);
    return false;
  }

  const version = capture(VENV_PYTHON, ["--version"], { shell: false });
  if (version === null) {
    fail("ai-core venv", "interpreter present but will not execute — delete .venv and run 'task setup'");
    return false;
  }

  const parsed = version.match(/(\d+)\.(\d+)/);
  const major = parsed ? Number(parsed[1]) : 0;
  const minor = parsed ? Number(parsed[2]) : 0;
  const tooOld = major < MIN_PYTHON[0] || (major === MIN_PYTHON[0] && minor < MIN_PYTHON[1]);

  if (tooOld) {
    fail("ai-core venv", `${version} — pyproject requires >=${MIN_PYTHON.join(".")}`);
    return false;
  }

  pass("ai-core venv", `${version} at .venv`);

  // A *different* venv activated in the shell is the nastiest case: uv still
  // uses .venv, but anything run by hand (python, pytest) silently uses the
  // other one, and the two disagree about what is installed.
  const active = process.env.VIRTUAL_ENV;
  if (!active) {
    // uv run activates .venv per command, so no shell activation is required.
    pass("ai-core venv activation", "no shell venv active — 'uv run' handles it");
  } else if (resolve(active) === resolve(VENV)) {
    pass("ai-core venv activation", "project .venv is active in this shell");
  } else {
    warn("ai-core venv activation", `a different venv is active: ${active} — deactivate it or use 'uv run'`);
  }

  // A venv that exists but cannot import its own runtime is the failure mode
  // that actually bites: uv sync half-ran, or someone deleted site-packages.
  const imported = capture(VENV_PYTHON, ["-c", "import fastapi, uvicorn"], { shell: false });
  if (imported === null) {
    fail("ai-core deps", "fastapi/uvicorn not importable — run 'task setup:ai-core'");
    return false;
  }
  pass("ai-core deps", "fastapi and uvicorn importable");
  return true;
}

// ------------------------------------------------------- node packages ---

function checkNodeDeps(label, appDir, sentinel) {
  const modules = join(appDir, "node_modules");
  if (!existsSync(modules)) {
    fail(label, `node_modules missing — run 'task setup'`);
    return;
  }
  if (!existsSync(join(modules, ...sentinel.split("/")))) {
    fail(label, `${sentinel} not installed — run 'task setup'`);
    return;
  }
  pass(label, `node_modules present (${sentinel} found)`);
}

// ---------------------------------------------------------- env files ---

function checkEnvFiles() {
  const files = [
    { label: "env: frontend", path: join(FRONTEND, ".env.local") },
    { label: "env: core", path: join(CORE, ".env") },
    { label: "env: ai-core", path: join(AI_CORE, ".env") },
  ];

  for (const { label, path } of files) {
    if (existsSync(path)) {
      pass(label, "present");
    } else {
      // Not fatal on purpose: every service has working defaults in code.
      warn(label, "missing — run 'task setup:env' (apps still boot on defaults)");
    }
  }
}

function checkMigrationEnv() {
  const envPath = join(CORE, ".env");
  let dbUrl = process.env.SUPABASE_DB_URL?.trim();

  if (!dbUrl && existsSync(envPath)) {
    const match = readFileSync(envPath, "utf8").match(
      /^\s*(?:export\s+)?SUPABASE_DB_URL\s*=\s*(.*)\s*$/m,
    );
    dbUrl = match?.[1]?.trim().replace(/^(['"])(.*)\1$/, "$2");
  }

  if (dbUrl) {
    pass("env: SUPABASE_DB_URL", "defined for migration commands");
  } else {
    warn(
      "env: SUPABASE_DB_URL",
      "missing — core can boot, but 'task migrate*' requires a direct/session port 5432 URL",
    );
  }
}

// -------------------------------------------------------------- ports ---

async function checkPorts() {
  // Taskfile passes these so doctor and dev can never disagree about the ports.
  const ports = [
    { app: "frontend", port: Number(process.env.PORT_FRONTEND ?? 3000) },
    { app: "core", port: Number(process.env.PORT_CORE ?? 3001) },
    { app: "ai-core", port: Number(process.env.PORT_AI_CORE ?? 8000) },
  ].map(({ app, port }) => ({ label: `port ${port} (${app})`, port }));

  for (const { label, port } of ports) {
    if (await isPortFree(port)) {
      pass(label, "free");
    } else {
      fail(label, "already in use — stop whatever is listening, or override the port in .env");
    }
  }
}

// ------------------------------------------------------------- report ---

function report() {
  const icon = { PASS: "PASS", WARN: "WARN", FAIL: "FAIL" };
  const width = Math.max(...results.map((r) => r.label.length));

  console.log("\nPULSO doctor\n");
  for (const { level, label, detail } of results) {
    console.log(`  [${icon[level]}] ${label.padEnd(width)}  ${detail}`);
  }

  const failed = results.filter((r) => r.level === "FAIL").length;
  const warned = results.filter((r) => r.level === "WARN").length;

  console.log("");
  if (failed > 0) {
    console.log(`${failed} problem(s) block 'task dev'. Fix them, then run 'task doctor' again.`);
    process.exitCode = 1;
    return;
  }
  console.log(
    warned > 0
      ? `Ready for 'task dev'. ${warned} warning(s) above are safe to ignore for a local demo.`
      : "Everything checks out. Run 'task dev'.",
  );
}

// Read the frontend's declared package manager so a mismatched pnpm is caught
// before it produces a confusing lockfile error mid-install.
function checkPackageManager() {
  const manifest = join(FRONTEND, "package.json");
  if (!existsSync(manifest)) {
    fail("frontend app", "apps/frontend/package.json missing");
    return;
  }
  const declared = JSON.parse(readFileSync(manifest, "utf8")).packageManager;
  if (!declared) return;

  const [name, wanted] = declared.split("@");
  const actual = capture(name, ["--version"]);
  if (actual && wanted && actual.split(".")[0] !== wanted.split(".")[0]) {
    warn(`packageManager`, `${name} ${actual} installed, ${declared} declared`);
  }
}

checkTooling();
checkPackageManager();
checkNodeDeps("frontend deps", FRONTEND, "next");
checkNodeDeps("core deps", CORE, "@nestjs/core");
checkVenv();
checkEnvFiles();
checkMigrationEnv();
await checkPorts();
report();
