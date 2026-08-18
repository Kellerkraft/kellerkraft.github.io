# Kellerkraft

Single-Page-Trainings-App (PWA) fuer das Home-Gym im Keller, mit Firebase Realtime Database + Auth als Backend.

## Phase 1 (Foundation)

- **Echte Konten:** anonymer Gast + E-Mail/Passwort; Check-in ohne Login, Training nur angemeldet (Logs unter UID)
- **Datenmodell v2:** `gym/users`, `gym/plans`, `gym/events`, `gym/roles`, … — siehe `docs/data-model-v2.md` und `js/data-model.js`
- **Services:** `js/services/*` (Profil, Plaene, Feed, Logs/Streaks, Schema, Rollen)
- **Telemetrie:** lokales Event-/Error-Tracking (`js/telemetry.js`, Debug: `window.__kgTelemetry`)
- **Modul-Split:** Feature-Module statt Monolith
- **Offline-Training (MVP):** Service Worker (`sw.js`) cached die App; Logs/Last-Workout gehen in IndexedDB-Queue (`js/offline.js`) und syncen bei Verbindung. Check-in/Reservierungen brauchen weiterhin Netz.

### Offline nutzen

1. App einmal **online** öffnen und einloggen (Cache + Session aufbauen).
2. Im Keller ohne WLAN: App vom Homescreen / Browser öffnen — Training generieren und loggen.
3. Wieder online: Pending-Einträge werden automatisch synchronisiert.

Nach Schema-/Auth-Aenderungen die Realtime-Database-Rules aus `database.rules.json` in der Firebase Console (oder via CLI) veroeffentlichen. Ohne Deploy greifen Profile/Plaene/Feed ggf. nicht remote (lokaler Fallback bleibt).

In Firebase Auth: **Anonymous** + **E-Mail/Passwort** (Passwort-Anbieter, nicht nur Magic Link). Für Owner-Übersicht aller Trainingsdaten zusätzlich `gym/roles/{deineUid} = "owner"` setzen und `database.rules.json` deployen.

## Projektstruktur

```
├── index.html              Website / PWA — Quelle der Wahrheit
├── css/ / js/ / assets/
├── docs/
└── native/                 iOS-Huelle (uebernimmt Website beim Sync)
    ├── scripts/build-www.mjs
    ├── ios/
    └── www/                generiert aus Website (gitignore)
```

## Aenderungen vornehmen

- **Produkt/UI:** im Repo-Root (Website). Die iOS-App folgt mit `cd native && npm run sync:ios`.
- **Nur iOS-Huelle (Signing, Icons, …):** `native/ios/` — siehe [`native/README.md`](native/README.md)

## Deployment (GitHub Pages)

1. Website-Dateien im Repo-Root belassen
2. Settings → Pages → Branch `main` → `/ (root)`
3. `native/` aendert die ausgelieferte Website nicht

## iPhone-App

Website führt, App folgt: [`native/README.md`](native/README.md).  
Plan TestFlight/Store: [`docs/ios-private-rc-plan.md`](docs/ios-private-rc-plan.md).
