/* app.js — DEMAT-BT v2.0 (Version avec modal + viewer)
   Compatible avec TON index.html :
   - Référent:  #viewReferent + #btGrid + #kpis
   - Brief:     #viewBrief + #briefList + #briefMeta
   - Import PDF: input#pdfFile
   - Extraire:   button#btnExtract
   - Modal viewer: #modal avec canvas
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
  layout: "grid", // grid | timeline
  filters: {
    q: "",
    types: new Set(),
    techId: ""
  },
  countsByTechId: new Map(),
  // modal viewer state
  modal: {
    open: false,
    currentBT: null,
    currentPage: 1
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
    .replace(/[']/g, "'")
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
// PDF.js via script tag
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
// Tech select (avec compteurs)
// -------------------------
function buildTechSelectWithCounts() {
  const sel = $("techSelect");
  if (!sel) return;

  const current = sel.value;
  sel.innerHTML = '<option value="">— Tous —</option>';

  const techs = window.TECHNICIANS || [];
  const withBt = techs.filter(t => {
    const cnt = state.countsByTechId.get(techKey(t)) || 0;
    return cnt > 0;
  });

  // tri alpha
  withBt.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  for (const t of withBt) {
    const cnt = state.countsByTechId.get(techKey(t)) || 0;
    const opt = document.createElement("option");
    opt.value = techKey(t);
    opt.textContent = `${t.name} (${cnt} BT)`;
    sel.appendChild(opt);
  }

  // restore selection si encore valide
  if (current && withBt.some(t => techKey(t) === current)) {
    sel.value = current;
  } else {
    sel.value = "";
  }
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
// Render KPI
// -------------------------
function renderKpis(filtered) {
  const kpis = $("kpis");
  if (!kpis) return;

  const totalBT = filtered.length;
  const docsCount = filtered.reduce((acc, bt) => acc + (bt.docs?.length || 0), 0);

  kpis.innerHTML = `
    <div class="kpi"><b>${totalBT}</b> BT</div>
    <div class="kpi"><b>${docsCount}</b> Pages liées</div>
  `;
}

// -------------------------
// Render Référent (grid)
// -------------------------
function renderReferent(filtered) {
  const grid = $("btGrid");
  const timeline = $("btTimeline");
  
  if (!grid || !timeline) return;

  // Show/hide based on layout mode
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

function renderGrid(filtered, grid) {
  grid.innerHTML = "";
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT à afficher avec ces filtres.</div>`;
    return;
  }

  for (const bt of filtered) {
    const teamTxt = (bt.team || []).map(m => {
      const tech = mapTechByNni(m.nni);
      return tech ? tech.name : m.nni;
    }).join(" • ") || "—";

    // Compter les docs par type
    const counts = {};
    for (const d of bt.docs || []) counts[d.type] = (counts[d.type] || 0) + 1;

    const card = document.createElement("div");
    card.className = "card btCard";
    
    // Top section avec ID et badges
    const topDiv = document.createElement("div");
    topDiv.className = "btTop";
    
    const idDiv = document.createElement("div");
    idDiv.className = "btId";
    idDiv.textContent = bt.id || "BT ?";
    
    const badgesDiv = document.createElement("div");
    badgesDiv.className = "badges";
    
    // Créer des badges pour chaque type de doc
    for (const [type, count] of Object.entries(counts)) {
      const badge = document.createElement("span");
      badge.className = type === "BT" ? "badge badge--strong" : "badge";
      badge.textContent = `${type}:${count}`;
      badgesDiv.appendChild(badge);
    }
    
    topDiv.appendChild(idDiv);
    topDiv.appendChild(badgesDiv);
    
    // Meta info
    const metaDiv = document.createElement("div");
    metaDiv.className = "btMeta";
    metaDiv.innerHTML = `
      <div>📅 ${bt.datePrevue || "—"}</div>
      <div>📋 ${bt.objet || "—"}</div>
      <div>👤 ${bt.client || "—"}</div>
      <div>📍 ${bt.localisation || "—"}</div>
      <div>👥 ${teamTxt}</div>
      ${bt.atNum ? `<div>🧾 ${bt.atNum}</div>` : ""}
    `;
    
    // Actions (boutons pour voir les docs)
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "btActions";
    
    // Créer un bouton pour chaque document
    for (const doc of bt.docs || []) {
      const btn = document.createElement("button");
      btn.className = "btn btn--secondary";
      btn.textContent = `${doc.type} (p.${doc.page})`;
      btn.addEventListener("click", () => openModal(bt, doc.page));
      actionsDiv.appendChild(btn);
    }
    
    card.appendChild(topDiv);
    card.appendChild(metaDiv);
    card.appendChild(actionsDiv);
    grid.appendChild(card);
  }
}

function renderTimeline(filtered, timeline) {
  timeline.innerHTML = "";
  
  if (filtered.length === 0) {
    timeline.innerHTML = `<div class="timeline-empty">Aucun BT à afficher avec ces filtres.</div>`;
    return;
  }

  // Définir les heures de travail (8h-18h)
  const hours = [];
  for (let h = 8; h <= 18; h++) {
    hours.push(`${h}h`);
  }

  // Récupérer tous les techniciens qui ont des BT
  const techSet = new Map(); // Map<techId, techName>
  for (const bt of filtered) {
    for (const member of bt.team || []) {
      const tech = mapTechByNni(member.nni);
      if (tech) {
        const key = techKey(tech);
        if (!techSet.has(key)) {
          techSet.set(key, tech.name);
        }
      }
    }
  }

  if (techSet.size === 0) {
    timeline.innerHTML = `<div class="timeline-empty">Aucun technicien trouvé pour ces BT.</div>`;
    return;
  }

  // Trier les techniciens par nom
  const techs = Array.from(techSet.entries()).sort((a, b) => 
    a[1].localeCompare(b[1])
  );

  // Créer la grille
  const grid = document.createElement("div");
  grid.className = "timeline-grid";
  grid.style.gridTemplateColumns = `200px repeat(${hours.length}, 1fr)`;
  grid.style.gridTemplateRows = `50px repeat(${techs.length}, auto)`;

  // Header: coin + heures
  const header = document.createElement("div");
  header.className = "timeline-header";

  const corner = document.createElement("div");
  corner.className = "timeline-corner";
  corner.textContent = "Techniciens";
  header.appendChild(corner);

  for (let i = 0; i < hours.length; i++) {
    const hourCell = document.createElement("div");
    hourCell.className = "timeline-hour";
    hourCell.style.gridColumn = i + 2;
    hourCell.textContent = hours[i];
    header.appendChild(hourCell);
  }

  grid.appendChild(header);

  // Créer une map BT par technicien
  const btsByTech = new Map(); // Map<techId, BT[]>
  for (const bt of filtered) {
    for (const member of bt.team || []) {
      const tech = mapTechByNni(member.nni);
      if (tech) {
        const key = techKey(tech);
        if (!btsByTech.has(key)) {
          btsByTech.set(key, []);
        }
        btsByTech.get(key).push(bt);
      }
    }
  }

  // Lignes: techniciens + cellules
  techs.forEach(([techId, techName], techIdx) => {
    const row = document.createElement("div");
    row.className = "timeline-row";

    // Nom du technicien
    const techCell = document.createElement("div");
    techCell.className = "timeline-tech";
    techCell.style.gridRow = techIdx + 2;
    
    const avatar = document.createElement("div");
    avatar.className = "timeline-tech-avatar";
    avatar.textContent = techName.substring(0, 2).toUpperCase();
    
    const nameDiv = document.createElement("div");
    nameDiv.textContent = techName;
    
    techCell.appendChild(avatar);
    techCell.appendChild(nameDiv);
    row.appendChild(techCell);

    // Cellules pour chaque heure
    const techBTs = btsByTech.get(techId) || [];
    
    // Répartir les BT sur les heures (simple: on les étale sur la journée)
    // Si on a des heures dans les BT, on pourrait les parser, sinon on répartit
    const btsPerHour = Math.ceil(techBTs.length / hours.length);
    
    for (let hourIdx = 0; hourIdx < hours.length; hourIdx++) {
      const cell = document.createElement("div");
      cell.className = "timeline-cell";
      cell.style.gridRow = techIdx + 2;
      cell.style.gridColumn = hourIdx + 2;

      // Ajouter les BT pour cette cellule
      const startIdx = hourIdx * btsPerHour;
      const endIdx = Math.min(startIdx + btsPerHour, techBTs.length);
      const cellBTs = techBTs.slice(startIdx, endIdx);

      for (const bt of cellBTs) {
        // Déterminer le type principal du BT (premier type non-BT, ou BT)
        const mainType = bt.docs.find(d => d.type !== "BT")?.type || "BT";
        
        const btDiv = document.createElement("div");
        btDiv.className = `timeline-bt timeline-bt--${mainType}`;
        
        const idDiv = document.createElement("div");
        idDiv.className = "timeline-bt-id";
        idDiv.textContent = bt.id;
        
        const descDiv = document.createElement("div");
        descDiv.className = "timeline-bt-desc";
        descDiv.textContent = bt.objet || bt.localisation || "—";
        
        btDiv.appendChild(idDiv);
        btDiv.appendChild(descDiv);
        
        btDiv.addEventListener("click", () => openModal(bt, bt.pageStart));
        
        cell.appendChild(btDiv);
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  });

  timeline.appendChild(grid);
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
  if (meta) meta.textContent = t ? `${t.name} — ${filtered.length} BT` : "";

  list.innerHTML = "";
  if (filtered.length === 0) {
    list.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT pour ce technicien avec ces filtres.</div>`;
    return;
  }

  for (const bt of filtered) {
    const card = document.createElement("div");
    card.className = "card briefCard";

    const titleDiv = document.createElement("div");
    titleDiv.className = "briefTitle";
    titleDiv.textContent = bt.id;

    const subDiv = document.createElement("div");
    subDiv.className = "briefSub";
    subDiv.innerHTML = `
      <div>📋 ${bt.objet || "—"}</div>
      <div>📅 ${bt.datePrevue || "—"}</div>
      <div>👤 ${bt.client || "—"}</div>
      <div>📍 ${bt.localisation || "—"}</div>
      ${bt.atNum ? `<div>🧾 ${bt.atNum}</div>` : ""}
    `;

    const docsDiv = document.createElement("div");
    docsDiv.className = "briefDocs";

    // Créer un bouton pour chaque document
    for (const doc of bt.docs || []) {
      const btn = document.createElement("button");
      btn.className = "docBtn";
      btn.textContent = `${doc.type} (p.${doc.page})`;
      btn.addEventListener("click", () => openModal(bt, doc.page));
      docsDiv.appendChild(btn);
    }

    card.appendChild(titleDiv);
    card.appendChild(subDiv);
    card.appendChild(docsDiv);
    list.appendChild(card);
  }
}

// -------------------------
// Modal viewer
// -------------------------
function openModal(bt, pageNum) {
  state.modal.open = true;
  state.modal.currentBT = bt;
  state.modal.currentPage = pageNum;

  const modal = $("modal");
  if (modal) modal.setAttribute("aria-hidden", "false");

  const title = $("modalTitle");
  if (title) title.textContent = `${bt.id} — Page ${pageNum}`;

  const subtitle = $("modalSubtitle");
  if (subtitle) subtitle.textContent = bt.objet || "";

  renderPage(pageNum);
}

function closeModal() {
  state.modal.open = false;
  state.modal.currentBT = null;

  const modal = $("modal");
  if (modal) modal.setAttribute("aria-hidden", "true");
}

async function renderPage(pageNum) {
  if (!state.pdf || pageNum < 1 || pageNum > state.totalPages) return;

  const canvas = $("canvas");
  if (!canvas) return;

  const page = await state.pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2.0 });

  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const info = $("modalInfo");
  if (info) info.textContent = `Page ${pageNum} / ${state.totalPages}`;

  // Update modal title
  const title = $("modalTitle");
  if (title && state.modal.currentBT) {
    title.textContent = `${state.modal.currentBT.id} — Page ${pageNum}`;
  }

  state.modal.currentPage = pageNum;
}

function nextPage() {
  if (!state.modal.open) return;
  const next = state.modal.currentPage + 1;
  if (next <= state.totalPages) {
    renderPage(next);
  }
}

function prevPage() {
  if (!state.modal.open) return;
  const prev = state.modal.currentPage - 1;
  if (prev >= 1) {
    renderPage(prev);
  }
}

// Export BT complet en PDF
async function exportBTPDF() {
  if (!state.modal.currentBT || !window.PDFLib) {
    alert("Impossible d'exporter : pdf-lib non chargé");
    return;
  }

  try {
    const bt = state.modal.currentBT;
    const pages = bt.docs.map(d => d.page);

    // Charger le PDF original
    const arrayBuf = await state.pdfFile.arrayBuffer();
    const pdfDoc = await window.PDFLib.PDFDocument.load(arrayBuf);

    // Créer un nouveau PDF
    const newPdf = await window.PDFLib.PDFDocument.create();

    // Copier les pages du BT
    for (const pageNum of pages) {
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNum - 1]);
      newPdf.addPage(copiedPage);
    }

    // Sauvegarder
    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${bt.id}_export.pdf`;
    a.click();

    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("Erreur export PDF:", e);
    alert("Erreur lors de l'export PDF");
  }
}

// -------------------------
// Render global + switch vues
// -------------------------
function setView(view) {
  state.view = view;

  const vRef = $("viewReferent");
  const vBrief = $("viewBrief");

  if (vRef) vRef.classList.toggle("view--active", view === "referent");
  if (vBrief) vBrief.classList.toggle("view--active", view === "brief");

  // boutons seg
  document.querySelectorAll(".seg__btn[data-view]").forEach(b => {
    b.classList.toggle("seg__btn--active", b.getAttribute("data-view") === view);
  });

  // Toggle flip mode for brief
  if (view === "brief") {
    document.body.classList.add("flip");
  } else {
    document.body.classList.remove("flip");
  }

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

  // Layout switch (grid/timeline)
  document.querySelectorAll(".seg__btn[data-layout]").forEach(b => {
    b.addEventListener("click", () => {
      const layout = b.getAttribute("data-layout");
      state.layout = layout;
      
      // Update button states
      document.querySelectorAll(".seg__btn[data-layout]").forEach(btn => {
        btn.classList.toggle("seg__btn--active", btn.getAttribute("data-layout") === layout);
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
        const loadingTask = window.pdfjsLib.getDocument({ data: buf });
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

  // Extract
  const btn = $("btnExtract");
  if (btn) {
    btn.addEventListener("click", async () => {
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

  // Modal close
  const modal = $("modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close") || e.target.classList.contains("modal__backdrop")) {
        closeModal();
      }
    });
  }

  // Modal navigation
  const btnPrev = $("btnPrevPage");
  if (btnPrev) btnPrev.addEventListener("click", prevPage);

  const btnNext = $("btnNextPage");
  if (btnNext) btnNext.addEventListener("click", nextPage);

  // Modal export
  const btnExport = $("btnExportBt");
  if (btnExport) btnExport.addEventListener("click", exportBTPDF);

  // Fullscreen
  const btnFS = $("btnFullscreen");
  if (btnFS) {
    btnFS.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });
  }

  // Keyboard navigation dans modal
  document.addEventListener("keydown", (e) => {
    if (!state.modal.open) return;
    
    if (e.key === "ArrowLeft") prevPage();
    if (e.key === "ArrowRight") nextPage();
    if (e.key === "Escape") closeModal();
  });
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
