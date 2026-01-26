/* app.js — Gestion des BT
   Version: 5.1.0
   Objectifs:
   - UI cohérente (Référent: cartes/planning, Brief: cartes/timeline)
   - Date/heure temps réel en header
   - Date des BT affichée sous le titre (issue du PDF si détectable)
   - Viewer PDF verrouillé sur le BT (navigation limitée au périmètre du BT)
*/

const APP_VERSION = "5.1.0";

const DOC_TYPES = ["BT", "AT", "PROC", "PLAN", "PHOTO", "STREET", "DOC"];
let ZONES = null;

const AGENCY_START_MIN = 7 * 60 + 30;  // 07:30
const AGENCY_END_MIN = 16 * 60 + 30;   // 16:30
const AGENCY_SPAN_MIN = AGENCY_END_MIN - AGENCY_START_MIN;

const state = {
  pdf: null,
  pdfFile: null,
  pdfName: "",
  totalPages: 0,
  bts: [],
  view: "referent",        // referent | brief
  referentMode: "cards",   // cards | planning
  briefMode: "cards",      // cards | timeline
  selectedBtId: "",
  viewer: {
    open: false,
    btId: "",
    pageMin: 1,
    pageMax: 1,
    page: 1
  },
  filters: {
    q: "",
    types: new Set(),      // selected doc types
    techId: ""             // techKey or empty
  },
  countsByTechId: new Map() // techKey -> count BT
};

// -------------------------
// Helpers DOM
// -------------------------
const $ = (id) => document.getElementById(id);

function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt;
}

function setZonesStatus(msg) { setText("zonesStatus", msg); }
function setPdfStatus(msg) { setText("pdfStatus", msg); }

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
}

function show(el, yes) {
  if (!el) return;
  if (yes) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "true");
}

