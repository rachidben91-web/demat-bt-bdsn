/* js/main.js — DEMAT-BT v11.0.0 — 15/02/2026
   Point d'entrée : initialisation, événements, orchestration du rendu
*/

// -------------------------
// UI Status helpers
// -------------------------
function setZonesStatus(msg) {
  const el = $("zonesStatus");
  const badge = $("zonesBadge");
  if (el) el.textContent = msg;
  if (badge) badge.classList.toggle("status--ok", msg === "OK");
}

function setPdfStatus(msg) {
  const el = $("pdfStatus");
  const badge = $("pdfBadge");

  if (el) {
    const day = extractDayFromFilename(msg);

    if (day) {
      el.innerHTML = `
        <div class="pdf-day-wrapper">
          <div class="pdf-day-label">JOURNÉE</div>
          <div class="pdf-day-badge">
            <span class="pdf-day-icon">📅</span>
            <span>${day}</span>
          </div>
        </div>
      `;
    } else {
      el.textContent = msg.includes(".pdf") && msg.length > 30
        ? msg.substring(0, 27) + "..." : msg;
    }
  }

  if (badge) {
    badge.classList.toggle(
      "status--loaded",
      msg !== "Aucun PDF chargé" && msg !== "Erreur PDF" && msg.includes("pdf")
    );
  }
}

function setProgress(pct, msg) {
  const bar = $("progBar");
  const m = $("progMsg");
  const badge = $("progressBadge");

  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (m && msg != null) m.textContent = msg;

  if (badge) {
    const isActive = msg && (msg.includes("Analyse") || msg.includes("Extraction"));
    const isComplete = msg && (msg.includes("Terminé") || msg.includes("BT détectés") || msg.includes("BT chargés") || msg.includes("Cache restauré"));
    badge.classList.toggle("status--active", isActive);
    badge.classList.toggle("status--complete", isComplete && !isActive);
  }
}

function setExtractEnabled(enabled) {
  const btn = $("btnExtract");
  if (!btn) return;
  btn.disabled = !enabled;
  btn.classList.toggle("btn--disabled", !enabled);
}

// -------------------------
// Vue management
// -------------------------
function setView(view) {
  state.view = view;

  // Toggle boutons
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.classList.toggle("seg__btn--active", btn.dataset.view === view);
  });

  // Toggle sections
  const viewRef = $("viewReferent");
  const viewBrief = $("viewBrief");
  if (viewRef) viewRef.classList.toggle("view--active", view === "referent");
  if (viewBrief) viewBrief.classList.toggle("view--active", view === "brief");

  // Toggle flip mode for brief (Samsung Flip display)
  document.body.classList.toggle("flip", view === "brief");

  renderAll();
}

// -------------------------
// Rendu global
// -------------------------
function renderAll() {
  const filtered = filterBTs();

  renderKpis(filtered);
  buildTypeChips();
  renderTechList();

  if (state.view === "referent") {
    const grid = $("btGrid");
    const timeline = $("btTimeline");
    if (grid && timeline) {
      if (state.layout === "grid") {
        grid.style.display = "grid";
        timeline.style.display = "none";
        renderGrid(filtered, grid);
      } else {
        grid.style.display = "none";
        timeline.style.display = "flex";
        renderTimeline(filtered, timeline);
      }
    }
  } else {
    renderBrief(filtered);
  }
}

