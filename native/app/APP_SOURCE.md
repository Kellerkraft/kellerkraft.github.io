# Native app frontend source

Dieser Ordner ist die **eigene** UI/Logik-Quelle der iOS-App.  
Die Website liegt unverändert im **Repo-Root** (`index.html`, `js/`, …) und wird hiervon nicht überschrieben.

- App-Änderungen → hier unter `native/app/`
- Website-Änderungen → Repo-Root
- Optionaler Reset von der Web-Baseline: `npm run import-from-web -- --force` (überschreibt nur `native/app`)
