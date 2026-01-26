/* =========================================================
   DEMAT-BT — app.js
   Version: 8.1.0
   Topbar + Dashboard gauche + compteurs BT/pages + statut
   ========================================================= */

(() => {
  "use strict";

  // ---------------------------
  // Version & helpers
  // ---------------------------
  const APP_VERSION = "8.1.0";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");

  function formatDateFR(d) {
    const jours = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
    const mois = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
    return `${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatTimeFR(d) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  // ---------------------------
  // Status Topbar
  // ---------------------------
  const TOPBAR_STATUS = {
    WAIT:   { cls: "tbDot--wait",   label: "En attente du PDF" },
    LOADED: { cls: "tbDot--loaded", label: "PDF chargé" },
    DONE:   { cls: "tbDot--done",   label: "Prêt" },
    ERROR:  { cls: "tbDot--error",  label: "Erreur" },
  };

  function setTopbarStatus(kind, titleOverride = "") {
    const dot = $("#tbDot");
    if (!dot) return;

    dot.classList.remove(
      TOPBAR_STATUS.WAIT.cls,
      TOPBAR_STATUS.LOADED.cls,
      TOPBAR_STATUS.DONE.cls,
      TOPBAR_STATUS.ERROR.cls
    );

    const entry = TOPBAR_STATUS[kind] || TOPBAR_STATUS.WAIT;
    dot.classList.add(entry.cls);
    dot.title = titleOverride || entry.label;
  }

  function setTopbarMeta(text) {
    const meta = $("#tbMeta");
    if (meta) meta.textContent = text || "";
  }

  function updateTopbarClock() {
    const main = $("#tbDateTime");
    if (!main) return;

    const now = new Date();
    main.textContent = `Journée du ${formatDateFR(now)} • ${formatTimeFR(now)}`;
  }

  function startTopbarClock() {
    updateTopbarClock();
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(() => {
      updateTopbarClock();
      setInterval(updateTopbarClock, 60_000);
    }, Math.max(250, msToNextMinute));
  }

  // ---------------------------
  // Store (état appli)
  // ---------------------------
  const store = {
    pdfName: "",
    pdfTotalPages: 0,
    btCount: 0,
    status: "WAIT",          // WAIT | LOADED | DONE | ERROR
    progressText: "",        // ex: "Terminé : 30 BT détectés."
    progressRatio: 0,        // 0..1
  };

  // ---------------------------
  // Sidebar "ancien dashboard"
  // (IDs attendus — si absents: on n'explose pas)
  // ---------------------------
  function applySidebar() {
    // Zones
    const zoneVal = $("#sbZoneValue");
    if (zoneVal) zoneVal.textContent = "OK";

    // PDF name
    const pdfNameEl = $("#sbPdfName");
    if (pdfNameEl) pdfNameEl.textContent = store.pdfName ? store.pdfName : "Aucun PDF chargé";

    // Progression texte
    const progText = $("#sbProgressText");
    if (progText) {
      progText.textContent = store.progressText || (store.btCount ? `Terminé : ${store.btCount} BT détectés.` : "Prêt.");
    }

    // Progression barre
    const progBarFill = $("#sbProgressFill");
    if (progBarFill) {
      const ratio = Number.isFinite(store.progressRatio) ? store.progressRatio : 0;
      const pct = Math.max(0, Math.min(1, ratio)) * 100;
      progBarFill.style.width = `${pct}%`;
    }

    // Vignettes BT / Pages
    const btCountEl = $("#sbBtCount");
    if (btCountEl) btCountEl.textContent = String(store.btCount || 0);

    const pagesEl = $("#sbPageCount");
    if (pagesEl) pagesEl.textContent = String(store.pdfTotalPages || 0);
  }

  // ---------------------------
  // Topbar meta = "BT extraits : xx"
  // ---------------------------
  function applyTopbarMeta() {
    const bt = store.btCount || 0;
    const pages = store.pdfTotalPages || 0;

    // Meta courte et lisible
    // - si pas de PDF: message utile
    if (!store.pdfName) {
      setTopbarStatus("WAIT");
      setTopbarMeta("En attente du PDF");
      return;
    }

    setTopbarStatus("LOADED");
    setTopbarMeta(`BT extraits : ${bt} • Pages : ${pages}`);
  }

  // ---------------------------
  // API d'update (à appeler après import/extraction)
  // ---------------------------
  function updateUI(partial) {
    Object.assign(store, partial || {});
    applyTopbarMeta();
    applySidebar();
  }

  // ---------------------------
  // Hooks: intégration avec TON code existant
  // -> tu peux appeler window.DEMAT_UI.setFromExtraction(...)
  // ---------------------------
  window.DEMAT_UI = {
    version: APP_VERSION,

    // À appeler quand le PDF est choisi/importé
    setPdfInfo({ name = "", totalPages = 0 } = {}) {
      updateUI({
        pdfName: name,
        pdfTotalPages: Number(totalPages) || 0,
        status: name ? "LOADED" : "WAIT",
      });
    },

    // À appeler après extraction BT
    setExtractionResult({ btCount = 0, totalPages = store.pdfTotalPages, progressRatio = 1 } = {}) {
      updateUI({
        btCount: Number(btCount) || 0,
        pdfTotalPages: Number(totalPages) || 0,
        progressText: `Terminé : ${Number(btCount) || 0} BT détectés.`,
        progressRatio: Number.isFinite(progressRatio) ? progressRatio : 1,
        status: "DONE",
      });
      setTopbarStatus("DONE");
    },

    // Si erreur (import, extraction, parsing…)
    setError(message = "Erreur") {
      updateUI({
        status: "ERROR",
        progressText: message,
        progressRatio: 0,
      });
      setTopbarStatus("ERROR", message);
      setTopbarMeta(message);
    },

    // Reset (nouveau jour / clear)
    reset() {
      updateUI({
        pdfName: "",
        pdfTotalPages: 0,
        btCount: 0,
        status: "WAIT",
        progressText: "",
        progressRatio: 0,
      });
      setTopbarStatus("WAIT");
      setTopbarMeta("En attente du PDF");
    }
  };

  // ---------------------------
  // Init
  // ---------------------------
  function init() {
    // horloge
    startTopbarClock();

    // état initial
    setTopbarStatus("WAIT");
    setTopbarMeta("En attente du PDF");

    // Sidebar initial
    applySidebar();

    // Bonus: afficher version si tu as un span #appVersion
    const v = $("#appVersion");
    if (v) v.textContent = APP_VERSION;

    // Sécu : si tu as un bouton reset/debug
    const btnReset = $("#btnReset");
    if (btnReset) btnReset.addEventListener("click", () => window.DEMAT_UI.reset());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
