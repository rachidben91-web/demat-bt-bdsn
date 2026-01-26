// app.js
// DEMAT-BT — Extracteur (GitHub Pages, sans serveur)
// - Détection BT par en-tête "BON DE TRAVAIL" + BT\d{11}
// - Association pages: tout ce qui suit un BT est rattaché à ce BT jusqu'au suivant
// - Extraction champs via zones.json (bbox en points)
// - Equipe: UNIQUEMENT via zone REALISATION (NNI + nom) + mapping TECHNICIANS
// - Filtre technicien: uniquement ceux qui ont des BT + compteur

const PDF_JS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_JS_WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const DOC_TYPES = ["BT", "AT", "PROC", "PLAN", "PHOTO", "STREET", "DOC"];

let pdfJsLoaded = false;
let ZONES = null;

const state = {
  pdf: null,
  pdfName: "",
  totalPages: 0,
  bts: [],
  view: "referent",
  countsByTechId: new Map(),
  filters: {
    q: "",
    types: new Set(),
    techId: "", // "" = tous
  },
};

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
  const el = $("progress");
  if (el) el.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
  const txt = $("progressText");
  if (txt) txt.textContent = pct != null ? `${pct}%` : "";
}

// ------------------------------
// PDF.js loader
// ------------------------------
async function loadPdfJs() {
  if (pdfJsLoaded) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PDF_JS_CDN;
    script.onload = () => {
      // eslint-disable-next-line no-undef
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_CDN;
      pdfJsLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ------------------------------
// zones.json loader (GitHub Pages safe)
// ------------------------------
async function loadZones() {
  if (ZONES) return ZONES;
  setZonesStatus("Chargement…");

  const url = new URL("./zones.json", window.location.href);
  url.searchParams.set("v", String(Date.now())); // cache-bust

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`zones.json introuvable (${res.status}). Vérifie le nom et l'emplacement.`);
  }
  ZONES = await res.json();
  setZonesStatus("OK");
  return ZONES;
}

function getZoneBBox(label) {
  if (!ZONES) return null;
  const L = String(label || "").toUpperCase();

  // format attendu : pages.BT.LABEL.bbox
  if (ZONES?.pages?.BT?.[L]?.bbox) return ZONES.pages.BT[L].bbox;

  // autre format (ancien) : zones: [{label,bbox}]
  if (Array.isArray(ZONES?.zones)) {
    const z = ZONES.zones.find((x) => String(x.label || "").toUpperCase() === L);
    return z?.bbox || null;
  }

  return null;
}

