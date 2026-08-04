/**
 * Schema bootstrap — ensure gym/meta/schemaVersion is set.
 */
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "../firebase.js";
import { Paths, SCHEMA_VERSION } from "../data-model.js";
import { trackEvent, trackError } from "../telemetry.js";

export async function ensureSchemaVersion() {
  try {
    const versionRef = ref(db, Paths.schemaVersion());
    const snap = await get(versionRef);
    const current = snap.val();
    if (current === SCHEMA_VERSION) return current;
    if (current == null || Number(current) < SCHEMA_VERSION) {
      await set(versionRef, SCHEMA_VERSION);
      trackEvent("schema_version_set", { from: current, to: SCHEMA_VERSION });
      return SCHEMA_VERSION;
    }
    return current;
  } catch (err) {
    // Non-owners may not write meta — that's fine if already set by owner.
    trackError(err, { source: "schema.ensure" });
    return null;
  }
}
