/* app.js — DEMAT-BT (GitHub Pages)
   - zones.json
   - import PDF via input#pdfFile
   - extraction BT + docs associés
   - affichage Référent + Brief (Flip)
*/

const PDF_JS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_JS_WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const DOC_TYPES = ["BT", "AT", "PROC", "PLAN", "PHOTO", "STREET", "DOC"];

let ZONES = null;

const state = {
  pdf: null,
  pdfFile: null,
  pdfName: "",
  totalPages: 0,
  bts: [],
  view: "referent", // "referent" | "brief"
  filters: { q: "", types: new Set(), techId: "" },
  countsByTechId: new Map()
};

// -------------------------
// DOM helpers (robustes)
// -------------------------
const $ = (id) => document.getElementById(id);

function pickElByIds(ids) {
  for (const id of ids) {
    const el = $(id);
    if (el) return el;
  }
  return null;
}

function elZonesStatus() { return pickElByIds(["zonesStatus", "zones", "zones_state"]); }
function elPdfStatus() { return pickElByIds(["pdfStatus", "pdf", "pdf_state"]); }
function elProgMsg() { return pickElByIds(["progMsg", "progressMsg", "status"]); }
function elProgBar() { return pickElByIds(["progBar", "progressBar"]); }
function elSearch() { return pickElByIds(["searchInput", "q", "search"]); }
function elTypeChips() { return pickElByIds(["typeChips", "chipsTypes"]); }
function elTechSelect() { return pickElByIds(["techSelect", "technicianSelect", "selectTech"]); }

// IMPORTANT : zone résultats — on teste plusieurs IDs + fallback querySelector
function elResults() {
  return (
    pickElByIds(["results", "resultats", "btList", "list", "cards", "grid", "mainResults"]) ||
    document.querySelector('[data-role="results"]') ||
    document.querySelector(".results") ||
    document.querySelector("#rightPane") ||
    null
  );
}

function elPdfInput() { return pickElByIds(["pdfFile", "file", "fileInput"]); }
function elBtnExtract() { return pickElByIds(["btnExtract", "btnExtraire", "extract"]); }

// boutons de vue : <button data-view="referent"> / <button data-view="brief">
function viewButtons() {
  return [...document.querySelectorAll("button[data-view]")];
}

// -------------------------
// UI helpers
// -------------------------
function setZonesStatus(msg) {
  const el = elZonesStatus();
  if (el) el.textContent = msg;
}
function setPdfStatus(msg) {
  const el = elPdfStatus();
  if (el) el.textContent = msg;
}
function setProgress(pct, msg) {
  const bar = elProgBar();
  const m = elProgMsg();
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (m && msg != null) m.textContent = msg;
}
function setExtractEnabled(enabled) {
  const btn = elBtnExtract();
  if (!btn) return;
  btn.disabled = !enabled;
}

function ensureResultsContainerMessage() {
  const root = elResults();
  if (root) return root;

  console.warn("[DEMAT-BT] Aucune zone résultats trouvée. Ajoute id='results' à la zone de droite.");
  // Tentative : on met un message dans le body (au cas où)
  let warn = document.getElementById("dematWarn");
  if (!warn) {
    warn = document.createElement("div");
    warn.id = "dematWarn";
    warn.style.cssText = "margin:12px;padding:12px;border:1px solid #f59e0b;background:#fff7ed;color:#7c2d12;border-radius:10px;font-family:system-ui;";
    warn.textContent = "⚠️ Je n’arrive pas à trouver la zone d’affichage des résultats. Dans index.html, mets un id='results' sur la partie droite (liste des BT).";
    document.body.prepend(warn);
  }
  return null;
}

// -------------------------
// Loaders
// -------------------------
async function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const already = [...document.scripts].some(s => (s.src || "").includes(src));
    if (already) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Impossible de charger: " + src));
    document.head.appendChild(s);
  });
}

async function loadPdfJs() {
  if (window.pdfjsLib) return;
  await loadScriptOnce(PDF_JS_CDN);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_CDN;
}