// ------------------------------
// Utils texte
// ------------------------------
function norm(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function extractDateFromFilename(filename) {
  const match = String(filename || "").match(/(\d{4})(\d{2})(\d{2})_\d{4}\.pdf$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return "";
}

// ------------------------------
// Extraction texte dans une bbox (coordonnées PDF points)
// pdf.js item.transform => [a,b,c,d,e,f] avec e=x, f=y (origine en bas à gauche)
// bbox: {x0,y0,x1,y1}
// ------------------------------
function itemXY(item) {
  const t = item.transform;
  return { x: t?.[4] ?? 0, y: t?.[5] ?? 0 };
}

function textInBBox(textContent, bbox, padding = 1.5) {
  if (!textContent || !bbox) return "";
  const x0 = Math.min(bbox.x0, bbox.x1) - padding;
  const x1 = Math.max(bbox.x0, bbox.x1) + padding;
  const y0 = Math.min(bbox.y0, bbox.y1) - padding;
  const y1 = Math.max(bbox.y0, bbox.y1) + padding;

  const hits = [];
  for (const it of textContent.items || []) {
    const str = it.str || "";
    if (!str.trim()) continue;

    const { x, y } = itemXY(it);

    // Filtre simple par point d'ancrage
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
      hits.push({ x, y, str });
    }
  }

  // tri pour reconstituer une lecture (haut->bas, gauche->droite)
  hits.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  return norm(hits.map((h) => h.str).join(" "));
}

function parseBtId(text) {
  const m = String(text || "").match(/\bBT\d{11}\b/);
  return m ? m[0] : "";
}

function classifyPage(fullText, isBtPage) {
  const up = String(fullText || "").toUpperCase();
  if (isBtPage) return "BT";
  if (up.includes("FICHE AT") || up.includes("AUTORISATION DE TRAVAIL") || up.includes("AT N°") || up.includes("AT N")) return "AT";
  if (up.includes("PROCÉDURE D'EXÉCUTION") || up.includes("PROCEDURE D'EXECUTION") || up.includes("PROCÉDURE D'EXECUTION")) return "PROC";
  if (up.includes("ECHELLE") && up.includes("1/200")) return "PLAN";
  if (up.includes("GOOGLE") && up.includes("STREET")) return "STREET";

  const compact = up.replace(/\s+/g, "");
  if (compact.length < 140) return "PHOTO";
  return "DOC";
}

// ------------------------------
// TEAM depuis REALISATION (NNI + NOM)
// ------------------------------
function parseTeamFromRealisation(text) {
  // NNI = 1 lettre + 5 chiffres (ex: A94073)
  // Nom = souvent NOM PRENOM ou nom prénom (on récupère proprement)
  const t = norm(text);

  // Ex: "I13252 CISSE MOUSSA" ou "E50275 bentoumi mounir"
  const re = /([A-Z]\d{5})\s+([A-Za-zÀ-ÿ'\- ]{3,60})/g;

  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const nni = (m[1] || "").toUpperCase();
    let name = norm(m[2] || "");

    // coupe si derrière on tombe sur une date ou heure qui s'est collée
    name = name.replace(/\b\d{2}\/\d{2}\/\d{4}\b.*$/i, "").trim();
    name = name.replace(/\b\d{1,2}h\d{2}\b.*$/i, "").trim();

    if (!nni || name.length < 3) continue;
    if (!out.some((x) => x.nni === nni)) out.push({ nni, rawName: name });
  }
  return out;
}

function mapTechByNni(nni) {
  const techs = window.TECHNICIANS || [];
  const N = String(nni || "").toUpperCase();
  return techs.find((t) => String(t.nni || t.id || "").toUpperCase() === N) || null;
}

// ------------------------------
// Extraction champs BT depuis zones
// ------------------------------
function extractFieldsFromZones(textContent) {
  const fields = {};

  const wanted = [
    "OBJET",
    "DATE_PREVUE",
    "CLIENT_NOM",
    "REFERENCE_PDL",
    "DUREE",
    "LOCALISATION",
    "CONTACT_CLIENT",
    "BT_NUM",
    "AT_NUM",
    "REALISATION",
    "DESIGNATION",
    "OBSERVATIONS",
    "COMMENTAIRES_CLIENT",
    "EOTP_OU_CCA",
  ];

  for (const k of wanted) {
    const bb = getZoneBBox(k);
    if (!bb) continue;
    fields[k] = textInBBox(textContent, bb);
  }

  return fields;
}

function parseAtNumber(fields, fullText) {
  // d'abord via zone AT_NUM
  const z = norm(fields?.AT_NUM || "");
  // souvent "AT N°  PR06" ou "PR06"
  let m = z.match(/\b([A-Z]{1,3}\d{1,6})\b/i);
  if (m) return m[1].toUpperCase();

  // fallback global
  const t = String(fullText || "");
  m = t.match(/\bAT\s*(?:N[°\s]*|N\s*)\s*([A-Z]{1,3}\d{1,6})\b/i);
  if (m) return m[1].toUpperCase();

  // autre fallback : "PR06" seul parfois
  m = t.match(/\bPR\d{2,6}\b/i);
  if (m) return m[0].toUpperCase();

  return "";
}

// ------------------------------
// Core: extraction BT + pièces jointes
// ------------------------------
async function extractFromPdf(file) {
  await loadPdfJs();
  await loadZones();

  setStatus("Chargement du PDF…");
  setProgress(5);

  const arrayBuffer = await file.arrayBuffer();
  // eslint-disable-next-line no-undef
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  state.pdf = pdf;
  state.pdfName = file.name;
  state.totalPages = pdf.numPages;
  state.bts = [];

  setPdfStatus(`OK. ${file.name}`);
  setStatus("Analyse des pages…");
  setProgress(10);

  const fileDate = extractDateFromFilename(file.name);

  const bts = [];
  let current = null;

  function finalizeCurrent(endPage) {
    if (!current) return;
    current.endPage = endPage;

    // docs meta
    const labelMap = { BT: "BT", AT: "AT", PROC: "Procédure", PLAN: "Plan", PHOTO: "Photo", STREET: "Street", DOC: "Doc" };

    current.sourcePages = current.pages.map((p) => p.page);
    current.documentsMeta = current.pages.map((p, i) => ({
      key: `P${i + 1}`,
      page: p.page,
      type: p.type,
      label: labelMap[p.type] || "Doc",
    }));
    current.documents = current.documentsMeta.map((d) => `${d.key} • ${d.label}`);

    current.hasAT = current.pages.some((p) => p.type === "AT") || !!current.atNumber;
    current.atPages = current.pages.filter((p) => p.type === "AT").map((p) => p.page);

    bts.push(current);
    current = null;
  }

  const reBt = /\bBT\d{11}\b/g;

  for (let pageNum = 1; pageNum <= state.totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const strings = (textContent.items || []).map((it) => it.str || "");
    const fullText = strings.join("\n");

    const hasBtId = reBt.test(fullText);
    reBt.lastIndex = 0;
    const isBtHeader = /BON\s+DE\s+TRAVAIL/i.test(fullText) && hasBtId;

    if (isBtHeader) {
      finalizeCurrent(pageNum - 1);

      const btId = parseBtId(fullText) || ([...fullText.matchAll(/\bBT\d{11}\b/g)][0]?.[0] || "");

      const fields = extractFieldsFromZones(textContent);

      const objet = norm(fields.OBJET || "");
      const client = norm(fields.CLIENT_NOM || "");
      const adresse = norm(fields.LOCALISATION || "");
      const datePrevue = norm(fields.DATE_PREVUE || "") || fileDate;
      const duree = norm(fields.DUREE || "");
      const pdl = norm(fields.REFERENCE_PDL || "");
      const contact = norm(fields.CONTACT_CLIENT || "");
      const btNum = norm(fields.BT_NUM || btId);

      // TEAM: via REALISATION
      const realTxt = fields.REALISATION || "";
      const teamRaw = parseTeamFromRealisation(realTxt);
      const team = teamRaw
        .map((t) => {
          const tech = mapTechByNni(t.nni);
          return {
            nni: t.nni,
            name: tech?.name || t.rawName,
            techId: tech?.id || tech?.nni || t.nni,
            manager: tech?.manager || "",
            site: tech?.site || "",
          };
        });

      const atNumber = parseAtNumber(fields, fullText);

      current = {
        id: btId || btNum,
        title: objet || "Bon de travail",
        client,
        address: adresse,
        pdl,
        scheduledDate: datePrevue,
        duration: duree,
        phone: contact,
        btNum: btNum || btId,
        atNumber: atNumber || "",
        status: "pending",
        assignedTo: team.map((x) => x.techId).filter(Boolean),
        team,
        designationRaw: norm(fields.DESIGNATION || ""),
        comments: norm(fields.OBSERVATIONS || ""),
        clientComments: norm(fields.COMMENTAIRES_CLIENT || ""),
        eotp: norm(fields.EOTP_OU_CCA || ""),
        startPage: pageNum,
        endPage: pageNum,
        pages: [],
      };
    }

    if (current) {
      const type = classifyPage(fullText, pageNum === current.startPage);
      current.pages.push({ page: pageNum, type });

      // si on tombe sur une page AT après, on essaye d’attraper un numéro AT
      if (!current.atNumber) {
        const tmpAt = parseAtNumber({}, fullText);
        if (tmpAt) current.atNumber = tmpAt;
      }
    }

    if (pageNum % 5 === 0) {
      const pct = 10 + Math.round((pageNum / state.totalPages) * 80);
      setStatus(`Analyse page ${pageNum}/${state.totalPages}…`);
      setProgress(pct);
    }
  }

  finalizeCurrent(state.totalPages);

  state.bts = bts;
  computeCounts();
  setStatus(`Terminé. ${bts.length} BT détecté(s).`);
  setProgress(100);

  renderAll();
}

// ------------------------------
// Counts + filtre techniciens
// ------------------------------
function computeCounts() {
  state.countsByTechId = new Map();
  for (const bt of state.bts) {
    for (const m of bt.team || []) {
      const id = m.techId || m.nni;
      if (!id) continue;
      state.countsByTechId.set(id, (state.countsByTechId.get(id) || 0) + 1);
    }
  }
}

function buildTechSelectWithCounts() {
  const sel = $("techSelect");
  if (!sel) return;

  // options uniquement techniciens qui ont un BT
  const techs = window.TECHNICIANS || [];
  const items = [];

  for (const [techId, count] of state.countsByTechId.entries()) {
    const tech = techs.find((t) => String(t.id || t.nni).toUpperCase() === String(techId).toUpperCase());
    const label = tech?.name || techId;
    items.push({ techId, label, count });
  }

  items.sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label, "fr"));

  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "— Tous —";
  sel.appendChild(optAll);

  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it.techId;
    opt.textContent = `${it.label} (${it.count})`;
    sel.appendChild(opt);
  }

  sel.value = state.filters.techId || "";
}

