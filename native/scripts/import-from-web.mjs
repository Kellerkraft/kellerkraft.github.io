/**
 * OPTIONAL one-shot: copy current website (repo root) into native/app.
 * Use only when you explicitly want to refresh the app baseline from the web.
 * Does not change the website. Overwrites native/app.
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const nativeRoot = join(__dirname, "..");
const repoRoot = join(nativeRoot, "..");
const appDir = join(nativeRoot, "app");

const COPY = ["index.html", "sw.js", "css", "js", "assets"];

if (!existsSync(join(repoRoot, "index.html"))) {
  console.error("[import-from-web] Repo root has no index.html");
  process.exit(1);
}

const force = process.argv.includes("--force");
if (existsSync(join(appDir, "index.html")) && !force) {
  console.error("[import-from-web] native/app already exists. Pass --force to overwrite.");
  process.exit(1);
}

rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });

for (const name of COPY) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) {
    console.warn(`[import-from-web] skip missing: ${name}`);
    continue;
  }
  cpSync(from, join(appDir, name), { recursive: true });
  console.log(`[import-from-web] copied ${name}`);
}

writeFileSync(
  join(appDir, "APP_SOURCE.md"),
  `# Native app frontend source

This folder is the **iOS app** UI/logic source. It is separate from the GitHub Pages website at the repo root.

- Edit files here for the app.
- Website edits go in the repo root (\`index.html\`, \`js/\`, …).
- Optional refresh from web: \`npm run import-from-web -- --force\` (overwrites this tree).
`
);

console.log("[import-from-web] done → native/app (website unchanged)");
console.log("[import-from-web] Re-apply native-only tweaks (e.g. SW skip) if needed.");
