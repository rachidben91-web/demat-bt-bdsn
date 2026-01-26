/* app.js
   DEMAT-BT — Extracteur (GitHub Pages, sans serveur)
   - Chargement zones.json
   - Import PDF via input#pdfFile
   - Bouton Extraire via #btnExtract (activé quand PDF OK)
*/

const PDF_JS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_JS_WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const DOC_TYPES = ["BT", "AT", "PROC", "PLAN", "PHOTO", "STREET", "DOC"];

// État global
let ZONES = null;

const state = {
  pdf: null,
  pdfFile: null,
  pdfName: "",
  totalPages: 0,
  bts: [],
  view: "referent",
  filters: {
    q: "",
    types: new Set(),
    techId: ""
  },
  countsByTechId: new Map()
};

// Helpers DOM
const $ = (id) => document.getElementById(id);

// Elements (IDs attendus)
function elZonesStatus() { return $("zonesStatus"); }
function elPdfStatus() { return $("pdfStatus"); }
function elProgMsg() { return $("progMsg"); }
function elProgBar() { return $("progBar"); }
function elSearch() { return $("searchInput"); }
function elTypeChips() { return $("typeChips"); }
function elTechSelect() { return $("techSelect"); }
function elResults() { return $("results"); }

function elBtnExtract() { return $("btnExtract"); }
function elPdfInput() { return $("pdfFile"); }

// UI
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
  btn.classList.toggle("is-disabled", !enabled);
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

  // Worker
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_CDN;
}