// ------------------------------
// UI: chips types
// ------------------------------
function syncTypeChipsUI() {
  const root = $("typeChips");
  if (!root) return;
  const buttons = root.querySelectorAll("button.chip");
  buttons.forEach((btn) => {
    const t = btn.dataset.type;
    const active = state.filters.types.has(t);
    btn.classList.toggle("active", active);
  });
}

function buildTypeChips() {
  const root = $("typeChips");
  if (!root) return;

  root.innerHTML = "";
  for (const t of DOC_TYPES) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.dataset.type = t;
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

// ------------------------------
// Filtering
// ------------------------------
function btMatchesFilters(bt) {
  const q = norm(state.filters.q).toLowerCase();
  const types = state.filters.types;
  const techId = state.filters.techId;

  if (q) {
    const blob = [
      bt.id,
      bt.title,
      bt.client,
      bt.address,
      bt.pdl,
      bt.scheduledDate,
      bt.duration,
      (bt.team || []).map((x) => x.name).join(" "),
      (bt.documents || []).join(" "),
    ].join(" ").toLowerCase();
    if (!blob.includes(q)) return false;
  }

  if (types && types.size) {
    const hasAny = (bt.pages || []).some((p) => types.has(p.type));
    if (!hasAny) return false;
  }

  if (techId) {
    const hasTech = (bt.team || []).some((m) => String(m.techId).toUpperCase() === String(techId).toUpperCase());
    if (!hasTech) return false;
  }

  return true;
}

// ------------------------------
// Rendering cards
// ------------------------------
function renderCounters() {
  const elBt = $("countBt");
  const elPages = $("countPages");
  const elAT = $("countAT");
  const elProc = $("countProc");
  const elPlan = $("countPlan");
  const elPhoto = $("countPhoto");
  const elDoc = $("countDoc");

  if (elBt) elBt.textContent = String(state.bts.length);

  const pages = state.bts.reduce((acc, bt) => acc + (bt.pages?.length || 0), 0);
  if (elPages) elPages.textContent = String(pages);

  const sumByType = (type) =>
    state.bts.reduce((acc, bt) => acc + (bt.pages || []).filter((p) => p.type === type).length, 0);

  if (elAT) elAT.textContent = String(sumByType("AT"));
  if (elProc) elProc.textContent = String(sumByType("PROC"));
  if (elPlan) elPlan.textContent = String(sumByType("PLAN"));
  if (elPhoto) elPhoto.textContent = String(sumByType("PHOTO"));
  if (elDoc) elDoc.textContent = String(sumByType("DOC"));
}

function makeBadgeAT(bt) {
  const span = document.createElement("div");
  span.className = "badge-at";
  const txt = bt.atNumber ? `AT ${bt.atNumber}` : "AT";
  span.textContent = txt;
  span.title = bt.atNumber ? `Autorisation de travail: ${bt.atNumber}` : "Autorisation de travail";
  return span;
}

function renderBTList() {
  const root = $("btList");
  if (!root) return;
  root.innerHTML = "";

  const list = state.bts.filter(btMatchesFilters);

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucun BT ne correspond aux filtres.";
    root.appendChild(empty);
    return;
  }

  for (const bt of list) {
    const card = document.createElement("div");
    card.className = "bt-card";

    const header = document.createElement("div");
    header.className = "bt-header";

    const title = document.createElement("div");
    title.className = "bt-title";
    title.textContent = bt.id || "BT";

    header.appendChild(title);

    // badge AT si doc AT présent ou atNumber
    if (bt.hasAT) header.appendChild(makeBadgeAT(bt));

    card.appendChild(header);

    const sub = document.createElement("div");
    sub.className = "bt-sub";
    sub.textContent = `OBJET ${bt.title || ""}`;
    card.appendChild(sub);

    const chips = document.createElement("div");
    chips.className = "bt-docchips";

    // compte par type
    const counts = {};
    for (const p of bt.pages || []) counts[p.type] = (counts[p.type] || 0) + 1;

    // petit résumé chips (BT:1 PROC:2 etc.)
    const order = ["BT", "AT", "PROC", "PLAN", "PHOTO", "STREET", "DOC"];
    for (const t of order) {
      if (!counts[t]) continue;
      const c = document.createElement("span");
      c.className = "mini-chip";
      c.textContent = `${t}:${counts[t]}`;
      chips.appendChild(c);
    }
    card.appendChild(chips);

    const meta = document.createElement("div");
    meta.className = "bt-meta";
    meta.innerHTML = `
      <div>📅 <b>DATE PREVUE</b> ${bt.scheduledDate || "—"} &nbsp;&nbsp; ⏱️ <b>DUREE</b> ${bt.duration || "—"}</div>
      <div>👤 <b>NOM CLIENT</b> ${bt.client || "—"} ${bt.phone ? " • " + bt.phone : ""}</div>
      <div>📍 ${bt.address || "—"}</div>
      <div>👥 ${(bt.team || []).map(x => x.name || x.nni).join(", ") || "—"}</div>
    `;
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "bt-actions";

    const btnPreview = document.createElement("button");
    btnPreview.className = "btn";
    btnPreview.textContent = "Aperçu";
    btnPreview.addEventListener("click", () => openPreview(bt));

    const btnExport = document.createElement("button");
    btnExport.className = "btn primary";
    btnExport.textContent = "Exporter BT";
    btnExport.addEventListener("click", () => exportBtPdf(bt));

    actions.appendChild(btnPreview);
    actions.appendChild(btnExport);

    card.appendChild(actions);

    root.appendChild(card);
  }
}

