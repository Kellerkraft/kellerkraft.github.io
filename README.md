# Keller Gym

Single-Page-Trainings-App fuer das Home-Gym im Keller, mit Firebase Realtime Database als Backend.

## Projektstruktur

```
kellerkraft-gym/
├── index.html        Grundgeruest, Navigation, alle Tab-Seiten (HTML)
├── css/
│   └── styles.css    Alle Styles (Design, Layout, Dark/Light Theme)
├── js/
│   ├── app.js         Firebase-Setup, State, Render-Logik, Event-Handler
│   └── data.js        Statische Trainingsdaten (Uebungen, Anleitungen, Level)
└── README.md
```

## Aenderungen vornehmen

- **Neue Uebung hinzufuegen / Anleitung anpassen** → `js/data.js`
- **Aussehen/Farben/Layout aendern** → `css/styles.css`
- **Firebase-Konfiguration aendern** → oberer Teil von `js/app.js`
- **Neue Navigationspunkte / Tab-Seiten** → `index.html` (HTML-Struktur) + `js/app.js` (Render-Funktion + `switchTab`)

## Deployment via GitHub Pages

Siehe Anleitung im Chat. Kurzfassung:
1. Alle Dateien/Ordner 1:1 ins GitHub-Repo hochladen (Struktur beibehalten!)
2. Unter Settings → Pages → Branch "main" → Ordner "/ (root)" auswaehlen
3. Nach jedem Commit aktualisiert sich die Live-Seite automatisch (ca. 1 Minute Wartezeit)