async function loadZones() {
  setZonesStatus("Chargement...");
  const url = `./zones.json?v=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("zones.json introuvable (404). Vérifie le nom et l’emplacement.");
  ZONES = await res.json();
  setZonesStatus("OK");
  console.log("[DEMAT-BT] zones.json chargé ✅", ZONES);
  return ZONES;
}

// -------------------------
// Zones utils (bbox)
// -------------------------
function getZoneBBox(label) {
  if (!ZONES) return null;

  try {
    const bb = ZONES.pages?.BT?.[label]?.bbox;
    if (bb) return bb;
  } catch {}

  if (Array.isArray(ZONES.zones)) {
    const z = ZONES.zones.find(x => (x.label || "").toUpperCase() === label.toUpperCase());
    if (z?.bbox) return z.bbox;
  }
  return null;
}

function norm(s) {
  return (s || "").replace(/\s+/g, " ").replace(/[’]/g, "'").trim();
}

async function extractTextInBBox(page, bbox) {
  if (!bbox) return "";
  const tc = await page.getTextContent();
  const items = tc.items || [];
  const { x0, y0, x1, y1 } = bbox;

  const picked = [];
  for (const it of items) {
    const t = it.transform;
    if (!t) continue;
    const x = t[4];
    const y = t[5];
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
      const str = (it.str || "").trim();
      if (str) picked.push({ str, x, y });
    }
  }
  picked.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  return norm(picked.map(p => p.str).join(" "));
}

// -------------------------
// Team parsing (REALISATION only)
// -------------------------
function parseTeamFromRealisation(text) {
  const t = norm(text).toUpperCase();
  const re = /([A-Z]\d{5})\s+([A-ZÀ-Ÿ][A-ZÀ-Ÿ' -]{2,60})/g;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const nni = m[1];
    const name = norm(m[2]);
    if (!out.some(x => x.nni === nni)) out.push({ nni, name });
  }
  return out;
}

function mapTechByNni(nni) {
  const techs = window.TECHNICIANS || [];
  return techs.find(t => (t.nni || "").toUpperCase() === (nni || "").toUpperCase()) || null;
}

function techKey(tech) {
  return tech ? (tech.id || tech.nni) : null;
}

// -------------------------
// Detection BT + docs
// -------------------------
function isBTNumber(text) {
  return /BT\d{8,14}/i.test(text || "");
}

function detectDocTypeFromHeader(text) {
  const up = (text || "").toUpperCase();
  if (up.includes("AUTORISATION") || up.includes("AT N")) return "AT";
  if (up.includes("PROC") || up.includes("PROCEDURE") || up.includes("ORDONNANCEMENT")) return "PROC";
  if (up.includes("PLAN") || up.includes("PLANS")) return "PLAN";
  if (up.includes("PHOTO") || up.includes("PHOTOS")) return "PHOTO";
  if (up.includes("STREET")) return "STREET";
  return "DOC";
}

// -------------------------
// Extraction principale
// -------------------------
async function extractAll() {
  if (!state.pdf) throw new Error("PDF non chargé.");
  if (!ZONES) throw new Error("zones.json non chargé.");

  const bbBTNUM = getZoneBBox("BT_NUM");
  const bbOBJ = getZoneBBox("OBJET");
  const bbDATE = getZoneBBox("DATE_PREVUE") || getZoneBBox("DATE_PREVU");
  const bbLOC = getZoneBBox("LOCALISATION");
  const bbCLIENT = getZoneBBox("CLIENT_NOM");
  const bbAT = getZoneBBox("AT_NUM");
  const bbREAL = getZoneBBox("REALISATION");
  const bbDESI = getZoneBBox("DESIGNATION");

  state.bts = [];
  state.countsByTechId = new Map();

  let currentBT = null;

  for (let p = 1; p <= state.totalPages; p++) {
    setProgress((p - 1) / state.totalPages * 100, `Analyse page ${p}/${state.totalPages}...`);
    const page = await state.pdf.getPage(p);

    const btNumTxt = norm(await extractTextInBBox(page, bbBTNUM));
    const isBtPage = isBTNumber(btNumTxt);

    if (isBtPage) {
      const objet = norm(await extractTextInBBox(page, bbOBJ));
      const datePrevue = norm(await extractTextInBBox(page, bbDATE));
      const client = norm(await extractTextInBBox(page, bbCLIENT));
      const loc = norm(await extractTextInBBox(page, bbLOC));
      const atNumTxt = norm(await extractTextInBBox(page, bbAT));
      const realTxt = norm(await extractTextInBBox(page, bbREAL));
      const desiTxt = norm(await extractTextInBBox(page, bbDESI));

      const id = (btNumTxt.match(/BT\d{8,14}/i) || [""])[0].toUpperCase();
      const atNum = (atNumTxt.match(/AT\d{3,}/i) || [""])[0].toUpperCase();

      const team = parseTeamFromRealisation(realTxt);

      currentBT = {
        id,
        pageStart: p,
        objet,
        datePrevue,
        client,
        localisation: loc,
        atNum,
        team,
        designation: desiTxt,
        docs: [{ page: p, type: "BT" }]
      };

      state.bts.push(currentBT);

      for (const member of team) {
        const tech = mapTechByNni(member.nni);
        if (!tech) continue;
        const key = techKey(tech);
        state.countsByTechId.set(key, (state.countsByTechId.get(key) || 0) + 1);
      }

      continue;
    }

    if (currentBT) {
      const headerTxt = norm(await extractTextInBBox(page, bbOBJ)) || "";
      const type = detectDocTypeFromHeader(headerTxt);
      currentBT.docs.push({ page: p, type });
    }
  }

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  renderAll();
}

// -------------------------
// UI: chips + tech select
// -------------------------
function buildTypeChips() {
  const root = elTypeChips();
  if (!root) return;

  root.innerHTML = "";
  for (const t of DOC_TYPES) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = t;
    btn.addEventListener("click", () => {
      if (state.filters.types.has(t)) state.filters.types.delete(t);
      else state.filters.types.add(t);
      syncTypeChipsUI();
      renderAll();
    });
    root.appendChild(btn);
  }
  syncTypeChipsUI();
}

function syncTypeChipsUI() {
  const root = elTypeChips();
  if (!root) return;
  [...root.querySelectorAll(".chip")].forEach(chip => {
    const t = chip.textContent.trim();
    chip.classList.toggle("chip--active", state.filters.types.has(t));
  });
}

function buildTechSelectWithCounts() {
  const sel = elTechSelect();
  if (!sel) return;

  const techs = window.TECHNICIANS || [];
  const items = [];

  for (const t of techs) {
    const key = techKey(t);
    const c = state.countsByTechId.get(key) || 0;
    if (c > 0) items.push({ ...t, count: c });
  }

  items.sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, "fr"));

  const current = state.filters.techId || "";
  sel.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "— Tous —";
  sel.appendChild(optAll);

  for (const t of items) {
    const opt = document.createElement("option");
    opt.value = techKey(t);
    opt.textContent = `${t.name} (${t.count})`;
    sel.appendChild(opt);
  }

  sel.value = current;
}

// -------------------------
// Filtering + rendering
// -------------------------
function matchesFilters(bt) {
  const q = norm(state.filters.q).toUpperCase();
  if (q) {
    const hay = norm([bt.id, bt.objet, bt.client, bt.localisation, bt.datePrevue].join(" ")).toUpperCase();
    if (!hay.includes(q)) return false;
  }

  if (state.filters.types.size > 0) {
    const typesInBt = new Set(bt.docs.map(d => d.type));
    let ok = false;
    for (const t of state.filters.types) {
      if (typesInBt.has(t)) { ok = true; break; }
    }
    if (!ok) return false;
  }

  if (state.filters.techId) {
    const wanted = state.filters.techId;
    const has = (bt.team || []).some(m => {
      const tech = mapTechByNni(m.nni);
      return techKey(tech) === wanted;
    });
    if (!has) return false;
  }

  return true;
}

function renderAll() {
  const root = ensureResultsContainerMessage();
  if (!root) return;

  buildTechSelectWithCounts();

  // En mode Brief : on force un tech
  if (state.view === "brief" && !state.filters.techId) {
    root.innerHTML = `<div style="padding:18px;color:#6b7280;font-family:system-ui;">
      ➜ Mode <b>Brief</b> : sélectionne un technicien dans la liste à gauche.
    </div>`;
    return;
  }

  const filtered = state.bts.filter(matchesFilters);

  root.innerHTML = "";
  if (filtered.length === 0) {
    root.innerHTML = `<div style="padding:18px;color:#6b7280;font-family:system-ui;">Aucun BT à afficher avec ces filtres.</div>`;
    return;
  }

  for (const bt of filtered) {
    const card = document.createElement("div");
    card.className = "bt_card";

    const title = document.createElement("div");
    title.className = "bt_title";
    title.textContent = bt.id || "BT ?";
    card.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "bt_sub";
    sub.textContent = bt.objet || "";
    card.appendChild(sub);

    const teamTxt = (bt.team || []).map(m => {
      const tech = mapTechByNni(m.nni);
      return tech ? tech.name : `${m.nni}`;
    }).join(" • ") || "—";

    const meta = document.createElement("div");
    meta.className = "bt_meta";
    meta.innerHTML = `
      <div>📅 ${bt.datePrevue || "—"}</div>
      <div>👤 ${bt.client || "—"}</div>
      <div>📍 ${bt.localisation || "—"}</div>
      <div>👥 ${teamTxt}</div>
      <div>${bt.atNum ? `🧾 ${bt.atNum}` : ""}</div>
    `;
    card.appendChild(meta);

    const counts = {};
    for (const d of bt.docs) counts[d.type] = (counts[d.type] || 0) + 1;

    const chips = document.createElement("div");
    chips.className = "bt_docchips";
    chips.innerHTML = Object.keys(counts).map(t => `<span class="mini_chip">${t}:${counts[t]}</span>`).join(" ");
    card.appendChild(chips);

    root.appendChild(card);
  }
}

// -------------------------
// View switch (Référent / Brief)
// -------------------------
function wireViewSwitch() {
  const btns = viewButtons();
  if (btns.length === 0) {
    console.warn("[DEMAT-BT] Aucun bouton data-view trouvé. (Normal si ton HTML n’a pas ce système)");
    return;
  }

  const setActive = () => {
    btns.forEach(b => {
      const v = b.getAttribute("data-view");
      b.classList.toggle("seg_btn--active", v === state.view);
      b.classList.toggle("seg_btn--active", v === state.view);
    });
  };

  btns.forEach(b => {
    b.addEventListener("click", () => {
      state.view = b.getAttribute("data-view") || "referent";
      setActive();
      renderAll();
    });
  });

  setActive();
}

// -------------------------
// Wiring (Import + Extract)
// -------------------------
function wireEvents() {
  const search = elSearch();
  if (search) {
    search.addEventListener("input", (e) => {
      state.filters.q = e.target.value || "";
      renderAll();
    });
  }

  const sel = elTechSelect();
  if (sel) {
    sel.addEventListener("change", () => {
      state.filters.techId = sel.value || "";
      renderAll();
    });
  }

  const input = elPdfInput();
  if (input) {
    input.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;

      try {
        setExtractEnabled(false);
        setPdfStatus(f.name);
        setProgress(0, "Chargement PDF...");

        state.pdfFile = f;
        state.pdfName = f.name;

        await loadPdfJs();

        const buf = await f.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument({ data: buf });
        state.pdf = await loadingTask.promise;
        state.totalPages = state.pdf.numPages;

        console.log("[DEMAT-BT] PDF chargé ✅", state.totalPages, "pages");
        setProgress(0, `PDF chargé (${state.totalPages} pages).`);
        setExtractEnabled(true);
      } catch (err) {
        console.error(err);
        setPdfStatus("Erreur PDF");
        setProgress(0, "Erreur chargement PDF (voir console).");
        setExtractEnabled(false);
      }
    });
  } else {
    console.warn("[DEMAT-BT] input PDF introuvable (id attendu: pdfFile).");
  }

  const btn = elBtnExtract();
  if (btn) {
    btn.addEventListener("click", async () => {
      try {
        if (!state.pdf) { setProgress(0, "Choisis d’abord un PDF."); return; }
        setExtractEnabled(false);
        setProgress(0, "Extraction en cours...");
        await extractAll();
      } catch (err) {
        console.error(err);
        setProgress(0, "Erreur extraction (voir console).");
      } finally {
        setExtractEnabled(!!state.pdf);
      }
    });
  } else {
    console.warn("[DEMAT-BT] bouton Extraire introuvable (id attendu: btnExtract).");
  }
}

// -------------------------
// Init
// -------------------------
async function init() {
  try {
    setExtractEnabled(false);
    setPdfStatus("Aucun PDF chargé");
    setProgress(0, "Prêt.");

    buildTypeChips();
    wireEvents();
    wireViewSwitch();

    await loadZones();

    // Affiche un message si pas de container résultats
    ensureResultsContainerMessage();

  } catch (e) {
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", init);
