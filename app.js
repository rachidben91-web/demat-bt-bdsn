// app.js
// DEMAT-BT — Extracteur (GitHub Pages, sans serveur)
// Version: 1.0.7

// -------------------------------
// CDN libs (si jamais on doit charger dynamiquement)
// -------------------------------
const PDF_JS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_JS_WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const DOC_TYPES = ["BT", "AT", "PROC", "PLAN", "PHOTO", "STREET", "DOC"];

let pdfJsLoaded = false;
let ZONES = null;

// -------------------------------
// State
// -------------------------------
const state = {
  pdfFile: null,          // File
  pdfName: "",            // string
  totalPages: 0,
  bts: [],
  view: "referent",
  countsByTechId: new Map(),
  filters: {
    q: "",
    types: new Set(),     // vide = pas de filtre
    techId: ""            // "" = tous
  }
};

// -------------------------------
// DOM helpers
// -------------------------------
const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg || "";
}

function setZonesStatus(msg) {
  const el = $("zonesStatus");
  if (el) el.textContent = msg || "";
}

function setPdfStatus(msg) {
  const el = $("pdfStatus");
  if (el) el.textContent = msg || "";
}

function setProgress(pct) {
  const bar = $("progressBar");
  if (!bar) return;
  bar.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
}

function safeText(v) {
  return (v ?? "").toString().trim();
}

// -------------------------------
// pdf.js loader
// -------------------------------
async function loadPdfJs() {
  if (pdfJsLoaded) return true;

  // Si pdfjsLib est déjà présent (chargé via index.html), parfait.
  if (window.pdfjsLib) {
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_CDN;
    } catch {}
    pdfJsLoaded = true;
    return true;
  }

  // Sinon, on le charge dynamiquement
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PDF_JS_CDN;
    s.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_CDN;
      } catch {}
      pdfJsLoaded = true;
      resolve();
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });

  return true;
}

