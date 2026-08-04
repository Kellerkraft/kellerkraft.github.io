import { ref, get, set, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "./firebase.js";
import { EXERCISE_INSTRUCTIONS, EXERCISES, EXERCISE_MEDIA, BODY_LABELS, LEVEL_LABELS, LEVEL_ORDER, LEVEL_DESC } from "./data.js";
import { showToast, escapeAttr as uiEscapeAttr } from "./ui.js";

export function createExercisesModule(ctx = {}) {
  const ownerPin = ctx.ownerPin || "";

  function getIsOwner() {
    return !!ctx.getIsOwner?.();
  }

  function setIsOwner(value) {
    ctx.setIsOwner?.(!!value);
  }

  function updateOwnerUI() {
    ctx.updateOwnerUI?.();
  }

  function levelsUpTo(level) {
    const idx = LEVEL_ORDER.indexOf(level);
    return LEVEL_ORDER.slice(0, idx + 1);
  }

  /* ================= ÜBUNGEN-SEITE (dynamisch, mit Bearbeitung) ================= */

  function exerciseOverrideRef(exId) { return ref(db, `gym/exerciseOverrides/${exId}`); }

  let customExercises = {}; // id -> exercise object from Firebase (custom: true)

  async function loadCustomExercises() {
    try {
      const snap = await get(ref(db, "gym/exerciseOverrides"));
      const all = snap.val() || {};
      customExercises = {};
      Object.entries(all).forEach(([id, val]) => {
        if (val && val.custom && val.body) {
          customExercises[id] = {
            id,
            name: val.name,
            body: val.body,
            level: val.level || "easy",
            defMin: val.defMin ?? 8,
            defMax: val.defMax ?? 12,
            equip: val.equip || ["custom"],
            steps: val.steps || [],
            note: val.note || null,
            rackSetting: !!val.rackSetting,
            rackLabel: val.rackLabel || null,
            custom: true,
            media: val.media || null
          };
        }
      });
    } catch (err) {
      customExercises = {};
      showToast("Eigene Übungen konnten nicht geladen werden.", "error");
    }
    return customExercises;
  }

  async function getExerciseOverrides() {
    try {
      const snap = await get(ref(db, "gym/exerciseOverrides"));
      return snap.val() || {};
    } catch (err) {
      showToast("Übungs-Änderungen konnten nicht geladen werden.", "error");
      return {};
    }
  }

  async function saveExerciseOverride(exId, override) {
    try {
      await set(exerciseOverrideRef(exId), override);
      showToast("Übung aktualisiert.", "success", 2000);
      return true;
    } catch (err) {
      showToast("Speichern fehlgeschlagen.", "error");
      return false;
    }
  }

  async function saveCustomExercise(ex) {
    try {
      const payload = {
        custom: true,
        name: ex.name,
        body: ex.body,
        level: ex.level,
        defMin: ex.defMin,
        defMax: ex.defMax,
        equip: ex.equip || ["custom"],
        steps: ex.steps || [],
        note: ex.note || null
      };
      if (ex.media) payload.media = ex.media;
      else if (ex.media === null) payload.media = null;
      await set(exerciseOverrideRef(ex.id), payload);
      customExercises[ex.id] = { id: ex.id, ...payload };
      showToast("Übung hinzugefügt.", "success", 2000);
      return true;
    } catch (err) {
      showToast("Speichern fehlgeschlagen.", "error");
      return false;
    }
  }

  async function deleteCustomExercise(exId) {
    try {
      await remove(exerciseOverrideRef(exId));
      delete customExercises[exId];
      showToast("Übung gelöscht.", "success", 2000);
      return true;
    } catch (err) {
      showToast("Löschen fehlgeschlagen.", "error");
      return false;
    }
  }

  function getAllExercises() {
    const staticIds = new Set(EXERCISES.map(e => e.id));
    const customs = Object.values(customExercises).filter(e => e && e.id && !staticIds.has(e.id));
    return [...EXERCISES, ...customs];
  }

  function findExercise(id) {
    return getAllExercises().find(e => e.id === id) || null;
  }

  function getExerciseMedia(ex, overrides = {}) {
    const o = overrides[ex.id] || {};
    if (o.media && o.media.url) return o.media;
    if (EXERCISE_MEDIA[ex.id]) return EXERCISE_MEDIA[ex.id];
    return { type: "auto", url: `./assets/exercises/${ex.id}` };
  }

  function youtubeEmbedId(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
      return u.searchParams.get("v");
    } catch {
      return null;
    }
  }

  function renderExerciseMediaHtml(ex, overrides = {}, { compact = false } = {}) {
    const media = getExerciseMedia(ex, overrides);
    if (!media) return "";
    const vCls = compact ? "exercise-media-video exercise-media-video--compact" : "exercise-media-video";
    const iCls = compact ? "exercise-media-gif exercise-media-video--compact" : "exercise-media-gif";
    if (media.type === "youtube") {
      const vid = youtubeEmbedId(media.url);
      if (!vid) return "";
      return `<div class="exercise-media-yt"><iframe src="https://www.youtube-nocookie.com/embed/${vid}?rel=0" title="${escapeAttr(ex.name)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    if (media.type === "gif") {
      return `<img class="${iCls}" src="${escapeAttr(media.url)}" alt="Demo: ${escapeAttr(ex.name)}" loading="lazy">`;
    }
    if (media.type === "mp4" || media.type === "video") {
      return `<video class="${vCls}" src="${escapeAttr(media.url)}" loop muted playsinline autoplay preload="metadata"></video>`;
    }
    const base = escapeAttr(media.url);
    return `<span class="exercise-media--auto" data-exid="${escapeAttr(ex.id)}" hidden>
      <video class="${vCls}" src="${base}.mp4" loop muted playsinline autoplay preload="metadata"></video>
      <img class="exercise-media-gif" src="${base}.gif" alt="Demo: ${escapeAttr(ex.name)}" loading="lazy" hidden>
    </span>`;
  }

  function renderExerciseThumbHtml(ex, overrides = {}) {
    const media = getExerciseMedia(ex, overrides);
    if (!media) return `<span class="exercise-thumb exercise-thumb--empty" aria-hidden="true"></span>`;
    if (media.type === "youtube") {
      return `<span class="exercise-thumb exercise-thumb--yt" aria-hidden="true">▶</span>`;
    }
    if (media.type === "gif") {
      return `<img class="exercise-thumb" src="${escapeAttr(media.url)}" alt="" loading="lazy">`;
    }
    if (media.type === "mp4" || media.type === "video") {
      return `<video class="exercise-thumb" src="${escapeAttr(media.url)}" muted playsinline preload="metadata"></video>`;
    }
    const base = escapeAttr(media.url);
    return `<span class="exercise-thumb-wrap exercise-thumb--auto" data-exid="${escapeAttr(ex.id)}" hidden>
      <video class="exercise-thumb" src="${base}.mp4" muted playsinline preload="metadata"></video>
      <img class="exercise-thumb" src="${base}.gif" alt="" loading="lazy" hidden>
    </span>`;
  }

  function initExerciseThumbFallbacks(root = document) {
    root.querySelectorAll(".exercise-thumb--auto").forEach(wrap => {
      const video = wrap.querySelector("video.exercise-thumb");
      const img = wrap.querySelector("img.exercise-thumb");

      function showThumb(el) {
        wrap.replaceWith(el);
        el.classList.add("exercise-thumb--loaded");
      }

      if (video) {
        video.addEventListener("loadeddata", () => showThumb(video), { once: true });
        video.addEventListener("error", () => {
          if (img) {
            img.addEventListener("load", () => showThumb(img), { once: true });
            img.addEventListener("error", () => wrap.replaceWith(createEmptyThumb()), { once: true });
          } else {
            wrap.replaceWith(createEmptyThumb());
          }
        }, { once: true });
      } else if (img) {
        img.addEventListener("load", () => showThumb(img), { once: true });
        img.addEventListener("error", () => wrap.replaceWith(createEmptyThumb()), { once: true });
      } else {
        wrap.replaceWith(createEmptyThumb());
      }
    });
  }

  function createEmptyThumb() {
    const el = document.createElement("span");
    el.className = "exercise-thumb exercise-thumb--empty";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function initExerciseMediaFallbacks(root = document) {
    root.querySelectorAll(".exercise-media--auto").forEach(wrap => {
      const video = wrap.querySelector(".exercise-media-video");
      const img = wrap.querySelector(".exercise-media-gif");

      function insertMedia(el) {
        wrap.replaceWith(el);
      }

      if (video) {
        video.addEventListener("loadeddata", () => insertMedia(video));
        video.addEventListener("error", () => {
          if (img) {
            img.addEventListener("load", () => insertMedia(img), { once: true });
            img.addEventListener("error", () => wrap.remove(), { once: true });
          } else {
            wrap.remove();
          }
        });
      } else if (img) {
        img.addEventListener("load", () => insertMedia(img), { once: true });
        img.addEventListener("error", () => wrap.remove(), { once: true });
      } else {
        wrap.remove();
      }
    });

    root.querySelectorAll(".exercise-media-video, .exercise-media-gif, .exercise-media-img").forEach(el => {
      if (el.closest(".exercise-media--auto")) return;
      el.addEventListener("error", () => el.remove());
    });
  }

  function getExerciseDisplay(ex, overrides) {
    const o = overrides[ex.id] || {};
    const baseInstr = EXERCISE_INSTRUCTIONS[ex.id] || { steps: ex.steps || [], note: ex.note || null };
    return {
      name: o.name || ex.name,
      steps: o.steps || baseInstr.steps || [],
      note: (o.note !== undefined) ? o.note : baseInstr.note,
      media: getExerciseMedia(ex, overrides)
    };
  }

  function slugifyExerciseId(name) {
    const base = name.toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 36);
    let id = base || ("custom" + Date.now());
    const taken = new Set(getAllExercises().map(e => e.id));
    if (!taken.has(id)) return id;
    let n = 2;
    while (taken.has(id + n)) n++;
    return id + n;
  }

  function escapeAttr(s) {
    return uiEscapeAttr(s);
  }

  const BODY_ICONS = {
    beine: `<img class="body-icon-img" src="./assets/body-icon-beine.png" alt="" aria-hidden="true">`,
    bauch: `<img class="body-icon-img" src="./assets/body-icon-bauch.png" alt="" aria-hidden="true">`,
    ruecken: `<img class="body-icon-img" src="./assets/body-icon-ruecken.png" alt="" aria-hidden="true">`,
    arme: `<img class="body-icon-img" src="./assets/body-icon-arme.png" alt="" aria-hidden="true">`,
    brust: `<img class="body-icon-img" src="./assets/body-icon-brust.png" alt="" aria-hidden="true">`
  };
  const BODY_ICON_FALLBACK = `<img class="body-icon-img" src="./assets/body-icon-brust.png" alt="" aria-hidden="true">`;
  const BODY_ORDER = ["beine", "bauch", "ruecken", "arme", "brust"];

  function renderAddExerciseForm(body) {
    return `
      <div class="owner-panel add-exercise-panel" style="margin-top:12px">
        <div class="owner-title">Neue Übung · ${BODY_LABELS[body] || body}</div>
        <input class="name-input" id="addName-${body}" placeholder="Name der Übung" maxlength="60">
        <div class="field-label" style="margin-top:8px">Level</div>
        <div class="chip-row" id="addLevel-${body}">
          ${LEVEL_ORDER.map((k,i)=>`<button type="button" class="chip add-level-chip${i===0?" active":""}" data-body="${body}" data-level="${k}">${LEVEL_LABELS[k]}</button>`).join("")}
        </div>
        <textarea class="name-input" id="addSteps-${body}" rows="4" style="margin-top:8px; resize:vertical;" placeholder="Anleitung – ein Schritt pro Zeile"></textarea>
        <input class="name-input" id="addNote-${body}" style="margin-top:8px;" placeholder="Hinweis (optional)" maxlength="200">
        <div class="time-grid" style="margin-top:8px">
          <div><div class="field-label">Min. Wdh</div><input type="number" class="time-input" id="addMin-${body}" value="8" min="1" max="50"></div>
          <div><div class="field-label">Max. Wdh</div><input type="number" class="time-input" id="addMax-${body}" value="12" min="1" max="50"></div>
        </div>
        <button type="button" class="btn-main btn-owner save-new-exercise-btn" data-body="${body}">+ Übung speichern</button>
      </div>`;
  }

  async function renderUebungenPage() {
    const wrap = document.getElementById("uebungenDynamicWrap");
    if (!wrap) return;
    await loadCustomExercises();
    const overrides = await getExerciseOverrides();
    const groups = {};
    BODY_ORDER.forEach(b => { groups[b] = []; });
    getAllExercises().forEach(e => { (groups[e.body] = groups[e.body] || []).push(e); });

    const isOwner = getIsOwner();
    const ownerBar = isOwner
      ? `<div style="text-align:center;margin-bottom:14px"><button class="owner-link" id="uebungenOwnerLogout">Owner-Modus verlassen</button></div>`
      : `<div style="text-align:center;margin-bottom:14px"><button class="owner-link" id="uebungenOwnerLogin">Owner-Modus (Übungen hinzufügen)</button></div>`;

    wrap.innerHTML = ownerBar + BODY_ORDER.map(body => `
      <div class="faq-section">
        <button class="faq-section-btn">
          <span class="faq-section-icon">${BODY_ICONS[body] || BODY_ICON_FALLBACK}</span>
          <span class="faq-section-label">${BODY_LABELS[body] || body}</span>
          <span class="faq-section-chevron">▾</span>
        </button>
        <div class="faq-section-body"><div class="faq-section-inner">
          ${(groups[body] || []).map(ex => {
            const d = getExerciseDisplay(ex, overrides);
            const isCustom = !!customExercises[ex.id];
            return `
            <div class="faq-item" data-exid="${ex.id}">
              <button class="faq-question">
                <span class="faq-question-main">
                  ${renderExerciseThumbHtml(ex, overrides)}
                  <span class="faq-question-text">${d.name}${isCustom ? ' <span class="detail-tag">eigen</span>' : ""}</span>
                </span>
                <span class="faq-chevron">▾</span>
              </button>
              <div class="faq-answer"><div class="faq-answer-inner">
                ${renderExerciseMediaHtml(ex, overrides)}
                <ul>
                  ${d.steps.map(s => `<li>${s}</li>`).join("")}
                </ul>
                ${d.note ? `<div class="faq-note">${d.note}</div>` : ""}
                ${isOwner ? `
                <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                  <button class="btn-main btn-dark edit-exercise-btn" data-exid="${ex.id}" style="width:100%">✏️ Info bearbeiten</button>
                  ${isCustom ? `<button class="btn-main btn-dark delete-custom-exercise-btn" data-exid="${ex.id}" style="width:100%">🗑 Übung löschen</button>` : ""}
                </div>
                <div class="exercise-edit-form" id="editForm-${ex.id}" style="display:none; margin-top:12px;"></div>
                ` : ""}
              </div></div>
            </div>
          `; }).join("") || `<div class="info-box">Noch keine Übungen in dieser Zone.</div>`}
          ${isOwner ? `
            <button type="button" class="btn-main btn-owner toggle-add-exercise-btn" data-body="${body}" style="margin-top:10px">+ Übung hinzufügen</button>
            <div id="addFormWrap-${body}" style="display:none">${renderAddExerciseForm(body)}</div>
          ` : ""}
        </div></div>
      </div>
    `).join("");

    document.getElementById("uebungenOwnerLogin")?.addEventListener("click", () => {
      const pin = prompt("Owner PIN:");
      if (pin === ownerPin) { setIsOwner(true); updateOwnerUI(); renderUebungenPage(); }
      else if (pin != null) alert("Falscher PIN.");
    });
    document.getElementById("uebungenOwnerLogout")?.addEventListener("click", () => {
      setIsOwner(false);
      updateOwnerUI();
      renderUebungenPage();
    });

    wrap.querySelectorAll(".faq-section-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const section = btn.parentElement;
        const isOpen = section.classList.contains("open");
        section.parentElement.querySelectorAll(".faq-section").forEach(s => s.classList.remove("open"));
        if (!isOpen) section.classList.add("open");
      });
    });
    wrap.querySelectorAll(".faq-question").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = btn.parentElement;
        const isOpen = item.classList.contains("open");
        item.closest(".faq-section-inner").querySelectorAll(".faq-item").forEach(i => i.classList.remove("open"));
        if (!isOpen) item.classList.add("open");
      });
    });

    initExerciseMediaFallbacks(wrap);
    initExerciseThumbFallbacks(wrap);

    wrap.querySelectorAll(".toggle-add-exercise-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const body = btn.dataset.body;
        const formWrap = document.getElementById(`addFormWrap-${body}`);
        const open = formWrap.style.display !== "none";
        formWrap.style.display = open ? "none" : "block";
        btn.textContent = open ? "+ Übung hinzufügen" : "Abbrechen";
      });
    });

    wrap.querySelectorAll(".add-level-chip").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const body = btn.dataset.body;
        document.querySelectorAll(`#addLevel-${body} .add-level-chip`).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    wrap.querySelectorAll(".save-new-exercise-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const body = btn.dataset.body;
        const name = document.getElementById(`addName-${body}`).value.trim();
        const stepsRaw = document.getElementById(`addSteps-${body}`).value;
        const note = document.getElementById(`addNote-${body}`).value.trim();
        const levelBtn = document.querySelector(`#addLevel-${body} .add-level-chip.active`);
        const level = levelBtn?.dataset.level || "easy";
        const defMin = parseInt(document.getElementById(`addMin-${body}`).value, 10) || 8;
        const defMax = parseInt(document.getElementById(`addMax-${body}`).value, 10) || 12;
        const steps = stepsRaw.split("\n").map(s => s.trim()).filter(Boolean);
        if (!name) { alert("Bitte einen Namen angeben."); return; }
        if (steps.length === 0) { alert("Bitte mindestens einen Anleitungsschritt angeben."); return; }
        if (defMin > defMax) { alert("Min. Wiederholungen dürfen nicht größer als Max. sein."); return; }
        const id = slugifyExerciseId(name);
        const ex = {
          id, name, body, level, defMin, defMax,
          equip: ["custom"],
          steps, note: note || null,
          custom: true
        };
        const ok = await saveCustomExercise(ex);
        if (ok) renderUebungenPage();
      });
    });

    wrap.querySelectorAll(".delete-custom-exercise-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Diese Übung wirklich löschen?")) return;
        const ok = await deleteCustomExercise(btn.dataset.exid);
        if (ok) renderUebungenPage();
      });
    });

    wrap.querySelectorAll(".edit-exercise-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const exId = btn.dataset.exid;
        const ex = findExercise(exId);
        if (!ex) return;
        const d = getExerciseDisplay(ex, overrides);
        const savedMedia = overrides[exId]?.media;
        const form = document.getElementById(`editForm-${exId}`);
        const isOpen = form.style.display !== "none";
        if (isOpen) { form.style.display = "none"; form.innerHTML = ""; return; }
        form.style.display = "block";
        form.innerHTML = `
          <input class="name-input" id="editName-${exId}" placeholder="Name" value="${escapeAttr(d.name)}">
          <div class="field-label" style="margin-top:8px">Demo-Video / GIF (optional)</div>
          <select class="time-input" id="editMediaType-${exId}" style="margin-bottom:6px">
            <option value=""${!savedMedia ? " selected" : ""}>Automatisch (assets/exercises/${exId}.mp4/.gif)</option>
            <option value="mp4"${savedMedia?.type === "mp4" || savedMedia?.type === "video" ? " selected" : ""}>Video (.mp4)</option>
            <option value="gif"${savedMedia?.type === "gif" ? " selected" : ""}>GIF</option>
            <option value="youtube"${savedMedia?.type === "youtube" ? " selected" : ""}>YouTube</option>
          </select>
          <input class="name-input" id="editMediaUrl-${exId}" placeholder="URL oder Pfad, z.B. ./assets/exercises/${exId}.mp4" value="${escapeAttr(savedMedia?.url || "")}">
          <textarea class="name-input" id="editSteps-${exId}" rows="5" style="margin-top:8px; resize:vertical;" placeholder="Ein Schritt pro Zeile">${d.steps.join("\n")}</textarea>
          <input class="name-input" id="editNote-${exId}" style="margin-top:8px;" placeholder="Hinweis (optional)" value="${escapeAttr(d.note || "")}">
          <button class="btn-main btn-lime save-exercise-edit-btn" data-exid="${exId}" style="width:100%; margin-top:10px;">💾 Speichern</button>
        `;
        form.querySelector(".save-exercise-edit-btn").addEventListener("click", async () => {
          const name = document.getElementById(`editName-${exId}`).value.trim();
          const stepsRaw = document.getElementById(`editSteps-${exId}`).value;
          const note = document.getElementById(`editNote-${exId}`).value.trim();
          const mediaType = document.getElementById(`editMediaType-${exId}`).value;
          const mediaUrl = document.getElementById(`editMediaUrl-${exId}`).value.trim();
          const steps = stepsRaw.split("\n").map(s => s.trim()).filter(Boolean);
          if (!name || steps.length === 0) { alert("Bitte Name und mindestens einen Schritt angeben."); return; }
          const payload = { name, steps, note: note || null };
          if (mediaType && mediaUrl) payload.media = { type: mediaType, url: mediaUrl };
          else if (overrides[exId]?.media) payload.media = null;
          if (customExercises[exId]) {
            const updated = { ...customExercises[exId], ...payload };
            await saveCustomExercise(updated);
          } else {
            await saveExerciseOverride(exId, payload);
          }
          renderUebungenPage();
        });
      });
    });

    initExerciseMediaFallbacks(wrap);
  }


  return {
    levelsUpTo,
    exerciseOverrideRef,
    get customExercises() { return customExercises; },
    loadCustomExercises,
    getExerciseOverrides,
    saveExerciseOverride,
    saveCustomExercise,
    deleteCustomExercise,
    getAllExercises,
    findExercise,
    getExerciseMedia,
    youtubeEmbedId,
    renderExerciseMediaHtml,
    renderExerciseThumbHtml,
    initExerciseThumbFallbacks,
    createEmptyThumb,
    initExerciseMediaFallbacks,
    getExerciseDisplay,
    slugifyExerciseId,
    escapeAttr,
    BODY_ICONS,
    BODY_ICON_FALLBACK,
    BODY_ORDER,
    renderAddExerciseForm,
    renderUebungenPage
  };
}
