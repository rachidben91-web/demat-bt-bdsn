/* app.js — DEMAT-BT (GitHub Pages)
   Compatible avec TON index.html :
   - Référent:  #viewReferent + #btGrid + #kpis
   - Brief:     #viewBrief + #briefList + #briefMeta
   - Import PDF: input#pdfFile
   - Extraire:   button#btnExtract
*/

const DOC_TYPES = ["BT", "AT", "PROC", "PLAN", "PHOTO", "STREET", "DOC"];
let ZONES = null;

const state = {
  pdf: null,
  pdfFile: null,
  pdfName: "",
  totalPages: 0,
  bts: [],
  view: "referent", // referent | brief
  selectedBtId: "",
  filters: {
    q: "",
    types: new Set(),
    techId: ""
  },
  countsByTechId: new Map(),
  viewer: {
    isOpen: false,
    page: 1,
    title: "",
    subtitle: "",
    btId: "", // si ouvert depuis un BT, utile pour export
    range: null // {start,end} facultatif (pour info)
  }
};

// -------------------------
// Helpers DOM
// -------------------------
const $ = (id) => document.getElementById(id);

function setZonesStatus(msg) {
  const el = $("zonesStatus");
  if (el) el.textContent = msg;
}
function setPdfStatus(msg) {
  const el = $("pdfStatus");
  if (el) el.textContent = msg;
}
function setProgress(pct, msg) {
  const bar = $("progBar");
  const m = $("progMsg");
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (m && msg != null) m.textContent = msg;
}
function setExtractEnabled(enabled) {
  const btn = $("btnExtract");
  if (!btn) return;
  btn.disabled = !enabled;
  btn.classList.toggle("btn--disabled", !enabled);
}

function norm(s) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[’]/g, "'")
    .trim();
}

function safeUpper(s) {
  return norm(s).toUpperCase();
}