async function loadZones() {
  try {
    setZonesStatus("Chargement...");
    const url = `./zones.json?v=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("zones.json introuvable (404). Vérifie le nom et l’emplacement.");
    ZONES = await res.json();
    setZonesStatus("OK");
    console.log("[DEMAT-BT] zones.json chargé ✅", ZONES);
    return ZONES;
  } catch (e) {
    console.error(e);
    setZonesStatus("Erreur zones.json");
    throw e;
  }
}

// -------------------------
// Zones utils (bbox)
// -------------------------
function getZoneBBox(label) {
  // support 2 formats :
  // - { pages: { BT: { LABEL: { bbox: {...} } } } }
  // - { zones: [ {label, bbox} ] } (fallback)
  if (!ZONES) return null;

  // format pages.BT
  try {
    const bb = ZONES.pages?.BT?.[label]?.bbox;
    if (bb) return bb;
  } catch {}

  // fallback format zones[]
  if (Array.isArray(ZONES.zones)) {
    const z = ZONES.zones.find(x => (x.label || "").toUpperCase() === label.toUpperCase());
    if (z?.bbox) return z.bbox;
  }

  return null;
}

function norm(s) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[’]/g, "'")
    .trim();
}

// -------------------------
// PDF text extraction by bbox
// -------------------------
async function extractTextInBBox(page, bbox) {
  if (!bbox) return "";

  // pdf.js coords: item.transform[4]=x, [5]=y in PDF points (origin bottom-left)
  const tc = await page.getTextContent();
  const items = tc.items || [];

  const x0 = bbox.x0, x1 = bbox.x1;
  const y0 = bbox.y0, y1 = bbox.y1;

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

  // tri visuel (du haut vers le bas, puis gauche-droite)
  picked.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  return norm(picked.map(p => p.str).join(" "));
}

function parseTeamFromRealisation(text) {
  // Pattern NNI : 1 lettre + 5 chiffres (ex: A94073)
  // Dans la zone REALISATION, on a en général "A94073 NOM PRENOM"
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

// -------------------------
// Detection BT + association docs
// -------------------------
function isBTNumber(text) {
  return /BT\d{8,14}/i.test(text || "");
}

function detectDocTypeFromPageText(text) {
  const up = (text || "").toUpperCase();
  if (up.includes("AT N") || up.includes("AUTORISATION DE TRAVAIL")) return "AT";
  if (up.includes("PROC") || up.includes("PROCEDURE") || up.includes("ORDONNANCEMENT")) return "PROC";
  if (up.includes("PLAN") || up.includes("PLANS")) return "PLAN";
  if (up.includes("PHOTO") || up.includes("PHOTOS")) return "PHOTO";
  if (up.includes("STREET") || up.includes("STREETVIEW") || up.includes("GOOGLE")) return "STREET";
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

    // On détecte début BT via la zone BT_NUM
    const btNumTxt = norm(await extractTextInBBox(page, bbBTNUM));
    const isBtPage = isBTNumber(btNumTxt);

    if (isBtPage) {
      // Nouvelle fiche BT
      const objet = norm(await extractTextInBBox(page, bbOBJ));
      const datePrevue = norm(await extractTextInBBox(page, bbDATE));
      const client = norm(await extractTextInBBox(page, bbCLIENT));
      const loc = norm(await extractTextInBBox(page, bbLOC));
      const atNum = norm(await extractTextInBBox(page, bbAT));

      const realTxt = norm(await extractTextInBBox(page, bbREAL));
      const team = parseTeamFromRealisation(realTxt);

      const desiTxt = norm(await extractTextInBBox(page, bbDESI));

      currentBT = {
        id: (btNumTxt.match(/BT\d{8,14}/i) || [""])[0].toUpperCase(),
        pageStart: p,
        objet,
        datePrevue,
        client,
        localisation: loc,
        atNum: (atNum.match(/AT\d{3,}/i) || [""])[0].toUpperCase(),
        team,            // basé UNIQUEMENT sur REALISATION
        designation: desiTxt,
        docs: []         // pages associées
      };

      // La page BT elle-même est un doc BT
      currentBT.docs.push({ page: p, type: "BT" });
      state.bts.push(currentBT);

      // Comptage par NNI
      for (const member of team) {
        const tech = mapTechByNni(member.nni);
        if (!tech) continue;
        const key = tech.id || tech.nni;
        state.countsByTechId.set(key, (state.countsByTechId.get(key) || 0) + 1);
      }

      continue;
    }

    // Pages après BT => attachées au BT courant
    if (currentBT) {
      // petite extraction "haut de page" : on prend OBJET si dispo, sinon texte complet light
      const headerTxt = norm(await extractTextInBBox(page, bbOBJ)) || "";
      const type = detectDocTypeFromPageText(headerTxt);
      currentBT.docs.push({ page: p, type });
    }
  }

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  renderAll();
}

// -------------------------
// UI rendering minimal (liste)
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
      renderAll();
      syncTypeChipsUI();
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

  // On veut UNIQUEMENT les techs qui ont des BT
  const techs = window.TECHNICIANS || [];
  const items = [];

  for (const t of techs) {
    const key = t.id || t.nni;
    const c = state.countsByTechId.get(key) || 0;
    if (c > 0) items.push({ ...t, count: c });
  }

  items.sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, "fr"));

  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "— Tous —";
  sel.appendChild(optAll);

  for (const t of items) {
    const opt = document.createElement("option");
    opt.value = t.id || t.nni;
    opt.textContent = `${t.name} (${t.count})`;
    sel.appendChild(opt);
  }
}

function matchesFilters(bt) {
  // search
  const q = norm(state.filters.q).toUpperCase();
  if (q) {
    const hay = norm([
      bt.id, bt.objet, bt.client, bt.localisation, bt.datePrevue
    ].join(" ")).toUpperCase();
    if (!hay.includes(q)) return false;
  }

  // types
  if (state.filters.types.size > 0) {
    const typesInBt = new Set(bt.docs.map(d => d.type));
    let ok = false;
    for (const t of state.filters.types) {
      if (typesInBt.has(t)) { ok = true; break; }
    }
    if (!ok) return false;
  }

  // tech filter
  if (state.filters.techId) {
    const wanted = state.filters.techId;
    const has = (bt.team || []).some(m => {
      const tech = mapTechByNni(m.nni);
      const key = tech ? (tech.id || tech.nni) : null;
      return key === wanted;
    });
    if (!has) return false;
  }

  return true;
}

function renderAll() {
  buildTechSelectWithCounts();

  const root = elResults();
  if (!root) return;

  root.innerHTML = "";

  const filtered = state.bts.filter(matchesFilters);

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

    const meta = document.createElement("div");
    meta.className = "bt_meta";
    meta.innerHTML = `
      <div>📅 ${bt.datePrevue || "—"}</div>
      <div>👤 ${bt.client || "—"}</div>
      <div>📍 ${bt.localisation || "—"}</div>
      <div>👥 ${(bt.team || []).map(m => `${m.nni}`).join(", ") || "—"}</div>
      <div>${bt.atNum ? `🧾 ${bt.atNum}` : ""}</div>
    `;
    card.appendChild(meta);

    const chips = document.createElement("div");
    chips.className = "bt_docchips";
    const counts = {};
    for (const d of bt.docs) counts[d.type] = (counts[d.type] || 0) + 1;
    chips.innerHTML = Object.keys(counts).map(t => `<span class="mini_chip">${t}:${counts[t]}</span>`).join(" ");
    card.appendChild(chips);

    root.appendChild(card);
  }
}

// -------------------------
// Wiring (IMPORT + EXTRACT)
// -------------------------
function wireEvents() {
  // Search
  const search = elSearch();
  if (search) {
    search.addEventListener("input", (e) => {
      state.filters.q = e.target.value || "";
      renderAll();
    });
  }

  // Tech select
  const sel = elTechSelect();
  if (sel) {
    sel.addEventListener("change", () => {
      state.filters.techId = sel.value || "";
      renderAll();
    });
  }

  // PDF input
  const input = elPdfInput();
  if (!input) {
    console.warn("[DEMAT-BT] input#pdfFile introuvable.");
  } else {
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

        setProgress(0, `PDF chargé (${state.totalPages} pages).`);
        setExtractEnabled(true);
        console.log("[DEMAT-BT] PDF chargé ✅", state.totalPages, "pages");
      } catch (err) {
        console.error(err);
        setPdfStatus("Erreur PDF");
        setProgress(0, "Erreur chargement PDF (voir console).");
        setExtractEnabled(false);
      }
    });
  }

  // Extract button
  const btn = elBtnExtract();
  if (!btn) {
    console.warn("[DEMAT-BT] bouton #btnExtract introuvable.");
  } else {
    btn.addEventListener("click", async () => {
      try {
        if (!state.pdf) {
          setProgress(0, "Choisis d’abord un PDF.");
          return;
        }
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

    await loadZones();
  } catch (e) {
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", init);
