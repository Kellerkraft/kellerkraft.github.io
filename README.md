# Keller Gym

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
├── index.html
├── css/styles.css
├── database.rules.json
├── docs/data-model-v2.md
├── assets/                 PWA-Icons, Body-Icons, Uebungsmedien
└── js/
    ├── app.js              Orchestrator (Boot, Home/Check-in, Nav)
    ├── firebase.js         Firebase App / DB / Auth
    ├── auth.js / auth-ui.js
    ├── telemetry.js
    ├── growth.js           Profil, Wochenziel-Auszeichnung, Streaks, Feed-UI
    ├── reservations.js
    ├── exercises.js
    ├── training.js
    ├── ui.js / state.js
    ├── data.js / data-model.js
    └── services/           users, plans, events, logs, roles, schema
```

## Aenderungen vornehmen

- **Neue Uebung / Anleitung** → `js/data.js`
- **Aussehen** → `css/styles.css`
- **Firebase-Config** → `js/firebase.js`
- **Auth-Flows** → `js/auth.js` + `js/auth-ui.js`
- **Profil/Plan/Feed** → `js/growth.js` + `js/services/*`
- **Neue Tabs** → `index.html` + `js/app.js` (`switchTab`)

## Deployment (GitHub Pages)

1. Dateien im Repo-Root belassen (Struktur wie oben)
2. Settings → Pages → Branch `main` → `/ (root)`
3. Nach Commit aktualisiert sich die Live-Seite automatisch
