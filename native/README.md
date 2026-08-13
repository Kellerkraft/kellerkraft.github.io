# Kellerkraft iOS App — Website führt, App folgt

Für die nächste Zeit: **Änderungen machst du an der Website** (Repo-Root).  
Die iOS-App übernimmt sie beim Sync in die Capacitor-Hülle. Die Website wird dabei nicht überschrieben.

```
Website (Repo-Root)  ──build-www──►  native/www  ──cap sync──►  iOS-App
     ↑ führt                              ↑ Kopie + native Patches
```

| Was | Wo |
|-----|-----|
| Features, UI, Training, Auth | Repo-Root (`index.html`, `js/`, `css/`, …) |
| iOS-Hülle, Bundle-ID, Xcode | `native/ios/` |
| Generierte App-Kopie | `native/www/` (nicht von Hand editieren) |

## Workflow nach Website-Änderungen

Auf dem Mac:

```bash
cd native
npm run sync:ios
# optional: npm run open:ios
```

Damit liegt der aktuelle Website-Stand in der App (plus kleine native-only Patches, z. B. kein Service Worker in Capacitor).

## Erstes Öffnen in Xcode

```bash
cd native
npm install
npm run sync:ios
npm run open:ios
```

Signing Team setzen → aufs iPhone deployen (USB; gratis Apple-ID reicht für Solo-Tests).

## Später: App wieder separat

Wenn Store-Anforderungen (Account-Löschung, anderes Offline, …) die App von der Website wegbiegen sollen, kann `native/app` als eigener Quellbaum wieder eingeführt werden. Bis dahin bleibt: **eine Quelle = Website**.