// -------------------------
// Load zones.json
// -------------------------
async function loadZones() {
  setZonesStatus("Chargement…");
  const res = await fetch(`./zones.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("zones.json introuvable (404). Vérifie emplacement/nom.");
  ZONES = await res.json();
  setZonesStatus("OK");
  console.log("[DEMAT-BT] zones.json chargé ✅", ZONES);
}

function getZoneBBox(label) {
  if (!ZONES) return null;
  try {
    const bb = ZONES.pages?.BT?.[label]?.bbox;
    if (bb) return bb;
  } catch {}
  return null;
}

// -------------------------
// PDF.js via script tag (tu l’as déjà dans ton ancien setup ?)
// Ici on utilise la version "déjà chargée" si tu l’as, sinon on charge.
// -------------------------
async function ensurePdfJs() {
  if (window.pdfjsLib) return;

  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Impossible de charger pdf.js"));
    document.head.appendChild(s);
  });

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// -------------------------
// Extraction texte dans bbox
// -------------------------
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

  // tri approx lecture
  picked.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  return norm(picked.map(p => p.str).join(" "));
}

// -------------------------
// Détection BT / types docs
// -------------------------
function isBTNumber(text) {
  return /BT\d{8,14}/i.test(text || "");
}
function pickBTId(text) {
  return ((text || "").match(/BT\d{8,14}/i) || [""])[0].toUpperCase();
}
function pickATId(text) {
  return ((text || "").match(/AT\d{3,}/i) || [""])[0].toUpperCase();
}
function detectDocTypeFromHeader(text) {
  const up = safeUpper(text);
  if (up.includes("AUTORISATION") || up.includes("AT N")) return "AT";
  if (up.includes("PROCEDURE") || up.includes("PROC") || up.includes("ORDONNANCEMENT")) return "PROC";
  if (up.includes("PLAN") || up.includes("PLANS")) return "PLAN";
  if (up.includes("PHOTO") || up.includes("PHOTOS")) return "PHOTO";
  if (up.includes("STREET")) return "STREET";
  return "DOC";
}

// -------------------------
// Team parsing depuis REALISATION (NNI + nom)
// Pattern NNI: 1 lettre + 5 chiffres (A94073)
// -------------------------
function parseTeamFromRealisation(text) {
  const t = safeUpper(text);
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
  return tech ? (tech.id || tech.nni) : "";
}

// -------------------------
// Extraction principale
// -------------------------
async function extractAll() {
  if (!state.pdf) throw new Error("PDF non chargé.");
  if (!ZONES) throw new Error("Zones non chargées.");

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
  state.selectedBtId = "";

  let currentBT = null;

  for (let p = 1; p <= state.totalPages; p++) {
    setProgress((p - 1) / state.totalPages * 100, `Analyse page ${p}/${state.totalPages}...`);
    const page = await state.pdf.getPage(p);

    const btNumTxt = norm(await extractTextInBBox(page, bbBTNUM));
    const isBtPage = isBTNumber(btNumTxt);

    if (isBtPage) {
      const id = pickBTId(btNumTxt);
      const objet = norm(await extractTextInBBox(page, bbOBJ));
      const datePrevue = norm(await extractTextInBBox(page, bbDATE));
      const client = norm(await extractTextInBBox(page, bbCLIENT));
      const loc = norm(await extractTextInBBox(page, bbLOC));
      const atNumTxt = norm(await extractTextInBBox(page, bbAT));
      const atNum = pickATId(atNumTxt);
      const realTxt = norm(await extractTextInBBox(page, bbREAL));
      const desiTxt = norm(await extractTextInBBox(page, bbDESI));

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

      // compteur BT par technicien (si équipe trouvée)
      for (const m of team) {
        const tech = mapTechByNni(m.nni);
        if (!tech) continue;
        const key = techKey(tech);
        state.countsByTechId.set(key, (state.countsByTechId.get(key) || 0) + 1);
      }

      continue;
    }

    // pages suivantes rattachées au dernier BT
    if (currentBT) {
      const header = norm(await extractTextInBBox(page, bbOBJ));
      const type = detectDocTypeFromHeader(header);
      currentBT.docs.push({ page: p, type });
    }
  }

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  if (state.pdfName) {
    const pagesLiees = state.bts.reduce((a, b) => a + (b.docs?.length || 0), 0);
    setPdfStatus(`${state.pdfName} — ${state.bts.length} BT — ${pagesLiees} pages liées`);
  }
  console.log("[DEMAT-BT] Extraction OK ✅", state.bts.length, "BT");
  renderAll();
}

// -------------------------
// UI: chips types
// -------------------------
function buildTypeChips() {
  const root = $("typeChips");
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
  const root = $("typeChips");
  if (!root) return;
  [...root.querySelectorAll(".chip")].forEach(chip => {
    const t = chip.textContent.trim();
    chip.classList.toggle("chip--active", state.filters.types.has(t));
  });
}

// -------------------------
// UI: select technicien avec compteurs
// -------------------------
function buildTechSelectWithCounts() {
  const sel = $("techSelect");
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
// Filtrage
// -------------------------
function matchesFilters(bt) {
  const q = safeUpper(state.filters.q);
  if (q) {
    const hay = safeUpper([bt.id, bt.objet, bt.client, bt.localisation, bt.datePrevue].join(" "));
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

// -------------------------
// Helpers: docs groupés + ranges BT
// -------------------------
function groupDocs(docs) {
  const out = {};
  for (const d of docs || []) {
    if (!d || !d.type || !d.page) continue;
    if (!out[d.type]) out[d.type] = [];
    out[d.type].push(d.page);
  }
  for (const k of Object.keys(out)) {
    out[k] = [...new Set(out[k])].sort((a, b) => a - b);
  }
  return out;
}

function getBtById(btId) {
  const id = (btId || "").toUpperCase();
  return state.bts.find(b => (b.id || "").toUpperCase() === id) || null;
}

function getBtRange(btId) {
  const bt = getBtById(btId);
  if (!bt) return null;
  const idx = state.bts.findIndex(b => b.id === bt.id);
  const start = bt.pageStart || 1;
  let end = state.totalPages || start;
  if (idx >= 0 && idx < state.bts.length - 1) {
    const next = state.bts[idx + 1];
    if (next?.pageStart) end = Math.max(start, next.pageStart - 1);
  }
  return { start, end };
}

// -------------------------
// Viewer (modal) — PDF render + export BT
// -------------------------
function openViewer({ page = 1, title = "Aperçu", subtitle = "", btId = "", range = null } = {}) {
  const modal = $("modal");
  if (!modal) return;

  state.viewer.isOpen = true;
  state.viewer.page = Math.max(1, Math.min(state.totalPages || 1, page));
  state.viewer.title = title;
  state.viewer.subtitle = subtitle;
  state.viewer.btId = btId || "";
  state.viewer.range = range;

  const t = $("modalTitle");
  const st = $("modalSubtitle");
  if (t) t.textContent = title;
  if (st) st.textContent = subtitle;

  modal.setAttribute("aria-hidden", "false");
  renderViewerPage(state.viewer.page);
  syncViewerButtons();
}

function closeViewer() {
  const modal = $("modal");
  if (!modal) return;
  state.viewer.isOpen = false;
  modal.setAttribute("aria-hidden", "true");
}

async function renderViewerPage(pageNum) {
  if (!state.pdf) return;
  const canvas = $("canvas");
  const info = $("modalInfo");
  if (!canvas) return;

  const page = await state.pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.25 });

  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext("2d", { alpha: false });
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const rangeTxt = state.viewer.range ? ` — BT p.${state.viewer.range.start}→${state.viewer.range.end}` : "";
  if (info) info.textContent = `Page ${pageNum}/${state.totalPages}${rangeTxt}`;
}

function syncViewerButtons() {
  const prev = $("btnPrevPage");
  const next = $("btnNextPage");
  const exp = $("btnExportBt");

  if (prev) prev.disabled = state.viewer.page <= 1;
  if (next) next.disabled = state.viewer.page >= (state.totalPages || 1);
  if (exp) exp.disabled = !state.viewer.btId;
}

async function exportCurrentBt() {
  if (!state.pdfFile) return;
  const btId = state.viewer.btId;
  const range = getBtRange(btId);
  if (!range) return;

  try {
    const srcBytes = await state.pdfFile.arrayBuffer();
    const srcPdf = await PDFLib.PDFDocument.load(srcBytes);
    const outPdf = await PDFLib.PDFDocument.create();

    const pages = [];
    for (let p = range.start; p <= range.end; p++) pages.push(p - 1); // pdf-lib = 0-index

    const copied = await outPdf.copyPages(srcPdf, pages);
    copied.forEach(pg => outPdf.addPage(pg));

    const outBytes = await outPdf.save();
    const blob = new Blob([outBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${btId || "BT"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    console.error(e);
    alert("Export impossible (voir console).\nAstuce: vérifie que pdf-lib est bien chargé.");
  }
}

// -------------------------
// Render KPI
// -------------------------
function renderKpis(filtered) {
  const kpis = $("kpis");
  if (!kpis) return;

  const totalBT = filtered.length;
  const docsCount = filtered.reduce((acc, bt) => acc + (bt.docs?.length || 0), 0);

  kpis.innerHTML = `
    <div class="kpi"><b>${totalBT}</b> BT</div>
    <div class="kpi"><b>${docsCount}</b> pages liées</div>
  `;
}

// -------------------------
// Render Référent (grid)
// -------------------------
function renderReferent(filtered) {
  const grid = $("btGrid");
  if (!grid) return;

  grid.innerHTML = "";
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT à afficher avec ces filtres.</div>`;
    return;
  }

  for (const bt of filtered) {
    const teamTxt = (bt.team || [])
      .map(m => {
        const tech = mapTechByNni(m.nni);
        return tech ? tech.name : m.nni;
      })
      .join(" • ") || "—";

    const docsByType = groupDocs(bt.docs || []);
    const badges = Object.keys(docsByType)
      .sort((a, b) => (a === "BT" ? -1 : b === "BT" ? 1 : a.localeCompare(b)))
      .map(t => {
        const pages = docsByType[t];
        const cls = t === "BT" ? "badge badge--strong" : "badge";
        return `<button class="${cls}" data-action="open-doc" data-bt="${bt.id}" data-type="${t}" data-page="${pages[0]}">
          ${t}${pages.length > 1 ? `:${pages.length}` : ""}
        </button>`;
      })
      .join("");

    const card = document.createElement("div");
    const isSelected = state.selectedBtId === bt.id;
    card.className = `btCard${isSelected ? " btCard--selected" : ""}`;
    card.setAttribute("data-bt", bt.id);

    card.innerHTML = `
      <div class="btTop">
        <div>
          <div class="btId">${bt.id || "BT ?"}</div>
          <div class="btMeta">${bt.objet || ""}</div>
        </div>
        <div class="btActions">
          <button class="btn btn--secondary" data-action="open-bt" data-bt="${bt.id}">📄 Ouvrir</button>
        </div>
      </div>

      <div class="btMeta">
        <div>📅 ${bt.datePrevue || "—"}</div>
        <div>📍 ${bt.localisation || "—"}</div>
        <div>👤 ${bt.client || "—"}</div>
        <div>👥 ${teamTxt}</div>
        ${bt.atNum ? `<div>🧾 ${bt.atNum}</div>` : ""}
      </div>

      <div class="badges" aria-label="Documents">
        ${badges}
      </div>
    `;

    grid.appendChild(card);
  }
}