function renderAll() {
  renderCounters();
  buildTechSelectWithCounts();
  renderBTList();

  // Si vue brief: si un technicien est sélectionné, on garde la liste filtrée (déjà fait par btMatchesFilters)
}

// ------------------------------
// Preview modal
// ------------------------------
async function renderPageToCanvas(pdf, pageNum, canvas) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.2 });
  const ctx = canvas.getContext("2d");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
}

async function openPreview(bt) {
  const modal = $("previewModal");
  const canvas = $("previewCanvas");
  const title = $("previewTitle");
  const sub = $("previewSub");
  const pagesInfo = $("previewPagesInfo");
  const btnPrev = $("previewPrev");
  const btnNext = $("previewNext");
  const btnClose = $("previewClose");
  const btnExport = $("previewExport");

  if (!modal || !canvas) return;

  let idx = 0;
  const pages = bt.sourcePages || [];

  const update = async () => {
    if (!state.pdf) return;
    const pageNum = pages[idx] || bt.startPage;
    if (title) title.textContent = `${bt.id || "BT"} — ${bt.pages?.find(p => p.page === pageNum)?.type || ""}`;
    if (sub) sub.textContent = `${bt.client || ""} ${bt.phone ? " • " + bt.phone : ""} • ${bt.address || ""}`.trim();
    if (pagesInfo) pagesInfo.textContent = `Page ${idx + 1}/${pages.length}`;
    await renderPageToCanvas(state.pdf, pageNum, canvas);
  };

  if (btnPrev) btnPrev.onclick = async () => { idx = Math.max(0, idx - 1); await update(); };
  if (btnNext) btnNext.onclick = async () => { idx = Math.min(pages.length - 1, idx + 1); await update(); };
  if (btnClose) btnClose.onclick = () => { modal.classList.remove("open"); };
  if (btnExport) btnExport.onclick = () => exportBtPdf(bt);

  modal.classList.add("open");
  await update();
}

