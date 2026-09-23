#!/usr/bin/env node
// Boots the production bundle (dist/server.cjs) the way `npm start` and the Docker image do, and
// checks it actually serves. Type-checking and building both passed while the production server
// crashed on startup (Express 5 rejected a "*" route), because nothing ever started it. Needs no
// API keys and makes no upstream calls. Run after `npm run build`.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";

const BUNDLE = "dist/server.cjs";

if (!existsSync(BUNDLE)) {
  console.error(`${BUNDLE} is missing. Run "npm run build" first.`);
  process.exit(1);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;

// Keys are cleared so the checks behave the same on any machine: no request here should reach
// Gemini, Google or Open-Meteo.
const env = { ...process.env, NODE_ENV: "production", PORT: String(port), VERCEL: "" };
for (const key of ["GEMINI_API_KEY", "GOOGLE_MAPS_PLATFORM_KEY", "GOOGLE_PLACES_SERVER_KEY", "GOOGLE_POLLEN_API_KEY"]) {
  env[key] = "";
}

const server = spawn(process.execPath, [BUNDLE], { env, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
server.stdout.on("data", (chunk) => (output += chunk));
server.stderr.on("data", (chunk) => (output += chunk));

let exited = null;
server.on("exit", (code) => (exited = code));

const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited !== null) return false;
    try {
      await fetch(`${base}/`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return false;
}

try {
  console.log(`Starting ${BUNDLE} on port ${port}…`);
  const up = await waitForServer();
  check("server starts and listens", up, exited !== null ? `exited with code ${exited}` : "timed out");
  if (!up) throw new Error("server did not start");

  const home = await fetch(`${base}/`);
  const homeHtml = await home.text();
  check("GET / serves the app shell", home.status === 200 && homeHtml.includes('<div id="root">'), `status ${home.status}`);
  check("GET / carries the runtime config", homeHtml.includes("window.GOOGLE_MAPS_PLATFORM_KEY"));
  check("responses send nosniff", home.headers.get("x-content-type-options") === "nosniff");
  check("responses don't advertise Express", !home.headers.has("x-powered-by"));

  const deep = await fetch(`${base}/some/deep/link`);
  check("SPA fallback serves deep links", deep.status === 200 && (await deep.text()).includes('<div id="root">'), `status ${deep.status}`);

  const manifest = await fetch(`${base}/manifest.json`);
  check("static files are served", manifest.status === 200, `status ${manifest.status}`);

  const missing = await fetch(`${base}/api/does-not-exist`);
  const missingBody = await missing.json().catch(() => null);
  check("unknown API routes are JSON 404s", missing.status === 404 && typeof missingBody?.error === "string", `status ${missing.status}`);

  // A realistic downscaled photo (~300 KB of base64) must reach the scan route. The default 100 KB
  // body parser used to reject it first, so no real photo ever got there.
  const photo = "data:image/jpeg;base64," + Buffer.alloc(225_000, 7).toString("base64");
  const scan = await fetch(`${base}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: photo }),
  });
  const scanBody = await scan.json().catch(() => null);
  check(
    "a 300 KB photo reaches the scan route",
    scan.status === 503 && scanBody?.code === "vision_unconfigured",
    `status ${scan.status}`
  );
} catch (err) {
  if (!failures.length) failures.push(String(err));
} finally {
  server.kill();
}

if (failures.length > 0) {
  console.error(`\nSmoke test failed (${failures.length}). Server output:\n${output}`);
  process.exit(1);
}
console.log("\nSmoke test passed.");