// -------------------------
// Render Brief (list)
// -------------------------
function renderBrief(filtered) {
  const list = $("briefList");
  const meta = $("briefMeta");
  if (!list) return;

  // brief => doit avoir un technicien sélectionné
  if (!state.filters.techId) {
    if (meta) meta.textContent = "";
    list.innerHTML = `<div class="hint" style="padding:16px;">
      Mode <b>Brief</b> : sélectionne un technicien à gauche.
    </div>`;
    return;
  }

  const techs = window.TECHNICIANS || [];
  const t = techs.find(x => techKey(x) === state.filters.techId);
  if (meta) meta.textContent = t ? t.name : "";

  list.innerHTML = "";
  if (filtered.length === 0) {
    list.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT pour ce technicien avec ces filtres.</div>`;
    return;
  }

  for (const bt of filtered) {
    const docsByType = groupDocs(bt.docs || []);
    const docBtns = Object.keys(docsByType)
      .sort((a, b) => (a === "BT" ? -1 : b === "BT" ? 1 : a.localeCompare(b)))
      .map(t => {
        const pages = docsByType[t];
        return `<button class="docBtn" data-action="open-doc" data-bt="${bt.id}" data-type="${t}" data-page="${pages[0]}">
          ${t}${pages.length > 1 ? ` (${pages.length})` : ""}
        </button>`;
      })
      .join("");

    const item = document.createElement("div");
    const isSelected = state.selectedBtId === bt.id;
    item.className = `briefCard${isSelected ? " btCard--selected" : ""}`;
    item.setAttribute("data-bt", bt.id);

    item.innerHTML = `
      <div class="btTop">
        <div>
          <h3 class="briefTitle" style="margin:0">${bt.id}</h3>
          <div class="briefSub">📅 ${bt.datePrevue || "—"} • 📍 ${bt.localisation || "—"}</div>
        </div>
        <div class="btActions">
          <button class="btn btn--secondary" data-action="open-bt" data-bt="${bt.id}">📄 Ouvrir</button>
        </div>
      </div>

      <div class="btMeta">${bt.objet || ""}</div>
      <div class="btMeta">👤 ${bt.client || "—"} ${bt.atNum ? ` • 🧾 ${bt.atNum}` : ""}</div>

      <div class="briefDocs">
        ${docBtns}
      </div>
    `;

    list.appendChild(item);
  }
}

// -------------------------
// Render global + switch vues
// -------------------------
function setView(view) {
  state.view = view;

  document.body.classList.toggle("flip", view === "brief");

  const vRef = $("viewReferent");
  const vBrief = $("viewBrief");

  if (vRef) vRef.classList.toggle("view--active", view === "referent");
  if (vBrief) vBrief.classList.toggle("view--active", view === "brief");

  // boutons seg
  document.querySelectorAll(".seg__btn[data-view]").forEach(b => {
    b.classList.toggle("seg__btn--active", b.getAttribute("data-view") === view);
  });

  renderAll();
}

function renderAll() {
  buildTechSelectWithCounts();

  const filtered = state.bts.filter(matchesFilters);

  renderKpis(filtered);

  if (state.view === "referent") {
    renderReferent(filtered);
  } else {
    // en brief : filtrage tech obligatoire (sinon message)
    renderBrief(filtered);
  }
}

// -------------------------
// Wiring events
// -------------------------
function wireEvents() {
  // Search
  const search = $("searchInput");
  if (search) {
    search.addEventListener("input", () => {
      state.filters.q = search.value || "";
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

  // View switch
  document.querySelectorAll(".seg__btn[data-view]").forEach(b => {
    b.addEventListener("click", () => {
      setView(b.getAttribute("data-view"));
    });
  });

  // Delegation clics BT/DOC (référent + brief)
  const handleBtClick = (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const btId = btn.getAttribute("data-bt") || "";
    const page = parseInt(btn.getAttribute("data-page") || "", 10);
    const type = btn.getAttribute("data-type") || "";

    if (!btId) return;
    state.selectedBtId = btId;
    renderAll();

    const range = getBtRange(btId);
    const title = action === "open-doc" ? `${btId} — ${type}` : btId;
    const subtitle = (state.pdfName ? state.pdfName + " • " : "") + (range ? `p.${range.start}→${range.end}` : "");

    if (action === "open-bt") {
      openViewer({ page: range?.start || 1, title, subtitle, btId, range });
    }
    if (action === "open-doc") {
      openViewer({ page: Number.isFinite(page) ? page : (range?.start || 1), title, subtitle, btId, range });
    }
  };

  const grid = $("btGrid");
  if (grid) grid.addEventListener("click", handleBtClick);

  const briefList = $("briefList");
  if (briefList) briefList.addEventListener("click", handleBtClick);

  // Modal: close
  document.addEventListener("click", (e) => {
    const close = e.target.closest("[data-close='1']");
    if (!close) return;
    closeViewer();
  });

  // Modal: prev/next/export
  const prev = $("btnPrevPage");
  if (prev) {
    prev.addEventListener("click", async () => {
      state.viewer.page = Math.max(1, state.viewer.page - 1);
      await renderViewerPage(state.viewer.page);
      syncViewerButtons();
    });
  }

  const next = $("btnNextPage");
  if (next) {
    next.addEventListener("click", async () => {
      state.viewer.page = Math.min(state.totalPages || 1, state.viewer.page + 1);
      await renderViewerPage(state.viewer.page);
      syncViewerButtons();
    });
  }

  const exp = $("btnExportBt");
  if (exp) {
    exp.addEventListener("click", exportCurrentBt);
  }

  // Modal: ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.viewer.isOpen) closeViewer();
  });

  // Fullscreen
  const fs = $("btnFullscreen");
  if (fs) {
    fs.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

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
        const loadingTask = window.pdfjsLib.getDocument({ data: buf });
        state.pdf = await loadingTask.promise;
        state.totalPages = state.pdf.numPages;

        console.log("[DEMAT-BT] PDF chargé ✅", state.totalPages, "pages");
        setPdfStatus(`${f.name} — ${state.totalPages} pages`);
        setProgress(0, `PDF chargé (${state.totalPages} pages). Clique sur Extraire.`);
        setExtractEnabled(true);
      } catch (e) {
        console.error(e);
        setPdfStatus("Erreur PDF");
        setProgress(0, "Erreur chargement PDF (voir console).");
        setExtractEnabled(false);
      }
    });
  }

  // Extract
  const btn = $("btnExtract");
  if (btn) {
    btn.addEventListener("click", async () => {
      try {
        if (!state.pdf) { setProgress(0, "Choisis d’abord un PDF."); return; }
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
}

// -------------------------
// Init
// -------------------------
async function init() {
  try {
    setPdfStatus("Aucun PDF chargé");
    setProgress(0, "Prêt.");
    setExtractEnabled(false);

    buildTypeChips();
    wireEvents();

    await loadZones();

    // vue par défaut
    setView("referent");
  } catch (e) {
    console.error(e);
    setZonesStatus("Erreur");
    setProgress(0, "Erreur init (voir console).");
  }
}

document.addEventListener("DOMContentLoaded", init);
