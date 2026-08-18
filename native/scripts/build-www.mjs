/**
 * Website leads → App follows.
 * Copies the GitHub Pages website (repo root) into native/www, then applies
 * native-only patches. Never writes back to the website root.
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const nativeRoot = join(__dirname, "..");
const repoRoot = join(nativeRoot, "..");
const www = join(nativeRoot, "www");

const COPY = ["index.html", "sw.js", "css", "js", "assets"];

if (!existsSync(join(repoRoot, "index.html"))) {
  console.error("[build-www] Missing website index.html at repo root");
  process.exit(1);
}

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

for (const name of COPY) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) {
    console.warn(`[build-www] skip missing: ${name}`);
    continue;
  }
  cpSync(from, join(www, name), { recursive: true });
  console.log(`[build-www] copied ${name}`);
}

/** Native-only: skip Service Worker inside Capacitor (website file untouched). */
function patchOfflineJs() {
  const path = join(www, "js", "offline.js");
  if (!existsSync(path)) return;
  let src = readFileSync(path, "utf8");
  if (src.includes("isCapacitorNative")) return;

  const guard = `
function isCapacitorNative() {
  try {
    return typeof window !== "undefined"
      && window.Capacitor
      && typeof window.Capacitor.isNativePlatform === "function"
      && window.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

`;
  src = src.replace(
    "export async function registerServiceWorker() {\n  if (!(\"serviceWorker\" in navigator)) return null;",
    `${guard}export async function registerServiceWorker() {\n  if (isCapacitorNative()) return null;\n  if (!("serviceWorker" in navigator)) return null;`
  );
  writeFileSync(path, src);
  console.log("[build-www] patched www/js/offline.js (SW skip in Capacitor)");
}

/** Native-only marker on the copied index.html. */
function patchIndexHtml() {
  const path = join(www, "index.html");
  let html = readFileSync(path, "utf8");
  const marker = "<!-- capacitor-native-marker -->";
  if (html.includes(marker)) return;
  const snippet = `${marker}
<script>
(function () {
  function mark() {
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        document.documentElement.classList.add("capacitor-native");
      }
    } catch (e) { /* ignore */ }
  }
  mark();
  document.addEventListener("DOMContentLoaded", mark);
  window.addEventListener("load", mark);
})();
</script>
`;
  html = html.replace("</head>", `${snippet}</head>`);
  writeFileSync(path, html);
  console.log("[build-www] tagged www/index.html");
}

patchOfflineJs();
patchIndexHtml();

writeFileSync(
  join(www, ".generated"),
  "Generated from website (repo root) via scripts/build-www.mjs. Do not edit. Website leads; app follows.\n"
);

console.log("[build-www] website → native/www (app follows)");
