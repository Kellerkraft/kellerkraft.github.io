# Kellerkraft — native iOS shell (Capacitor)

Isolierte Capacitor-Hülle. Die **Web-PWA im Repo-Root** (GitHub Pages) bleibt die Quelle der Wahrheit und wird nicht durch dieses Setup ersetzt.

```
Repo-Root  →  GitHub Pages / Browser-PWA   (unverändert)
native/    →  Capacitor iOS Shell          (Kopie nach www/)
```

## Voraussetzungen

- Node.js 20+
- Für iOS-Build: **Mac + Xcode** (dieses Linux-CI-Environment kann die `.ipa` nicht signieren)
- Zum Verteilen an Tester: Apple Developer Program; Solo-USB-Test am eigenen iPhone geht auch mit gratis Apple-ID

## Setup (einmalig auf dem Mac)

```bash
cd native
npm install
npm run sync-web
npm run add:ios    # legt native/ios an (nur auf macOS zuverlässig)
npm run sync:ios
npm run open:ios   # Xcode
```

In Xcode: Team/Signing setzen, Bundle-ID `de.kellerkraft.app`, aufs iPhone deployen.

## Nach Web-Änderungen

```bash
cd native
npm run sync:ios
```

Das kopiert Root → `www/` und sync’t ins Xcode-Projekt. Root-Dateien für Pages bleiben unberührt (außer bewusste Shared-Fixes wie SW-Guard in `js/offline.js`).

## Was nicht hierhin gehört

- Firebase Rules, GitHub Pages, `index.html` im Root als Deploy-Ziel
- `native/www/` ist generiert → nicht von Hand pflegen, liegt in `.gitignore`
