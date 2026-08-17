#!/usr/bin/env node
// Pre-commit guard: blocks accidental commits of .env files or literal API keys/secrets.
// Scans only staged content (git show :<path>), not the working tree, so partially-staged
// edits are checked accurately.
import { execFileSync } from "node:child_process";

const ENV_FILE_PATTERN = /(^|\/)\.env(\..+)?$/;
const ENV_ALLOWED = /(^|\/)\.env\.example$/;

const SECRET_PATTERNS = [
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_\-]{20,}/ },
  { name: "AWS access key ID", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "Private key block", pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: "Slack token", pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  {
    name: "Hardcoded secret assignment",
    pattern: /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{20,}['"]/i,
  },
];

function stagedFiles() {
  const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    encoding: "utf-8",
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function stagedContent(file) {
  try {
    return execFileSync("git", ["show", `:${file}`], { encoding: "utf-8" });
  } catch {
    // Binary files or files git can't render as text — skip content scanning, path check above still applies.
    return null;
  }
}

const files = stagedFiles();
const problems = [];

for (const file of files) {
  if (ENV_FILE_PATTERN.test(file) && !ENV_ALLOWED.test(file)) {
    problems.push(`${file}: committing a .env file — only .env.example should be tracked`);
    continue;
  }

  const content = stagedContent(file);
  if (content == null) continue;

  const lines = content.split("\n");
  for (const { name, pattern } of SECRET_PATTERNS) {
    lines.forEach((line, idx) => {
      if (pattern.test(line)) {
        problems.push(`${file}:${idx + 1}: possible ${name}`);
      }
    });
  }
}

if (problems.length > 0) {
  console.error("\nBLOCKED: possible secret(s) in staged changes:\n");
  problems.forEach((p) => console.error(`  - ${p}`));
  console.error(
    "\nIf this is a false positive, unstage the file or adjust scripts/check-secrets.mjs. " +
      "Otherwise, remove the secret and use an environment variable / secret manager instead.\n"
  );
  process.exit(1);
}
