/**
 * Build native/www from native/app (the iOS app's own frontend source).
 * Does NOT read or write the GitHub Pages website at the repo root.
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const nativeRoot = join(__dirname, "..");
const appDir = join(nativeRoot, "app");
const www = join(nativeRoot, "www");

if (!existsSync(join(appDir, "index.html"))) {
  console.error("[build-www] Missing native/app/index.html — app source lives under native/app/");
  process.exit(1);
}

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(appDir, www, { recursive: true });

const indexPath = join(www, "index.html");
let html = readFileSync(indexPath, "utf8");
const marker = "<!-- capacitor-native-marker -->";
if (!html.includes(marker)) {
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
  writeFileSync(indexPath, html);
}

writeFileSync(
  join(www, ".generated"),
  "Generated from native/app via scripts/build-www.mjs — edit native/app, not www.\n"
);

console.log("[build-www] native/app → native/www");
