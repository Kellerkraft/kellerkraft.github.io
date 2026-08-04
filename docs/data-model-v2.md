# Firebase Datenmodell v2

Schema-Version: **2** · Backend: Firebase Realtime Database (`gym/`) · Auth: anonym (Übergang), später echte Konten (`auth.uid`)

Dieses Dokument definiert das Ziel-Datenmodell und die Rollenrechte. Legacy-Pfade bleiben bis zur Migration lesbar/schreibbar (siehe [Migration](#migration-von-v1)).

---

## Baumübersicht

```
gym/
├── meta/
│   └── schemaVersion                 # number, aktuell 2
├── roles/
│   └── {uid}                         # "owner" | "coach" | "member"
├── users/
│   └── {uid}                         # Profil
├── plans/
│   └── {uid}/
│       └── {planId}                  # Wochen-/Trainingsplan
├── workouts/
│   └── {uid}/
│       ├── templates/
│       │   └── {workoutId}           # gespeicherte Übungsvorlagen
│       └── last                      # letzte Session-Snapshot
├── logs/
│   └── {uid}/
│       └── {exerciseId}/
│           └── {logId}               # Satz-/Übungs-Logs
├── reservations/
│   └── {reservationId}               # geplante Belegungen (ex-schedule)
├── status                            # Live-Check-in (ein Objekt)
├── exercises/
│   └── {exerciseId}                  # Overrides + Custom-Übungen
└── events/
    └── {eventId}                     # Aktivitätsfeed (opt-in)
```

Streaks werden **nicht** persistiert — sie werden aus `logs` abgeleitet (siehe [Streak-Ableitung](#streak-ableitung-aus-logs)).

---

## Domänen-Schemas

### `meta`

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `schemaVersion` | number | ja | Aktuelle Schema-Version (Start: `2`) |

### `roles/{uid}`

| Wert | Bedeutung |
|------|-----------|
| `"owner"` | Gym-Betreiber: volle Admin-Rechte |
| `"coach"` | Trainer: Team lesen, Pläne für Members schreiben, Übungen pflegen |
| `"member"` | Standardnutzer (Default, wenn kein Eintrag) |

Fehlender Eintrag = implizit `member`.

### `users/{uid}` — Profil

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `displayName` | string | ja | Anzeigename (1–40 Zeichen) |
| `avatar` | string | nein | Avatar-Token/Emoji/URL |
| `goal` | string | nein | Trainingsziel (Freitext, max. 200) |
| `favoriteBodies` | string[] | nein | Bevorzugte Körperbereiche (`arme`, `bauch`, `beine`, `brust`, `ruecken`, …) |
| `weekGoal` | number | nein | Ziel-Trainingstage pro Woche (1–7) |
| `createdAt` | number | ja | Epoch ms |
| `updatedAt` | number | ja | Epoch ms |

**MVP-Minimum:** `displayName`, `goal`, `favoriteBodies`, Timestamps.

### `plans/{uid}/{planId}` — Plan-Builder

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `name` | string | ja | Planname |
| `exerciseIds` | string[] | ja | Übungs-IDs (Built-in oder Custom) |
| `days` | number[] | nein | Wochentage `0–6` (So–Sa), optional |
| `blocks` | object[] | nein | Optionale Tagesblöcke (siehe unten) |
| `createdAt` | number | ja | Epoch ms |
| `updatedAt` | number | ja | Epoch ms |

**Block** (`blocks[]`):

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `day` | number | `0–6` |
| `focus` | string | z. B. Push / Pull / Legs / Ganzkörper |
| `note` | string | Freitext |
| `exerciseIds` | string[] | optional, überschreibt Plan-weite Liste für den Tag |

### `workouts/{uid}/templates/{workoutId}`

| Feld | Typ | Pflicht |
|------|-----|---------|
| `name` | string | ja |
| `exerciseIds` | string[] | ja |
| `createdAt` | number | ja |

### `workouts/{uid}/last`

| Feld | Typ | Pflicht |
|------|-----|---------|
| `date` | number | ja |
| `duration` | number | nein |
| `body` | string[] | nein |
| `level` | string | nein |
| `exerciseIds` | string[] | ja |

### `logs/{uid}/{exerciseId}/{logId}`

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `weight` | number | ja | Ø Gewicht |
| `reps` | number | ja | Ø Wiederholungen |
| `minReps` | number | nein | |
| `maxReps` | number | nein | |
| `rir` | number\|null | nein | RIR letzter Satz |
| `date` | number | ja | Epoch ms |
| `exerciseName` | string | nein | Snapshot des Namens |
| `sets` | object[] | nein | `[{ weight, reps, rir }]` |
| `rackSetting` | number\|null | nein | |
| `rackLabel` | string | nein | |

### `reservations/{reservationId}`

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `label` | string | ja | Anzeigename / Notiz |
| `uid` | string | nein | Reservierender (`auth.uid`), sobald Auth gekoppelt |
| `startH` / `startM` | number | ja | Startzeit |
| `endH` / `endM` | number | ja | Endzeit |
| `recurring` | boolean | ja | |
| `day` | number | wenn recurring | `0–6` |
| `date` | string | wenn einmalig | `YYYY-MM-DD` |
| `createdAt` | number | nein | |

### `status` — Live-Check-in

| Feld | Typ | Pflicht |
|------|-----|---------|
| `until` | number | ja (Epoch ms Ende) |
| `name` | string | ja |
| `uid` | string | nein |
| `duration` | number | ja (Minuten) |

### `exercises/{exerciseId}`

**Override** (Built-in editieren):

| Feld | Typ |
|------|-----|
| `name` | string |
| `steps` | string[] |
| `note` | string |
| `media` | `{ type, url }` \| null |

**Custom** (`custom: true`): zusätzlich `body`, `level`, `defMin`, `defMax`, `equip`, optional `rackSetting` / `rackLabel`.

### `events/{eventId}` — Aktivitätsfeed

| Feld | Typ | Pflicht |
|------|-----|---------|
| `type` | string | ja (`workout` \| `pr` \| `streak` \| `plan`) |
| `text` | string | ja |
| `uid` | string | nein |
| `user` | string | nein (Displayname-Snapshot) |
| `ts` | number | ja |

---

## Streak-Ableitung aus `logs`

Kein eigener Persistenzpfad. Berechnung clientseitig:

1. Alle Log-Einträge von `gym/logs/{uid}` laden.
2. Jedes `entry.date` auf Mitternacht lokal normalisieren → Menge der Trainingstage.
3. Tage absteigend sortieren.
4. Streak startet nur, wenn der jüngste Tag **heute** oder **gestern** ist; sonst `0`.
5. Solange aufeinanderfolgende Tage (Diff = 1 Kalendertag) vorliegen, Streak erhöhen.

**Wochenziel:** optional `users/{uid}.weekGoal` gegen Anzahl eindeutiger Trainingstage in der laufenden ISO-Woche prüfen (UI-Badge).

---

## Rollenrechte

| Aktion | member | coach | owner |
|--------|:------:|:-----:|:-----:|
| Eigenes Profil lesen/schreiben | ✓ | ✓ | ✓ |
| Fremdes Profil lesen | ✓ | ✓ | ✓ |
| Fremdes Profil schreiben | — | ✓ | ✓ |
| Eigene Pläne CRUD | ✓ | ✓ | ✓ |
| Fremde Pläne lesen | — | ✓ | ✓ |
| Fremde Pläne schreiben | — | ✓ | ✓ |
| Eigene Logs / Workouts CRUD | ✓ | ✓ | ✓ |
| Fremde Logs lesen | — | ✓ | ✓ |
| Fremde Logs löschen | — | — | ✓ |
| Reservierung anlegen | ✓ | ✓ | ✓ |
| Reservierung löschen (eigene*) | ✓* | ✓ | ✓ |
| Beliebige Reservierung löschen | — | — | ✓ |
| Status (Check-in) setzen/löschen | ✓ | ✓ | ✓ |
| Übungen anlegen/ändern | — | ✓ | ✓ |
| Übungen löschen | — | — | ✓ |
| Events (Feed) schreiben (eigene) | ✓ | ✓ | ✓ |
| Events löschen | — | — | ✓ |
| Rollen vergeben (`roles/{uid}`) | — | — | ✓ |
| Gesamte User-Daten löschen | — | — | ✓ |

\* „Eigene“ Reservierung: `reservations/{id}.uid === auth.uid`. Solange `uid` fehlt (Legacy), dürfen authentifizierte Clients eigene Einträge nur über Owner-Flow löschen — Owner löscht alles.

Regeln sind in [`database.rules.json`](../database.rules.json) kodiert.

---

## Pfad-Konstanten (App)

Maschinenlesbare Pfade und Hilfsfunktionen: [`js/data-model.js`](../js/data-model.js).

Ziel-Pfade für MVP laut Plan:

| Domäne | Pfad |
|--------|------|
| Profil | `gym/users/{uid}` |
| Plan | `gym/plans/{uid}/{planId}` |
| Streak | abgeleitet aus `gym/logs/{uid}` |

---

## Migration von v1

| v1 (aktuell) | v2 |
|--------------|-----|
| `gym/customWorkouts/{name}/__mvp_profile` | `gym/users/{uid}` |
| `gym/customWorkouts/{name}/__mvp_plan` | `gym/plans/{uid}/{planId}` |
| `gym/customWorkouts/{name}/{id}` | `gym/workouts/{uid}/templates/{id}` |
| `gym/customWorkouts/mvp_shared_feed/items` | `gym/events` |
| `gym/lastWorkout/{name}` | `gym/workouts/{uid}/last` |
| `gym/logs/{name}/…` | `gym/logs/{uid}/…` |
| `gym/schedule` | `gym/reservations` |
| `gym/exerciseOverrides` | `gym/exercises` |
| `gym/status` | `gym/status` (+ optional `uid`) |
| Owner-PIN clientseitig | `gym/roles/{uid} = "owner"` |

**Übergangsregeln:**

1. `gym/meta/schemaVersion = 2` setzen, sobald v2-Pfade genutzt werden.
2. Legacy-Pfade (`schedule`, `customWorkouts`, `lastWorkout`, `exerciseOverrides`) bleiben in den Security Rules für `auth != null` schreibbar, bis die App vollständig umgestellt ist.
3. **v2-Schlüssel = `auth.uid`** (auch bei anonymer Anmeldung). `displayName` liegt im Profil-Feld, nicht mehr im Pfad. Legacy-Daten bleiben unter Displayname-Keys lesbar.
4. `gym/logs` teilt sich den Pfad mit v1: Schreibrecht daher vorübergehend `auth != null` (plus Validierung). Nach Umstellung aller Clients auf `auth.uid`-Keys auf `auth.uid === $uid || owner` verschärfen.
5. Ersten `owner` manuell in der Firebase Console setzen: `gym/roles/{uid} = "owner"` (PIN-Owner in der UI bleibt bis dahin nur clientseitig).
6. Regeln deployen: `firebase deploy --only database` (Projekt `kellerkraft-gym`, siehe `firebase.json` / `.firebaserc`).
7. Keine destruktive Löschung von v1-Daten vor erfolgreicher Dual-Read-Phase.

---

## Validierungs-Leitlinien

- Strings: sinnvolle Max-Längen (Name 40, Goal 200, Plan-Name 60, Event-Text 280).
- Arrays: `exerciseIds` max. 40 Einträge; `favoriteBodies` max. 8; `sets` max. 20.
- Zahlen: Gewicht/Reps ≥ 0; Wochentag `0–6`; `weekGoal` `1–7`.
- Schreibende Clients müssen `auth != null` sein (anonyme Anmeldung erfüllt das heute).