// -------------------------------
// Zones loader
// -------------------------------
async function loadZones() {
  if (ZONES) return ZONES;

  try {
    // cache-buster pour GitHub Pages
    const res = await fetch(`./zones.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`zones.json introuvable (${res.status}).`);
    ZONES = await res.json();
    setZonesStatus("OK");
    console.log("[DEMAT-BT] zones.json chargé ✅", ZONES);
    return ZONES;
  } catch (e) {
    console.error("[DEMAT-BT] Erreur zones.json ❌", e);
    setZonesStatus("Erreur zones.json");
    throw e;
  }
}

// Adaptation à TON format actuel: pages.BT.LABEL.bbox
function getZoneBBox(label) {
  try {
    if (!ZONES) return null;
    const bb = ZONES?.pages?.BT?.[label]?.bbox;
    if (!bb) return null;
    // bb = {x0,y0,x1,y1}
    return [bb.x0, bb.y0, bb.x1, bb.y1];
  } catch {
    return null;
  }
}

// -------------------------------
// File picker : ultra robuste
// -------------------------------
function findFileInput() {
  // 1) ids connus (si tu en as)
  const byId =
    $("pdfFile") ||
    $("pdfInput") ||
    $("fileInput") ||
    $("inputPdf") ||
    $("pdf");
  if (byId && byId.type === "file") return byId;

  // 2) sinon on prend le premier <input type="file">
  const any = document.querySelector('input[type="file"]');
  if (any) return any;

  return null;
}

function hookPicker() {
  const input = findFileInput();
  if (!input) {
    console.warn("[DEMAT-BT] Aucun input[type=file] trouvé.");
    return;
  }

  // On force accept PDF
  try { input.accept = "application/pdf,.pdf"; } catch {}

  // IMPORTANT : on enlève d’éventuels anciens listeners en clonant l’élément
  const cloned = input.cloneNode(true);
  input.parentNode.replaceChild(cloned, input);

  cloned.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    console.log("[DEMAT-BT] PDF choisi :", file);
    if (!file) return;

    state.pdfFile = file;
    state.pdfName = file.name || "PDF";
    setPdfStatus(state.pdfName);
    setStatus("PDF chargé. Lancement extraction…");
    setProgress(1);

    // auto-extract
    try {
      await extractAll();
    } catch (err) {
      console.error("[DEMAT-BT] extraction error", err);
      setStatus("Erreur extraction (voir Console).");
      setProgress(0);
    }
  });

  console.log("[DEMAT-BT] File picker hook OK ✅");
}

// Bouton “Importer PDF du jour” : déclenche le file input
function hookImportButton() {
  const btn =
    $("btnPickPdf") ||
    $("btnImport") ||
    $("btnImporter") ||
    document.querySelector('button[data-action="import"]') ||
    document.querySelector("button#import") ||
    null;

  const input = findFileInput();

  if (!btn || !input) {
    console.warn("[DEMAT-BT] bouton import ou input file introuvable.", { btn, input });
    return;
  }

  btn.addEventListener("click", () => {
    console.log("[DEMAT-BT] Click Import → ouverture picker");
    input.click();
  });
}

// Bouton “Extraire” : lance extraction si PDF déjà choisi
function hookExtractButton() {
  const btn =
    $("btnExtract") ||
    $("btnExtraire") ||
    document.querySelector('button[data-action="extract"]') ||
    null;

  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!state.pdfFile) {
      setStatus("Choisis d’abord un PDF.");
      return;
    }
    setStatus("Extraction en cours…");
    try {
      await extractAll();
    } catch (e) {
      console.error(e);
      setStatus("Erreur extraction (voir Console).");
    }
  });
}

// -------------------------------
// Extraction (placeholder: garde ta logique existante si tu avais déjà)
// Ici je laisse une extraction minimaliste pour ne PAS casser ton app.
// Branche ton code existant d’analyse BT/pages ici.
// -------------------------------
async function extractAll() {
  await loadZones();
  await loadPdfJs();

  if (!state.pdfFile) throw new Error("Aucun PDF sélectionné.");

  // Ouvre le PDF
  const arrayBuffer = await state.pdfFile.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  state.totalPages = pdf.numPages;

  console.log("[DEMAT-BT] PDF ouvert ✅ pages:", state.totalPages);

  // 💡 Ici tu remets TON extraction complète.
  // Pour éviter “rien ne se passe”, on met au moins une progression visible.
  setProgress(5);

  // Exemple: juste lire la page 1 texte (test)
  const p1 = await pdf.getPage(1);
  const tc = await p1.getTextContent();
  const raw = tc.items.map(it => it.str).join(" ").replace(/\s+/g, " ").trim();
  console.log("[DEMAT-BT] texte page1 (debug) :", raw.slice(0, 200), "…");

  setProgress(100);
  setStatus(`OK — PDF chargé (${state.totalPages} pages). (Extraction complète à brancher ici)`);
}

// -------------------------------
// UI init (chips / selects) — si tu as déjà ces fonctions ailleurs, laisse.
// Ici on ne casse rien : on protège si les éléments n’existent pas.
// -------------------------------
function buildTypeChips() {
  const root = $("typeChips");
  if (!root) return;
  root.innerHTML = "";
  DOC_TYPES.forEach(t => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = t;
    btn.addEventListener("click", () => {
      if (state.filters.types.has(t)) state.filters.types.delete(t);
      else state.filters.types.add(t);
      // renderAll(); // si tu as une fonction de rendu
    });
    root.appendChild(btn);
  });
}

// -------------------------------
// Init
// -------------------------------
(async function init() {
  try {
    setZonesStatus("Chargement…");
    setPdfStatus("Aucun PDF chargé");
    setStatus("Prêt.");
    setProgress(0);

    await loadZones(); // affiche OK si bon

    // Branchements robustes
    hookPicker();
    hookImportButton();
    hookExtractButton();

    buildTypeChips();

    console.log("[DEMAT-BT] init OK ✅");
  } catch (e) {
    console.error("[DEMAT-BT] init error ❌", e);
    setStatus("Init erreur (voir Console).");
  }
})();
