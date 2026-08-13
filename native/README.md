# Kellerkraft iOS App (separat von der Website)

Die **Website** (Repo-Root → GitHub Pages) bleibt eine eigenständige Web-PWA.  
Die **App** wird hier unter `native/` in Schritten separat weiterentwickelt.

```
Repo-Root/          ← Website only (nicht von native/ anfassen)
native/
  app/              ← App-Frontend (eigene Quelle, committed)
  www/              ← Build-Output aus app/ (gitignore)
  ios/              ← Xcode / Capacitor
  scripts/          ← build-www, optional import-from-web
```

## Entwicklungsregel

| Ziel | Ort |
|------|-----|
| Website / PWA | Repo-Root (`index.html`, `js/`, `css/`, …) |
| iOS-App | `native/app/` + `native/ios/` |

Kein automatischer Sync Website → App. Ein Import ist nur bewusst und optional:

```bash
cd native && npm run import-from-web -- --force
```

## Schritte (App separat)

### Schritt 1 — Shell lokal starten (jetzt möglich)
Voraussetzung: Mac + Xcode. Solo-USB-Test ohne bezahlten Developer-Account möglich.

```bash
cd native
npm install
npm run sync:ios
npm run open:ios
```

In Xcode: Signing Team wählen, Bundle-ID `de.kellerkraft.app`, aufs iPhone deployen.

### Schritt 2 — App-UI/Flows nur in `native/app` härten
Safe Area, Login, Training, Offline (ohne Service Worker in Capacitor — Guard liegt nur in `native/app/js/offline.js`).  
Website-Code im Root bleibt unberührt.

Nach jeder App-Änderung:

```bash
npm run sync:ios
```

### Schritt 3 — Offline/Assets für die App
CDN (Firebase, Chart.js) in der App lokal vendoring — eigener Schritt, nur unter `native/app`.

### Schritt 4 — Privater TestFlight
Apple Developer Program (~99 $/Jahr), Archive → TestFlight Internal für die Keller-Gruppe.

### Schritt 5 — Später öffentlicher App Store
Account-Löschung, Privacy-URL, Screenshots — siehe `docs/ios-private-rc-plan.md`.

## Was die Website nicht merkt

- Kein Deploy aus `native/`
- Root-`index.html` / Root-`js/` werden von Capacitor-Skripten **nicht** geschrieben
- GitHub Pages weiter Branch `main` → `/ (root)`
