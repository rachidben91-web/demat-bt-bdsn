/* js/main.js — DEMAT-BT v11.0.0 — 16/02/2026
   Point d'entrée : orchestration, événements et rendu dynamique.
   Mise à jour : Support étendu pour les nouveaux types de documents (FOR-113, Plans, etc.)
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
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.classList.toggle("seg__btn--active", btn.dataset.view === view);
  });

  const viewRef = $("viewReferent");
  const viewBrief = $("viewBrief");
  if (viewRef) viewRef.classList.toggle("view--active", view === "referent");
  if (viewBrief) viewBrief.classList.toggle("view--active", view === "brief");

  // Mode Flip pour le Brief (Samsung Display 55")
  document.body.classList.toggle("flip", view === "brief");
  renderAll();
}

// -------------------------
// Rendu global
// -------------------------
function renderAll() {
  const filtered = filterBTs();
  renderKpis(filtered);
  buildTypeChips(); // Rafraîchit les filtres avec les nouveaux types (FOR113, etc.)
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
  // Recherche textuelle
  const search = $("searchInput");
  if (search) {
    search.addEventListener("input", () => {
      state.filters.q = search.value;
      renderAll();
    });
  }

  // Sélection technicien
  const sel = $("techSelect");
  if (sel) {
    sel.addEventListener("change", () => {
      state.filters.techId = sel.value || "";
      renderAll();
    });
  }

  // Chgt de vue
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Chgt de layout (Grille / Activités)
  document.querySelectorAll("[data-layout]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.layout = btn.dataset.layout;
      document.querySelectorAll("[data-layout]").forEach(b => {
        b.classList.toggle("seg__btn--active", b.dataset.layout === state.layout);
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
        const loadingTask = window.pdfjsLib.getDocument({ data: buf, stopAtErrors: false });
        state.pdf = await loadingTask.promise;
        state.totalPages = state.pdf.numPages;
        setProgress(0, `PDF prêt (${state.totalPages} pages).`);
        setExtractEnabled(true);
      } catch (e) {
        setPdfStatus("Erreur PDF");
        setExtractEnabled(false);
      }
    });
  }

  // Bouton Extraire
  const btnExtract = $("btnExtract");
  if (btnExtract) {
    btnExtract.addEventListener("click", async () => {
      try {
        setExtractEnabled(false);
        await extractAll();
      } catch (e) {
        setProgress(0, "Erreur extraction.");
      } finally {
        setExtractEnabled(!!state.pdf);
      }
    });
  }

  // Cache & Fullscreen
  const btnClear = $("btnClearCache");
  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      if (confirm("Voulez-vous vider les données mémorisées ?")) {
        await clearCache();
        location.reload();
      }
    });
  }

  const btnFS = $("btnFullscreen");
  if (btnFS) {
    btnFS.addEventListener("click", () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });
  }

  // Modal actions
  const btnPrev = $("btnPrevPage");
  if (btnPrev) btnPrev.addEventListener("click", prevPage);
  const btnNext = $("btnNextPage");
  if (btnNext) btnNext.addEventListener("click", nextPage);
  const btnExp = $("btnExportBt");
  if (btnExp) btnExp.addEventListener("click", exportBTPDF);
  const btnExpDay = $("btnExportDay");
  if (btnExpDay) btnExpDay.addEventListener("click", exportDayPDF);
}

// -------------------------
// Initialisation
// -------------------------
async function init() {
  try {
    wireEvents();
    // Chargement des dépendances métier
    await loadZones(); [cite: 8]
    await loadBadgeRules(); [cite: 4]
    
    // Services autonomes
    updateDateTime();
    setInterval(updateDateTime, 1000);
    updateWeather(); [cite: 11]
    setInterval(updateWeather, 600000);

    // Tentative de restauration
    const cacheLoaded = await loadFromCache(); [cite: 7]
    if (cacheLoaded) {
      if (state.pdf) setExtractEnabled(true);
    }

    setView("referent");
  } catch (e) {
    console.error("Init error:", e);
  }
}

document.addEventListener("DOMContentLoaded", init);