// ------------------------------
// Export BT PDF (rebuild from pages)
// ------------------------------
async function exportBtPdf(bt) {
  if (!state.pdf) return;

  // Simple export = on ne "recompose" pas un PDF (sans lib dédiée),
  // donc on fait un export image par page via canvas (zip serait mieux plus tard).
  // Ici: on propose juste une solution minimale: ouvrir les pages dans l’aperçu.
  // Tu m’as dit "convivial" — on améliorera ensuite (zip/pdf-lib).

  alert("Export BT: pour l'instant, utilise Aperçu puis imprime/sauvegarde en PDF depuis le navigateur. (On améliorera avec un export PDF propre ensuite.)");
}

// ------------------------------
// Wiring UI
// ------------------------------
function wireUI() {
  const inp = $("pdfInput");
  if (inp) {
    inp.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        setProgress(0);
        setStatus("Initialisation…");
        await extractFromPdf(file);
      } catch (err) {
        console.error(err);
        setStatus("Erreur: " + (err?.message || err));
      }
    });
  }

  const q = $("searchInput");
  if (q) {
    q.addEventListener("input", () => {
      state.filters.q = q.value || "";
      renderAll();
    });
  }

  const sel = $("techSelect");
  if (sel) {
    sel.addEventListener("change", () => {
      state.filters.techId = sel.value || "";
      renderAll();
    });
  }

  const btnReset = $("btnReset");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      state.pdf = null;
      state.pdfName = "";
      state.totalPages = 0;
      state.bts = [];
      state.filters.q = "";
      state.filters.types = new Set();
      state.filters.techId = "";

      if ($("searchInput")) $("searchInput").value = "";
      if ($("techSelect")) $("techSelect").value = "";
      if ($("pdfInput")) $("pdfInput").value = "";

      setPdfStatus("Aucun PDF chargé");
      setStatus("Prêt.");
      setProgress(0);

      buildTypeChips();
      buildTechSelectWithCounts();
      renderBTList();
      renderCounters();
    });
  }

  const btnExtract = $("btnExtract");
  if (btnExtract) {
    btnExtract.addEventListener("click", () => {
      // bouton facultatif: on déclenche juste le file picker
      $("pdfInput")?.click?.();
    });
  }

  // tabs / view
  const btnRef = $("btnViewReferent");
  const btnBrief = $("btnViewBrief");
  const btnFull = $("btnViewFull");

  if (btnRef) btnRef.addEventListener("click", () => { state.view = "referent"; document.body.dataset.view = "referent"; });
  if (btnBrief) btnBrief.addEventListener("click", () => { state.view = "brief"; document.body.dataset.view = "brief"; });
  if (btnFull) btnFull.addEventListener("click", () => { state.view = "full"; document.body.dataset.view = "full"; });
}

// ------------------------------
// Init
// ------------------------------
(async function init() {
  try {
    wireUI();
    setStatus("Prêt.");
    setPdfStatus("Aucun PDF chargé");
    setProgress(0);

    // chips + select (vide au départ)
    buildTypeChips();
    buildTechSelectWithCounts();
    renderCounters();
    renderBTList();

    // preload zones (et surtout: arrêter le "Chargement…" si OK)
    try {
      await loadZones();
    } catch (e) {
      console.error(e);
      setZonesStatus("Erreur (zones.json)");
      setStatus("Erreur zones.json: " + (e?.message || e));
    }
  } catch (e) {
    console.error(e);
    setStatus("Init erreur: " + (e?.message || e));
  }
})();
