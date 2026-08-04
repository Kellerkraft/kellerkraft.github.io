/**
 * Roles service — read gym/roles/{uid}, map to owner/coach/member.
 */
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "../firebase.js";
import { Paths, effectiveRole, can, ROLES } from "../data-model.js";
import { trackError } from "../telemetry.js";

export { ROLES, can, effectiveRole };

export async function loadUserRole(uid) {
  if (!uid) return ROLES.MEMBER;
  try {
    const snap = await get(ref(db, Paths.role(uid)));
    return effectiveRole(snap.val());
  } catch (err) {
    trackError(err, { source: "roles.load" });
    return ROLES.MEMBER;
  }
}

export function isOwnerRole(role) {
  return effectiveRole(role) === ROLES.OWNER;
}