// -------------------------
// Clock (header center)
// -------------------------
function formatNowDate(d) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function formatNowTime(d) {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function tickClock() {
  const d = new Date();
  setText("nowDate", capitalizeFirst(formatNowDate(d)));
  setText("nowTime", formatNowTime(d));
}
function capitalizeFirst(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// -------------------------
// Zones + pdf.js loader
// -------------------------
async function loadZones() {
  try {
    setZonesStatus("Chargement…");
    const res = await fetch("./zones.json", { cache: "no-store" });
    if (!res.ok) throw new Error("zones.json introuvable");
    ZONES = await res.json();
    setZonesStatus("OK");
  } catch (e) {
    console.error(e);
    setZonesStatus("Erreur");
    throw e;
  }
}

async function ensurePdfJs() {
  if (window.pdfjsLib) return;
  // Chargement dynamique depuis CDN (comme tes versions précédentes)
  const url = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.js";
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  // Worker
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js";
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
}

// -------------------------
// Parsing helpers
// -------------------------
function norm(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function isBTNumber(txt) {
  const t = (txt || "").replace(/\s/g, "");
  return /^BT\d{6,}$/.test(t) || /^\d{10,}$/.test(t);
}

function pickBTId(txt) {
  const t = (txt || "").replace(/\s/g, "");
  if (!t) return "";
  if (t.startsWith("BT")) return t;
  if (/^\d{10,}$/.test(t)) return "BT" + t;
  const m = t.match(/BT\d{6,}/);
  return m ? m[0] : t;
}

function pickATId(txt) {
  const t = (txt || "").replace(/\s/g, "");
  const m = t.match(/AT\d{6,}/i);
  return m ? m[0].toUpperCase() : "";
}

function techKey(tech) {
  return tech ? (tech.id || tech.nni || tech.name) : "";
}

function mapTechByNni(nni) {
  const t = (nni || "").toUpperCase().trim();
  if (!t) return null;
  // technicians.js fournit TECHNICIANS (liste)
  if (!window.TECHNICIANS) return null;
  return window.TECHNICIANS.find(x => (x.nni || "").toUpperCase() === t) || null;
}

function parseTeamFromRealisation(realTxt) {
  // Heuristique: détecte des NNI ou identifiants dans la zone "Réalisation"
  // Format attendu dans technicians.js : { nni, name, id }
  const t = (realTxt || "").toUpperCase();
  const nnIs = [...t.matchAll(/\b[A-Z0-9]{6,10}\b/g)].map(m => m[0]);
  const uniq = Array.from(new Set(nnIs));
  return uniq.slice(0, 5).map(nni => ({ nni }));
}

function getZoneBBox(name) {
  if (!ZONES) return null;
  const z = ZONES.find(x => x.name === name) || null;
  return z ? z.bbox : null;
}

async function extractTextInBBox(page, bbox) {
  if (!bbox) return "";
  const [x0, y0, x1, y1] = bbox;
  const content = await page.getTextContent();
  const items = content.items || [];
  let out = [];
  for (const it of items) {
    const tx = it.transform;
    const x = tx[4];
    const y = tx[5];
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) out.push(it.str);
  }
  return out.join(" ");
}

function detectDocTypeFromHeader(header) {
  const h = (header || "").toUpperCase();
  if (h.includes("AT")) return "AT";
  if (h.includes("PROCED") || h.includes("PROC")) return "PROC";
  if (h.includes("PLAN")) return "PLAN";
  if (h.includes("PHOTO")) return "PHOTO";
  if (h.includes("RUE") || h.includes("STREET")) return "STREET";
  return "DOC";
}

// time parsing
function parseMinutesFromText(txt) {
  const s = (txt || "");
  // 13:45
  let m = s.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  // 7h (rare)
  m = s.match(/\b([01]?\d|2[0-3])\s*h\b/);
  if (m) return parseInt(m[1], 10) * 60;
  return null;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function formatMinToHHMM(min) {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// Category mapping
function categorizeBt(bt) {
  const t = `${bt.objet || ""} ${bt.designation || ""}`.toUpperCase();
  if (/MHS|MISE\s+HORS\s+SERVICE|REMPLACEMENT\s+COMPTEUR|MISE\s+EN\s+SERVICE|MES\b|COMPTEUR|POSTE\s+CLIENT|CLIENT/.test(t)) return { cat: "client", label: "Clientèle" };
  if (/CICM|CI-CM|ROBINET|MAINTENANCE|PREVENTIF|PR[ÉE]VENTIF|CONTROLE\s+ROBINET/.test(t)) return { cat: "maint", label: "Maintenance" };
  if (/ADF|SURVEILLANCE|FUITE|ODEUR|RP\b|RISQUE|SECURITE/.test(t)) return { cat: "surv", label: "Surveillance" };
  if (/ADMIN|FORMATION|REUNION|DIVERS/.test(t)) return { cat: "admin", label: "Administratif" };
  return { cat: "other", label: "Autre" };
}

// planning date (from bt.datePrevue)
function pickPlanningDateLabel() {
  // Essaye de trouver une date dans datePrevue des BT, sinon PDF name
  const candidates = state.bts.map(b => b.datePrevue).filter(Boolean);
  for (const c of candidates) {
    const m = c.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
    if (m) {
      const dd = m[1].padStart(2, "0");
      const mm = m[2].padStart(2, "0");
      const yyyy = m[3].length === 2 ? ("20" + m[3]) : m[3];
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  // fallback: try pdfName
  const n = state.pdfName || "";
  const m2 = n.match(/\b(\d{1,2})[\/\-_.](\d{1,2})[\/\-_.](\d{2,4})\b/);
  if (m2) {
    const dd = m2[1].padStart(2, "0");
    const mm = m2[2].padStart(2, "0");
    const yyyy = m2[3].length === 2 ? ("20" + m2[3]) : m2[3];
    return `${dd}/${mm}/${yyyy}`;
  }
  return "";
}

// -------------------------
// Extraction
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
    setProgress((p - 1) / state.totalPages * 100, `Analyse page ${p}/${state.totalPages}…`);
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
        pageEnd: p, // recalculé après
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

  // pageEnd = jusqu'au BT suivant - 1
  for (let i = 0; i < state.bts.length; i++) {
    const bt = state.bts[i];
    const next = state.bts[i + 1];
    bt.pageEnd = next ? (next.pageStart - 1) : state.totalPages;
  }

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  setText("sidebarHint", state.bts.length ? "Sélectionne une vue et clique sur un BT pour l’ouvrir." : "Aucun BT détecté.");
  renderAll();
}

// -------------------------
// Filters + UI
// -------------------------
function buildTypeChips() {
  const wrap = $("typeChips");
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const t of DOC_TYPES) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = t;
    chip.dataset.type = t;
    chip.addEventListener("click", () => {
      if (state.filters.types.has(t)) state.filters.types.delete(t);
      else state.filters.types.add(t);
      renderAll();
    });
    wrap.appendChild(chip);
  }
  updateTypeChipsUI();
}

function updateTypeChipsUI() {
  const wrap = $("typeChips");
  if (!wrap) return;
  for (const el of wrap.querySelectorAll(".chip")) {
    const t = el.dataset.type;
    if (state.filters.types.has(t)) el.classList.add("chip--on");
    else el.classList.remove("chip--on");
  }
}

function buildTechSelectWithCounts() {
  const sel = $("techSelect");
  if (!sel) return;

  const prev = sel.value || "";

  // Reset options (keep first)
  sel.innerHTML = `<option value="">— Tous —</option>`;

  if (!window.TECHNICIANS) return;

  // build list with counts > 0
  const list = window.TECHNICIANS
    .map(t => ({ tech: t, key: techKey(t), count: state.countsByTechId.get(techKey(t)) || 0 }))
    .filter(x => x.count > 0)
    .sort((a, b) => (a.tech.name || "").localeCompare(b.tech.name || ""));

  for (const it of list) {
    const opt = document.createElement("option");
    opt.value = it.key;
    opt.textContent = `${it.tech.name} (${it.count})`;
    sel.appendChild(opt);
  }

  // restore if possible
  if (prev) sel.value = prev;
}

function matchesFilters(bt) {
  // search
  const q = (state.filters.q || "").toLowerCase().trim();
  if (q) {
    const hay = `${bt.id} ${bt.objet} ${bt.client} ${bt.localisation} ${bt.datePrevue} ${bt.designation}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  // tech filter
  if (state.filters.techId) {
    const team = bt.team || [];
    const ok = team.some(m => {
      const tech = mapTechByNni(m.nni);
      return tech && techKey(tech) === state.filters.techId;
    });
    if (!ok) return false;
  }

  // doc types filter: keep BT if it has at least one doc of selected types
  if (state.filters.types.size > 0) {
    const ok = (bt.docs || []).some(d => state.filters.types.has(d.type));
    if (!ok) return false;
  }

  return true;
}

// -------------------------
// Rendering
// -------------------------
function renderKpis(filtered) {
  const k = $("kpis");
  if (!k) return;
  k.innerHTML = "";

  const total = filtered.length;
  const totalDocs = filtered.reduce((acc, b) => acc + ((b.docs || []).length), 0);

  const k1 = document.createElement("div");
  k1.className = "kpi";
  k1.innerHTML = `<b>${total}</b> BT`;
  const k2 = document.createElement("div");
  k2.className = "kpi";
  k2.innerHTML = `<b>${totalDocs}</b> pages liées`;

  k.appendChild(k1);
  k.appendChild(k2);
}

function renderPlanningLabel() {
  const lbl = $("planningLabel");
  if (!lbl) return;

  if (!state.bts.length) {
    lbl.textContent = "Planification : —";
    return;
  }

  const d = pickPlanningDateLabel();
  const nb = state.bts.length;
  const txt = d ? `Planification du ${d} — ${nb} BT` : `Planification — ${nb} BT`;
  lbl.textContent = txt;
  // also brief
  const bl = $("briefLabel");
  if (bl) bl.textContent = d ? `Données du ${d}. Sélectionne un technicien.` : "Sélectionne un technicien.";
}

function renderReferentCards(filtered) {
  const grid = $("btGrid");
  if (!grid) return;

  grid.innerHTML = "";
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="hint" style="padding:12px;">Aucun BT à afficher avec ces filtres.</div>`;
    return;
  }

  for (const bt of filtered) {
    const cat = categorizeBt(bt);
    const teamTxt = (bt.team || []).map(m => {
      const tech = mapTechByNni(m.nni);
      return tech ? tech.name : m.nni;
    }).join(" • ") || "—";

    const tMin = parseMinutesFromText(bt.datePrevue) ?? parseMinutesFromText(bt.objet) ?? parseMinutesFromText(bt.designation);
    const tLabel = (tMin != null) ? formatMinToHHMM(tMin) : "—";

    const card = document.createElement("div");
    card.className = "btCard";
    card.dataset.cat = cat.cat;
    if (state.selectedBtId === bt.id) card.classList.add("btCard--active");

    // docs counts
    const docsByType = {};
    for (const d of bt.docs || []) docsByType[d.type] = (docsByType[d.type] || 0) + 1;

    const docBtns = [];
    docBtns.push(`<button class="docBtn docBtn--primary" data-action="open-bt" data-btid="${bt.id}">📄 Ouvrir</button>`);
    for (const type of Object.keys(docsByType)) {
      // skip BT (already covered) but keep counts if wanted; we keep as jump to first page of that doc type
      if (type === "BT") continue;
      const first = (bt.docs || []).find(x => x.type === type);
      if (!first) continue;
      docBtns.push(`<button class="docBtn" data-action="open-doc" data-btid="${bt.id}" data-page="${first.page}" data-type="${type}">${type} (${docsByType[type]})</button>`);
    }

    card.innerHTML = `
      <div class="btTop">
        <div class="btId">${bt.id || "BT ?"}</div>
        <div class="badge" data-cat="${cat.cat}">${cat.label}</div>
      </div>
      <div class="btObj">${escapeHtml(bt.objet || "")}</div>
      <div class="btMeta">
        <div class="row">🕒 <b>${tLabel}</b> <span>${escapeHtml(bt.datePrevue || "")}</span></div>
        <div class="row">👤 ${escapeHtml(bt.client || "—")}</div>
        <div class="row">📍 ${escapeHtml(bt.localisation || "—")}</div>
        <div class="row">👥 ${escapeHtml(teamTxt)}</div>
        ${bt.atNum ? `<div class="row">🧾 ${escapeHtml(bt.atNum)}</div>` : ``}
      </div>
      <div class="btActions">${docBtns.join("")}</div>
    `;

    grid.appendChild(card);
  }
}

function renderReferentPlanning(filtered) {
  const wrap = $("planningView");
  const head = $("planningHeader");
  const body = $("planningBody");
  if (!wrap || !head || !body) return;

  // Build header
  head.innerHTML = `
    <div class="left">Techniciens</div>
    <div class="times">
      ${["07:30","09:00","10:30","12:00","14:00","16:30"].map(t => `<div class="timeCell">${t}</div>`).join("")}
    </div>
  `;

  // Group by tech
  const rows = new Map(); // techName -> bts
  for (const bt of filtered) {
    const team = bt.team || [];
    if (!team.length) continue;
    for (const m of team) {
      const tech = mapTechByNni(m.nni);
      if (!tech) continue;
      const name = tech.name;
      if (!rows.has(name)) rows.set(name, []);
      rows.get(name).push(bt);
    }
  }

  const names = Array.from(rows.keys()).sort((a,b)=>a.localeCompare(b));

  body.innerHTML = "";
  if (names.length === 0) {
    body.innerHTML = `<div class="hint" style="padding:12px;">Aucun BT avec technicien associé (ou filtre trop restrictif).</div>`;
    return;
  }

  for (const name of names) {
    const techBts = rows.get(name) || [];
    // order by time
    techBts.sort((a,b)=> (parseMinutesFromText(a.datePrevue)??99999) - (parseMinutesFromText(b.datePrevue)??99999));

    const row = document.createElement("div");
    row.className = "planRow";

    const left = document.createElement("div");
    left.className = "name";
    left.textContent = name;

    const track = document.createElement("div");
    track.className = "track";

    for (const bt of techBts) {
      const cat = categorizeBt(bt);
      const t = parseMinutesFromText(bt.datePrevue) ?? parseMinutesFromText(bt.objet) ?? parseMinutesFromText(bt.designation);
      const start = (t != null) ? t : AGENCY_START_MIN;
      const leftPct = clamp(((start - AGENCY_START_MIN) / AGENCY_SPAN_MIN) * 100, 0, 100);
      const durMin = 75; // durée visuelle standard
      const widthPct = clamp((durMin / AGENCY_SPAN_MIN) * 100, 6, 40);

      const block = document.createElement("div");
      block.className = "planBlock";
      block.dataset.cat = cat.cat;
      block.dataset.btid = bt.id;
      block.style.left = `${leftPct}%`;
      block.style.width = `${widthPct}%`;
      const timeLabel = (t != null) ? formatMinToHHMM(t) : "—";
      block.textContent = `${timeLabel}  ${bt.id}`;
      block.title = `${bt.id}\n${bt.objet || ""}\n${bt.localisation || ""}`;

      block.addEventListener("click", () => openBtInViewer(bt.id, bt.pageStart));

      track.appendChild(block);
    }

    row.appendChild(left);
    row.appendChild(track);
    body.appendChild(row);
  }
}

function renderBriefCards(filtered) {
  const list = $("briefList");
  const meta = $("briefMeta");
  if (!list) return;

  list.innerHTML = "";
  if (!state.filters.techId) {
    list.innerHTML = `<div class="hint" style="padding:12px;">Sélectionne un technicien dans le panneau de gauche.</div>`;
    if (meta) meta.textContent = "";
    return;
  }

  const tech = (window.TECHNICIANS || []).find(t => techKey(t) === state.filters.techId);
  const techName = tech ? tech.name : "—";

  if (meta) meta.innerHTML = `<div class="kpi"><b>${techName}</b></div><div class="kpi"><b>${filtered.length}</b> BT</div>`;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="hint" style="padding:12px;">Aucun BT pour ce technicien avec les filtres actuels.</div>`;
    return;
  }

  // re-use card renderer but in briefList container
  for (const bt of filtered) {
    const cat = categorizeBt(bt);
    const tMin = parseMinutesFromText(bt.datePrevue) ?? parseMinutesFromText(bt.objet) ?? parseMinutesFromText(bt.designation);
    const tLabel = (tMin != null) ? formatMinToHHMM(tMin) : "—";

    const docsByType = {};
    for (const d of bt.docs || []) docsByType[d.type] = (docsByType[d.type] || 0) + 1;

    const docBtns = [];
    docBtns.push(`<button class="docBtn docBtn--primary" data-action="open-bt" data-btid="${bt.id}">📄 Ouvrir</button>`);
    for (const type of Object.keys(docsByType)) {
      if (type === "BT") continue;
      const first = (bt.docs || []).find(x => x.type === type);
      if (!first) continue;
      docBtns.push(`<button class="docBtn" data-action="open-doc" data-btid="${bt.id}" data-page="${first.page}" data-type="${type}">${type} (${docsByType[type]})</button>`);
    }

    const card = document.createElement("div");
    card.className = "btCard";
    card.dataset.cat = cat.cat;
    card.innerHTML = `
      <div class="btTop">
        <div class="btId">${bt.id}</div>
        <div class="badge" data-cat="${cat.cat}">${cat.label}</div>
      </div>
      <div class="btObj">${escapeHtml(bt.objet || "")}</div>
      <div class="btMeta">
        <div class="row">🕒 <b>${tLabel}</b> <span>${escapeHtml(bt.datePrevue || "")}</span></div>
        <div class="row">👤 ${escapeHtml(bt.client || "—")}</div>
        <div class="row">📍 ${escapeHtml(bt.localisation || "—")}</div>
        ${bt.atNum ? `<div class="row">🧾 ${escapeHtml(bt.atNum)}</div>` : ``}
      </div>
      <div class="btActions">${docBtns.join("")}</div>
    `;
    list.appendChild(card);
  }
}

function renderBriefTimeline(filtered) {
  const wrap = $("briefTimeline");
  const head = $("briefPlanningHeader");
  const body = $("briefPlanningBody");
  if (!wrap || !head || !body) return;

  head.innerHTML = `
    <div class="left">Technicien</div>
    <div class="times">
      ${["07:30","09:00","10:30","12:00","14:00","16:30"].map(t => `<div class="timeCell">${t}</div>`).join("")}
    </div>
  `;

  body.innerHTML = "";
  if (!state.filters.techId) {
    body.innerHTML = `<div class="hint" style="padding:12px;">Sélectionne un technicien.</div>`;
    return;
  }

  const tech = (window.TECHNICIANS || []).find(t => techKey(t) === state.filters.techId);
  const name = tech ? tech.name : "—";

  const row = document.createElement("div");
  row.className = "planRow";

  const left = document.createElement("div");
  left.className = "name";
  left.textContent = name;

  const track = document.createElement("div");
  track.className = "track";

  const bts = [...filtered].sort((a,b)=> (parseMinutesFromText(a.datePrevue)??99999) - (parseMinutesFromText(b.datePrevue)??99999));
  for (const bt of bts) {
    const cat = categorizeBt(bt);
    const t = parseMinutesFromText(bt.datePrevue) ?? parseMinutesFromText(bt.objet) ?? parseMinutesFromText(bt.designation);
    const start = (t != null) ? t : AGENCY_START_MIN;
    const leftPct = clamp(((start - AGENCY_START_MIN) / AGENCY_SPAN_MIN) * 100, 0, 100);
    const durMin = 75;
    const widthPct = clamp((durMin / AGENCY_SPAN_MIN) * 100, 6, 50);

    const block = document.createElement("div");
    block.className = "planBlock";
    block.dataset.cat = cat.cat;
    block.dataset.btid = bt.id;
    block.style.left = `${leftPct}%`;
    block.style.width = `${widthPct}%`;
    const timeLabel = (t != null) ? formatMinToHHMM(t) : "—";
    block.textContent = `${timeLabel}  ${bt.id}`;
    block.title = `${bt.id}\n${bt.objet || ""}\n${bt.localisation || ""}`;
    block.addEventListener("click", () => openBtInViewer(bt.id, bt.pageStart));

    track.appendChild(block);
  }

  row.appendChild(left);
  row.appendChild(track);
  body.appendChild(row);
}

function renderAll() {
  updateTypeChipsUI();
  buildTechSelectWithCounts();

  const filtered = state.bts.filter(matchesFilters);

  renderPlanningLabel();
  renderKpis(filtered);

  // Views
  const grid = $("btGrid");
  const planning = $("planningView");
  if (state.view === "referent") {
    if (state.referentMode === "cards") {
      if (grid) grid.style.display = "";
      if (planning) show(planning, false);
      renderReferentCards(filtered);
    } else {
      if (grid) grid.style.display = "none";
      if (planning) show(planning, true);
      renderReferentPlanning(filtered);
    }
  } else {
    // brief
    const list = $("briefList");
    const tl = $("briefTimeline");
    if (state.briefMode === "cards") {
      if (list) list.style.display = "";
      if (tl) show(tl, false);
      renderBriefCards(filtered);
    } else {
      if (list) list.style.display = "none";
      if (tl) show(tl, true);
      renderBriefTimeline(filtered);
    }
  }

  // Update planning label etc even without data
}

// -------------------------
// Viewer (locked to BT range)
// -------------------------
function openModal() {
  const modal = $("modal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "false");
  state.viewer.open = true;
}
function closeModal() {
  const modal = $("modal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  state.viewer.open = false;
}

async function renderViewerPage(pageNum) {
  if (!state.pdf) return;
  const canvas = $("pdfCanvas");
  if (!canvas) return;

  const page = await state.pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.6 });

  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  state.viewer.page = pageNum;

  const within = pageNum - state.viewer.pageMin + 1;
  const total = state.viewer.pageMax - state.viewer.pageMin + 1;

  setText("modalPill", `Page ${within} / ${total} (BT)`);
  setText("modalSub", `Pages ${state.viewer.pageMin} → ${state.viewer.pageMax} dans le PDF`);
}

function getBtById(id) {
  return state.bts.find(b => b.id === id) || null;
}

function openBtInViewer(btId, preferredPage) {
  const bt = getBtById(btId);
  if (!bt || !state.pdf) return;

  state.selectedBtId = btId;

  state.viewer.btId = btId;
  state.viewer.pageMin = bt.pageStart;
  state.viewer.pageMax = bt.pageEnd;
  state.viewer.page = clamp(preferredPage || bt.pageStart, bt.pageStart, bt.pageEnd);

  setText("modalTitle", btId);
  openModal();
  renderViewerPage(state.viewer.page);
  renderAll(); // highlight selected card
}

async function goPrev() {
  const p = state.viewer.page - 1;
  if (p < state.viewer.pageMin) return;
  await renderViewerPage(p);
}
async function goNext() {
  const p = state.viewer.page + 1;
  if (p > state.viewer.pageMax) return;
  await renderViewerPage(p);
}

async function exportBt() {
  // Optional: requires PDFLib
  if (!window.PDFLib) {
    alert("Export BT : PDFLib non chargé. (Option à activer si besoin)");
    return;
  }
  try {
    const bt = getBtById(state.viewer.btId);
    if (!bt || !state.pdfFile) return;

    const { PDFDocument } = window.PDFLib;
    const srcBytes = await state.pdfFile.arrayBuffer();
    const src = await PDFDocument.load(srcBytes);
    const out = await PDFDocument.create();

    const pages = [];
    for (let p = bt.pageStart; p <= bt.pageEnd; p++) pages.push(p - 1); // 0-index
    const copied = await out.copyPages(src, pages);
    copied.forEach(pg => out.addPage(pg));

    const bytes = await out.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bt.id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert("Erreur export BT (voir console).");
  }
}

// -------------------------
// Events
// -------------------------
function setView(view) {
  state.view = view;

  // toggle views
  const vr = $("viewReferent");
  const vb = $("viewBrief");
  if (vr) vr.classList.toggle("view--active", view === "referent");
  if (vb) vb.classList.toggle("view--active", view === "brief");

  // seg buttons
  document.querySelectorAll(".seg__btn").forEach(btn => {
    btn.classList.toggle("seg__btn--active", btn.dataset.view === view);
  });

  renderAll();
}

function setReferentMode(mode) {
  state.referentMode = mode;
  document.querySelectorAll('[data-rview]').forEach(b => {
    b.classList.toggle("viewBtn--active", b.dataset.rview === mode);
  });
  renderAll();
}

function setBriefMode(mode) {
  state.briefMode = mode;
  document.querySelectorAll('[data-bview]').forEach(b => {
    b.classList.toggle("viewBtn--active", b.dataset.bview === mode);
  });
  renderAll();
}

function escapeHtml(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function wireEvents() {
  // Seg (views)
  document.querySelectorAll(".seg__btn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Referent mode toggle
  document.querySelectorAll("[data-rview]").forEach(btn => {
    btn.addEventListener("click", () => setReferentMode(btn.dataset.rview));
  });

  // Brief mode toggle
  document.querySelectorAll("[data-bview]").forEach(btn => {
    btn.addEventListener("click", () => setBriefMode(btn.dataset.bview));
  });

  // Search
  const s = $("searchInput");
  if (s) {
    s.addEventListener("input", () => {
      state.filters.q = s.value || "";
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

  // Fullscreen
  const fs = $("btnFullscreen");
  if (fs) {
    fs.addEventListener("click", () => {
      const el = document.documentElement;
      if (!document.fullscreenElement) el.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
  }

  // PDF import
  const input = $("pdfFile");
  if (input) {
    input.addEventListener("change", async (ev) => {
      const f = ev.target.files?.[0];
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

        setProgress(0, `PDF chargé (${state.totalPages} pages).`);
        setExtractEnabled(true);
        setText("sidebarHint", "Clique sur Extraire pour détecter les BT.");
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

  // Delegate clicks for doc buttons
  document.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const act = target.getAttribute("data-action");
    if (!act) return;
    const btId = target.getAttribute("data-btid") || "";
    if (!btId) return;

    if (act === "open-bt") {
      const bt = getBtById(btId);
      if (bt) openBtInViewer(btId, bt.pageStart);
    }

    if (act === "open-doc") {
      const page = parseInt(target.getAttribute("data-page") || "", 10);
      if (Number.isFinite(page)) openBtInViewer(btId, page);
    }
  });

  // Modal close / backdrop
  const modal = $("modal");
  if (modal) {
    modal.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.getAttribute("data-close") === "1") closeModal();
    });
  }
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && state.viewer.open) closeModal();
  });

  const prev = $("btnPrevPage");
  const next = $("btnNextPage");
  const exp = $("btnExportBt");
  if (prev) prev.addEventListener("click", goPrev);
  if (next) next.addEventListener("click", goNext);
  if (exp) exp.addEventListener("click", exportBt);
}

// -------------------------
// Init
// -------------------------
async function init() {
  try {
    tickClock();
    setInterval(tickClock, 30 * 1000);

    setPdfStatus("Aucun PDF chargé");
    setProgress(0, "Prêt.");
    setExtractEnabled(false);

    buildTypeChips();
    wireEvents();

    await loadZones();

    // Default view/modes
    setView("referent");
    setReferentMode("cards");
    setBriefMode("cards");

    renderPlanningLabel();
  } catch (e) {
    console.error(e);
    setZonesStatus("Erreur");
    setProgress(0, "Erreur init (voir console).");
  }
}

document.addEventListener("DOMContentLoaded", init);