// -------------------------
// Événements
// -------------------------
function wireEvents() {
  // Recherche
  const search = $("searchInput");
  if (search) {
    search.addEventListener("input", () => {
      state.filters.q = search.value;
      renderAll();
    });
  }

  // Tech select
  const sel = $("techSelect");
  if (sel) {
    sel.addEventListener("change", () => {
      state.filters.techId = sel.value || "";
      renderAll();
    });
  }

  // Vues Référent / Brief
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Layout Grid / Timeline
  document.querySelectorAll("[data-layout]").forEach(btn => {
    btn.addEventListener("click", () => {
      const layout = btn.dataset.layout;
      state.layout = layout;
      document.querySelectorAll("[data-layout]").forEach(b => {
        b.classList.toggle("seg__btn--active", b.dataset.layout === layout);
      });
      renderAll();
    });
  });

  // Import PDF
  const input = $("pdfFile");
  if (input) {
    input.addEventListener("change", async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      try {
        setExtractEnabled(false);
        setPdfStatus(f.name);
        setProgress(0, "Chargement PDF…");
        await ensurePdfJs();
        state.pdfFile = f;
        state.pdfName = f.name;
        const buf = await f.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument({ data: buf, stopAtErrors: false, disableAutoFetch: true });
        state.pdf = await loadingTask.promise;
        state.totalPages = state.pdf.numPages;
        console.log("[DEMAT-BT] PDF chargé ✅", state.totalPages, "pages");
        setProgress(0, `PDF chargé (${state.totalPages} pages).`);
        setExtractEnabled(true);
      } catch (e) {
        console.error(e);
        setPdfStatus("Erreur PDF");
        setProgress(0, "Erreur chargement PDF (voir console).");
        setExtractEnabled(false);
      }
    });
  }

  // Bouton Extraire
  const btnExtract = $("btnExtract");
  if (btnExtract) {
    btnExtract.addEventListener("click", async () => {
      try {
        if (!state.pdf) { setProgress(0, "Choisis d'abord un PDF."); return; }
        setExtractEnabled(false);
        setProgress(0, "Extraction en cours…");
        await extractAll();
      } catch (e) {
        console.error(e);
        setProgress(0, "Erreur extraction (voir console).");
      } finally {
        setExtractEnabled(!!state.pdf);
      }
    });
  }

  // Modal
  const modal = $("modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close") || e.target.classList.contains("modal__backdrop")) {
        closeModal();
      }
    });
  }
  const btnPrev = $("btnPrevPage");
  if (btnPrev) btnPrev.addEventListener("click", prevPage);
  const btnNext = $("btnNextPage");
  if (btnNext) btnNext.addEventListener("click", nextPage);

  // Export
  const btnExport = $("btnExportBt");
  if (btnExport) btnExport.addEventListener("click", exportBTPDF);
  const btnExportDay = $("btnExportDay");
  if (btnExportDay) btnExportDay.addEventListener("click", exportDayPDF);

  // Fullscreen
  const btnFS = $("btnFullscreen");
  if (btnFS) {
    btnFS.addEventListener("click", () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });
  }

  // Clear cache
  const btnClearCache = $("btnClearCache");
  if (btnClearCache) {
    btnClearCache.addEventListener("click", async () => {
      const info = getCacheInfo();
      if (!info) { alert("Aucun cache à vider."); return; }
      if (confirm(`Vider le cache ?\n${info.pdfName}\n${info.btCount} BT — ${info.age}`)) {
        await clearCache();
        state.bts = [];
        state.countsByTechId = new Map();
        state.pdf = null;
        state.pdfFile = null;
        setPdfStatus("Aucun PDF chargé");
        setProgress(0, "Cache vidé.");
        setExtractEnabled(false);
        renderAll();
      }
    });
  }
}

// -------------------------
// Initialisation
// -------------------------
async function init() {
  try {
    setPdfStatus("Aucun PDF chargé");
    setProgress(0, "Prêt.");
    setExtractEnabled(false);

    buildTypeChips();
    wireEvents();

    await loadZones();
    await loadBadgeRules();

    // Horloge + météo
    updateDateTime();
    setInterval(updateDateTime, 1000);
    updateWeather();
    setInterval(updateWeather, 600000);

    // Tenter le cache
    const cacheLoaded = await loadFromCache();
    if (cacheLoaded) {
      console.log("[INIT] Données chargées depuis le cache ✅");
      if (state.pdf) setExtractEnabled(true);
    }

    setView("referent");
  } catch (e) {
    console.error(e);
    setZonesStatus("Erreur");
    setProgress(0, "Erreur init (voir console).");
  }
}

document.addEventListener("DOMContentLoaded", init);
