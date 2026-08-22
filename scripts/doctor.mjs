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

// ----------------------------------------------------------- security ---

/** Reads KEY=value pairs out of a .env file. Returns {} when it is not there. */
function readEnv(path) {
  if (!existsSync(path)) return {};

  const pairs = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    // trim() also drops the trailing \r of a CRLF file, so this handles both.
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (value) pairs[trimmed.slice(0, eq).trim()] = value;
  }
  return pairs;
}

/**
 * core serves raw clinical dictation and patient pickup coordinates, and the
 * Telegram webhook forces it onto the public internet. These checks exist so a
 * misconfiguration surfaces here instead of during the demo.
 */
function checkSecurity() {
  const env = readEnv(join(CORE, ".env"));

  if (env.OPERADOR_PASSWORD) {
    pass("auth: operator password", "set");
  } else {
    // Not fatal: core generates one and prints it. Just annoying to hunt for.
    warn("auth: operator password", "OPERADOR_PASSWORD unset — core prints a random one on boot");
  }

  if (!env.SESION_SECRET) {
    warn("auth: session secret", "SESION_SECRET unset — sessions die on every restart");
  } else if (env.SESION_SECRET.length < 16) {
    warn("auth: session secret", "SESION_SECRET under 16 chars — ignored, a random one is used");
  } else {
    pass("auth: session secret", "set");
  }

  // The one that breaks a demo silently: with a bot token but no webhook
  // secret, core rejects every update and the Telegram buttons do nothing.
  if (!env.TELEGRAM_BOT_TOKEN) {
    pass("auth: telegram webhook", "no bot token — webhook not in use");
  } else if (env.TELEGRAM_WEBHOOK_SECRET) {
    pass("auth: telegram webhook", "secret set — must match setWebhook(secret_token=...)");
  } else {
    fail(
      "auth: telegram webhook",
      "TELEGRAM_BOT_TOKEN set but TELEGRAM_WEBHOOK_SECRET missing — core rejects every update",
    );
  }

  if (env.CORS_ORIGIN === "*") {
    fail("auth: CORS_ORIGIN", "'*' cannot carry session cookies — set the exact frontend origin");
  }
}

// --------------------------------------------------------------- data ---

/**
 * core importa dos archivos que genera `task datos`. Si faltan, el build de
 * core no compila y el error apunta a un import roto, no a la causa real.
 */
function checkData() {
  const generados = [
    { label: "data: catalogo de sedes", path: join(CORE, "src", "sedes", "catalogo.generado.ts") },
    { label: "data: curva de demanda", path: join(CORE, "src", "scoring", "demanda.generada.ts") },
  ];

  for (const { label, path } of generados) {
    if (existsSync(path)) {
      pass(label, "generado");
    } else {
      fail(label, "falta — corre 'task datos' (core no compila sin esto)");
    }
  }

  const reporte = join(ROOT, "data", "procesado", "reporte.json");
  if (!existsSync(reporte)) {
    warn("data: pipeline", "sin correr todavia — 'task datos'");
    return;
  }

  try {
    const { _fallidos = [], _generado } = JSON.parse(readFileSync(reporte, "utf8"));
    if (_fallidos.length) {
      fail("data: pipeline", `fallaron ${_fallidos.length} paso(s): ${_fallidos.join(", ")}`);
    } else {
      pass("data: pipeline", `ultima corrida ${String(_generado).slice(0, 16)}`);
    }
  } catch {
    warn("data: pipeline", "reporte.json ilegible — vuelve a correr 'task datos'");
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
checkSecurity();
checkData();
await checkPorts();
report();
