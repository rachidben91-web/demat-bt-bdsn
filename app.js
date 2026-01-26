// app.js
// DEMAT-BT — Extracteur (GitHub Pages, sans serveur)
// - Détection BT par en-tête "BON DE TRAVAIL" + BT\d{11}
// - Association pages: tout ce qui suit un BT jusqu'au suivant
// - Extraction champs par zones.json (bbox en points)
// - Équipe: UNIQUEMENT via zone REALISATION (NNI + nom) + mapping sur TECHNICIANS
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
    types: new Set(),         // si vide -> pas de filtre type
    techId: ""                // "" = tous
  }
};

// -----------------------------
// Helpers DOM
// -----------------------------
const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg || "";
}

function setProgress(pct) {
  const el = $("progress");
  if (!el) return;
  el.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
}

function esc(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const it of arr || []) {
    const k = keyFn(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

// -----------------------------
// pdf.js loader
// -----------------------------
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

// -----------------------------
// Zones loader
// -----------------------------
async function loadZones() {
  try {
    if (ZONES) return ZONES;

    setStatus("Chargement des zones…");

    const url = `./zones.json?v=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`zones.json introuvable (HTTP ${res.status}) — URL: ${url}`);
    }

    ZONES = await res.json();

    // Mini check : le JSON doit contenir pages.BT
    if (!ZONES?.pages?.BT) {
      throw new Error("zones.json chargé mais format inattendu (attendu: pages.BT...)");
    }

    setStatus("Zones chargées ✔️");
    return ZONES;
  } catch (err) {
    console.error("Erreur loadZones():", err);
    setStatus("Erreur zones: " + (err?.message || err));
    throw err;
  }
}

function getZoneBBox(label) {
  // On attend un format avec zones: [{label, bbox:{x0,y0,x1,y1}}...]
  // ou un format template/pages… -> fallback simple
  if (!ZONES) return null;
  if (Array.isArray(ZONES.zones)) {
    const z = ZONES.zones.find(x => (x.label || "").toUpperCase() === label.toUpperCase());
    return z?.bbox || null;
  }
  // format alternatif (template/pages)
  try {
    const bb = ZONES.pages?.BT?.[label]?.bbox;
    return bb || null;
  } catch {
    return null;
  }
}

// -----------------------------
// Page text extraction with bbox (pt, origin bottom-left)
// -----------------------------
async function getPageItems(pdf, pageNum) {
  const page = await pdf.getPage(pageNum);
  const textContent = await page.getTextContent();
  // items: {str, transform[4]=x, transform[5]=y}
  const items = textContent.items.map(it => ({
    str: it.str,
    x: it.transform[4],
    y: it.transform[5]
  }));
  return { page, items };
}

function textInBBox(items, bbox) {
  if (!bbox) return "";
  const x0 = bbox.x0, x1 = bbox.x1, y0 = bbox.y0, y1 = bbox.y1;

  const inside = items.filter(it =>
    it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1 && it.str && it.str.trim()
  );

  // Reconstituer “à peu près” l’ordre: y desc (haut -> bas), x asc (gauche -> droite)
  inside.sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > 1.5) return dy;
    return a.x - b.x;
  });

  return norm(inside.map(it => it.str).join(" "));
}

function classifyPage(fullText, isBtPage) {
  const up = (fullText || "").toUpperCase();
  if (isBtPage) return "BT";
  if (up.includes("FICHE AT") || up.includes("AT N°") || up.includes("AT N")) return "AT";
  if (up.includes("PROCÉDURE D'EXÉCUTION") || up.includes("PROCEDURE D'EXECUTION")) return "PROC";
  if (up.includes("ECHELLE") && up.includes("1/200")) return "PLAN";
  if (up.includes("GOOGLE") && up.includes("STREET")) return "STREET";
  const compact = up.replace(/\s+/g, "");
  if (compact.length < 140) return "PHOTO";
  return "DOC";
}

// -----------------------------
// REALISATION parsing (robuste)
// -----------------------------
function parseTeamFromRealisation(text) {
  const t = (text || "")
    .replace(/\u00A0/g, " ")
    .replace(/[|•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Arrêts: dates/heures/libellés de tableau
  const STOP = /^(?:\d{2}\/\d{2}\/\d{4}|\d{1,2}h\d{2}|\d{1,2}:\d{2}|de|à|a|mo|horaire|temps|dont|heures|sup|indemnités)$/i;

  const out = [];
  const reNni = /([A-Z]\d{5})/g;

  let m;
  while ((m = reNni.exec(t)) !== null) {
    const nni = m[1];
    const tail = t.slice(m.index + nni.length).trim();
    const tokens = tail.split(" ").filter(Boolean);

    const nameParts = [];
    for (let i = 0; i < tokens.length && nameParts.length < 6; i++) {
      const tok = tokens[i];
      if (STOP.test(tok)) break;
      const cleanTok = tok.replace(/[,\.;:]/g, "");
      if (/^NNI$/i.test(cleanTok)) continue;
      nameParts.push(cleanTok);
    }

    const name = norm(nameParts.join(" "));
    if (name && name.length >= 3 && !out.some(x => x.nni === nni)) {
      out.push({ nni, name });
    }
  }

  return out;
}

function mapTech(teamItem) {
  const techs = window.TECHNICIANS || [];
  const nniA = String(teamItem?.nni || "").replace(/\s+/g, "").toUpperCase();
  if (nniA) {
    const byNni = techs.find(t => String(t.nni || "").replace(/\s+/g, "").toUpperCase() === nniA);
    if (byNni) return byNni;
  }

  // Fallback (rare): lastname match
  const last = String(teamItem?.name || "").trim().split(/\s+/)[0]?.toUpperCase();
  if (!last) return null;
  return techs.find(t => String(t.name || "").toUpperCase().startsWith(last + " ")) || null;
}

// -----------------------------
// Field extraction from BT page using zones.json
// -----------------------------
function extractBtFieldsFromZones(items) {
  // Zones “core”
  const objet = textInBBox(items, getZoneBBox("OBJET"));
  const datePrevu = textInBBox(items, getZoneBBox("DATE_PREVU"));
  const clientNom = textInBBox(items, getZoneBBox("CLIENT_NOM"));
  const refPdl = textInBBox(items, getZoneBBox("REFERENCE_PDL"));
  const duree = textInBBox(items, getZoneBBox("DUREE"));
  const localisation = textInBBox(items, getZoneBBox("LOCALISATION"));
  const contact = textInBBox(items, getZoneBBox("CONTACT_CLIENT"));
  const btNum = textInBBox(items, getZoneBBox("BT_NUM"));
  const observation = textInBBox(items, getZoneBBox("OBSERVATION"));
  const designation = textInBBox(items, getZoneBBox("DESIGNATION"));
  const realisation = textInBBox(items, getZoneBBox("REALISATION"));

  return {
    objet, datePrevu, clientNom, refPdl, duree, localisation, contact,
    btNum, observation, designation, realisation
  };
}

function detectTypeFromObjet(objet) {
  const text = (objet || "").toLowerCase();

  if (text.includes("mise hors service") || text.includes("mhs") || text.includes("depose compteur") || text.includes("dépose compteur")) return "mhs";
  if (text.includes("mise en service") || text.includes("remise en service") || text.includes("pose module") || text.includes("chgt compteur") || text.includes("changement compteur")) return "mes";
  if (text.includes("adf") || text.includes("fuite") || text.includes("surveillance") || text.includes("localisation") || text.includes("rsf")) return "adf";
  if (text.includes("maintenance") || text.includes("cicm") || text.includes("ci-cm") || text.includes("préventive") || text.includes("preventive") || text.includes("visite")) return "maintenance";
  if (text.includes("formation") || text.includes("maintien") || text.includes("compétence") || text.includes("competence") || text.includes("habilitation") || text.includes("soudage")) return "formation";
  if (text.includes("administratif") || text.includes("réunion") || text.includes("reunion")) return "administratif";
  return "maintenance";
}

function getTypeLabel(type) {
  return {
    mhs: "MHS",
    mes: "MES",
    adf: "ADF",
    maintenance: "MAINTENANCE",
    formation: "FORMATION",
    administratif: "ADMIN"
  }[type] || "AUTRE";
}

function extractBtIdFallback(fullText, zoneBtNum) {
  const z = String(zoneBtNum || "");
  const m1 = z.match(/BT\d{11}/i);
  if (m1) return m1[0].toUpperCase();
  const m2 = String(fullText || "").match(/BT\d{11}/i);
  if (m2) return m2[0].toUpperCase();
  return "";
}

function extractAtNumberFromText(fullText) {
  const t = String(fullText || "");
  // souvent PRO6 / PRO12...
  const m1 = t.match(/\bPRO\d{1,3}\b/i);
  if (m1) return m1[0].toUpperCase();
  // parfois "AT N° XXXX"
  const m2 = t.match(/AT\s*N[°o]?\s*([A-Z0-9\-]{2,})/i);
  if (m2) return String(m2[1]).toUpperCase();
  return "";
}

// -----------------------------
// Main extraction
// -----------------------------
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

  const total = pdf.numPages;

  let current = null;

  function finalize(endPage) {
    if (!current) return;

    current.endPage = endPage;
    current.sourcePages = current.pages.map(p => p.page);
    current.hasAT = current.pages.some(p => p.type === "AT");
    current.atPages = current.pages.filter(p => p.type === "AT").map(p => p.page);

    // AT number: essayer de le trouver sur les pages AT
    current.atNumber = current.atNumber || "";
    if (!current.atNumber && current.atPages.length) {
      // on prendra le premier match dans les pages AT
      current.atNumber = current.atNumber || "";
    }

    // documents meta
    const labelMap = { BT:"BT", AT:"AT", PROC:"Procédure", PLAN:"Plan", PHOTO:"Photo", STREET:"Street", DOC:"Doc" };
    current.documentsMeta = current.pages.map((p, i) => ({
      key: `P${i + 1}`,
      page: p.page,
      type: p.type,
      label: labelMap[p.type] || "Doc"
    }));
    current.documents = current.documentsMeta.map(d => `${d.key} • ${d.label}`);

    // sécurité: dedupe team
    current.team = uniqBy(current.team, x => x.id || x.nni || x.name);

    state.bts.push(current);
    current = null;
  }

  for (let pageNum = 1; pageNum <= total; pageNum++) {
    setStatus(`Lecture page ${pageNum}/${total}…`);
    setProgress(5 + Math.round((pageNum / total) * 80));

    const { items } = await getPageItems(pdf, pageNum);
    const fullText = norm(items.map(it => it.str).join(" "));

    const hasBtId = /BT\d{11}/i.test(fullText);
    const isBtHeader = /BON\s+DE\s+TRAVAIL/i.test(fullText) && hasBtId;

    if (isBtHeader) {
      // clôturer l'ancien BT
      finalize(pageNum - 1);

      // extraire champs
      const fields = extractBtFieldsFromZones(items);
      const btId = extractBtIdFallback(fullText, fields.btNum);

      const objet = fields.objet || "";
      const type = detectTypeFromObjet(objet);

      // équipe via REALISATION UNIQUEMENT
      const teamRaw = parseTeamFromRealisation(fields.realisation || "");
      const mapped = teamRaw
        .map(tr => {
          const tech = mapTech(tr);
          if (!tech) {
            // si non reconnu, on garde quand même (mais sans id)
            return { id: "", nni: tr.nni, name: norm(tr.name), color: "#64748b" };
          }
          return { id: tech.id, nni: tech.nni, name: tech.name, color: tech.color };
        });

      current = {
        id: btId || "BT_INCONNU",
        type,
        typeLabel: getTypeLabel(type),
        title: objet ? objet : "Bon de travail",
        datePrevu: fields.datePrevu || "",
        duration: fields.duree || "",
        client: fields.clientNom || "",
        address: fields.localisation || "",
        pdl: fields.refPdl || "",
        phone: fields.contact || "",
        observation: fields.observation || "",
        designationText: fields.designation || "",
        team: uniqBy(mapped, x => x.nni || x.name),
        pages: [],
        startPage: pageNum,
        endPage: pageNum,
        hasAT: false,
        atPages: [],
        atNumber: ""  // rempli plus bas si trouvé
      };
    }

    if (current) {
      const pType = classifyPage(fullText, pageNum === current.startPage);
      current.pages.push({ page: pageNum, type: pType });

      // AT number: si on est sur une page AT, essayer d'extraire
      if (pType === "AT") {
        const atNum = extractAtNumberFromText(fullText);
        if (atNum) current.atNumber = current.atNumber || atNum;
      }
    }
  }

  finalize(total);

  // Comptages
  computeCounts();
  buildTechSelectWithCounts();
  buildTypeChips();

  setStatus(`Terminé. ${state.bts.length} BT détectés.`);
  setProgress(100);

  renderAll();
}

function computeCounts() {
  const map = new Map();
  for (const bt of state.bts) {
    for (const m of bt.team || []) {
      const id = m.id || m.nni || "";
      if (!id) continue;
      map.set(id, (map.get(id) || 0) + 1);
    }
  }
  state.countsByTechId = map;
}

// -----------------------------
// UI: tech select with counts (ONLY techs with BT)
// -----------------------------
function buildTechSelectWithCounts() {
  const sel = $("techSelect");
  if (!sel) return;

  const techs = window.TECHNICIANS || [];
  const counts = state.countsByTechId || new Map();

  const techsWithBt = techs
    .map(t => ({ t, c: counts.get(t.id) || 0 }))
    .filter(x => x.c > 0)
    .sort((a, b) => b.c - a.c || a.t.name.localeCompare(b.t.name));

  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "— Tous —";
  sel.appendChild(optAll);

  for (const x of techsWithBt) {
    const opt = document.createElement("option");
    opt.value = x.t.id;
    opt.textContent = `${x.t.name} (${x.c})`;
    sel.appendChild(opt);
  }

  sel.value = state.filters.techId || "";
  sel.addEventListener("change", () => {
    state.filters.techId = sel.value || "";
    renderAll();
  });
}

// -----------------------------
// UI: type chips
// -----------------------------
function syncTypeChipsUI() {
  const root = $("typeChips");
  if (!root) return;
  const chips = root.querySelectorAll(".chip");
  chips.forEach(ch => {
    const t = ch.getAttribute("data-type");
    if (state.filters.types.has(t)) ch.classList.add("active");
    else ch.classList.remove("active");
  });
}

function buildTypeChips() {
  const root = $("typeChips");
  if (!root) return;
  root.innerHTML = "";

  for (const t of DOC_TYPES) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.setAttribute("data-type", t);
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

// -----------------------------
// Filtering + rendering
// -----------------------------
function btMatches(bt) {
  const q = norm(state.filters.q).toLowerCase();
  if (q) {
    const hay = [
      bt.id, bt.title, bt.client, bt.address, bt.pdl, bt.datePrevu, bt.duration,
      (bt.team || []).map(x => x.name).join(" ")
    ].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (state.filters.techId) {
    const id = state.filters.techId;
    const has = (bt.team || []).some(m => (m.id === id));
    if (!has) return false;
  }

  if (state.filters.types && state.filters.types.size > 0) {
    // type filter applies to documents types inside BT pages
    const typesInBt = new Set((bt.pages || []).map(p => p.type));
    let ok = false;
    for (const t of state.filters.types) {
      if (typesInBt.has(t)) { ok = true; break; }
    }
    if (!ok) return false;
  }

  return true;
}

function countDocs(bt) {
  const cnt = {};
  for (const t of DOC_TYPES) cnt[t] = 0;
  for (const p of bt.pages || []) {
    cnt[p.type] = (cnt[p.type] || 0) + 1;
  }
  return cnt;
}

function renderAll() {
  const root = $("results");
  if (!root) return;

  const list = (state.bts || []).filter(btMatches);

  const pills = $("topPills");
  if (pills) {
    const totalPages = state.totalPages || 0;
    const nbBt = state.bts.length;
    const nbAt = state.bts.filter(b => b.hasAT).length;
    pills.innerHTML = `
      <span class="pill">${nbBt} BT</span>
      <span class="pill">${totalPages} pages</span>
      <span class="pill">${nbAt} AT</span>
    `;
  }

  root.innerHTML = list.map(renderBtCard).join("");
  bindCardActions();
}

function renderBtCard(bt) {
  const docs = countDocs(bt);
  const atBadge = bt.hasAT
    ? `<span class="badge badge-at">${esc(bt.atNumber || "AT")}</span>`
    : "";

  const teamLine = (bt.team || []).length
    ? (bt.team || []).map(m => `<span class="tag" title="${esc(m.nni || "")}">${esc(m.name)}</span>`).join(" ")
    : `<span class="muted">—</span>`;

  // mini chips docs
  const docChips = [];
  if (docs.BT) docChips.push(`<span class="chipmini">BT:${docs.BT}</span>`);
  if (docs.AT) docChips.push(`<span class="chipmini">AT:${docs.AT}</span>`);
  if (docs.PROC) docChips.push(`<span class="chipmini">PROC:${docs.PROC}</span>`);
  if (docs.PLAN) docChips.push(`<span class="chipmini">PLAN:${docs.PLAN}</span>`);
  if (docs.PHOTO) docChips.push(`<span class="chipmini">PHOTO:${docs.PHOTO}</span>`);
  if (docs.STREET) docChips.push(`<span class="chipmini">STREET:${docs.STREET}</span>`);
  if (docs.DOC) docChips.push(`<span class="chipmini">DOC:${docs.DOC}</span>`);

  return `
    <div class="btcard" data-bt="${esc(bt.id)}">
      <div class="btcard-head">
        <div class="btid">${esc(bt.id)} ${atBadge}</div>
        <div class="bttype">${esc(bt.typeLabel || "")}</div>
      </div>

      <div class="btobj">
        <div class="muted">OBJET</div>
        <div>${esc(bt.title)}</div>
      </div>

      <div class="btmeta">
        <div><span class="muted">DATE PREVUE</span> ${esc(bt.datePrevu || "")}</div>
        <div><span class="muted">DUREE</span> ${esc(bt.duration || "")}</div>
        <div><span class="muted">CLIENT</span> ${esc(bt.client || "")}</div>
        <div><span class="muted">ADRESSE</span> ${esc(bt.address || "")}</div>
      </div>

      <div class="btteam">
        <div class="muted">ÉQUIPE (REALISATION)</div>
        <div class="tags">${teamLine}</div>
      </div>

      <div class="btdocs">
        ${docChips.join(" ")}
      </div>

      <div class="btactions">
        <button class="btn" data-action="preview">Aperçu</button>
        <button class="btn primary" data-action="export">Exporter BT</button>
      </div>
    </div>
  `;
}

function bindCardActions() {
  document.querySelectorAll(".btcard .btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const card = e.target.closest(".btcard");
      const id = card?.getAttribute("data-bt");
      const bt = state.bts.find(x => x.id === id);
      const action = e.target.getAttribute("data-action");
      if (!bt) return;

      if (action === "preview") openPreview(bt);
      if (action === "export") exportBtPdf(bt);
    });
  });
}

// -----------------------------
// Preview modal (simple, compatible avec ton UI existante)
// -----------------------------
async function openPreview(bt) {
  // Si ton index.html a déjà une modale, on utilise ses IDs
  const modal = $("previewModal");
  const frame = $("previewFrame");
  const title = $("previewTitle");

  if (!modal || !frame) {
    alert("Modale preview non trouvée (previewModal/previewFrame).");
    return;
  }

  if (title) {
    title.textContent = `${bt.id} — ${bt.client || ""} ${bt.address || ""}`.trim();
  }

  // On affiche la 1ère page du BT
  const firstPage = bt.startPage || 1;
  frame.setAttribute("data-page", String(firstPage));
  await renderPdfPageToCanvas(firstPage);

  modal.classList.add("open");

  const btnClose = $("previewClose");
  if (btnClose) btnClose.onclick = () => modal.classList.remove("open");

  const btnPrev = $("previewPrev");
  const btnNext = $("previewNext");
  if (btnPrev) btnPrev.onclick = async () => {
    const p = parseInt(frame.getAttribute("data-page") || "1", 10);
    const np = Math.max(bt.startPage, p - 1);
    frame.setAttribute("data-page", String(np));
    await renderPdfPageToCanvas(np);
  };
  if (btnNext) btnNext.onclick = async () => {
    const p = parseInt(frame.getAttribute("data-page") || "1", 10);
    const np = Math.min(bt.endPage, p + 1);
    frame.setAttribute("data-page", String(np));
    await renderPdfPageToCanvas(np);
  };
}

async function renderPdfPageToCanvas(pageNum) {
  const pdf = state.pdf;
  const canvas = $("previewCanvas");
  if (!pdf || !canvas) return;

  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });

  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const label = $("previewPageLabel");
  if (label) label.textContent = `Page ${pageNum}/${state.totalPages}`;
}

// -----------------------------
// Export BT pages -> PDF (simple: on exporte un PDF "images")
// -----------------------------
async function exportBtPdf(bt) {
  // Export “light” : on génère un PDF via impression navigateur (le plus robuste en GitHub Pages)
  // => on ouvre l'aperçu et l'utilisateur imprime en PDF.
  // (Si tu veux un vrai merge PDF plus tard, on fera pdf-lib)
  await openPreview(bt);
  alert("Astuce: utilise Ctrl+P dans l’aperçu et choisis “Enregistrer en PDF”. (Version 1)");
}

// -----------------------------
// Wiring inputs
// -----------------------------
function wireUI() {
  const fileInput = $("pdfInput");
  const btnExtract = $("btnExtract");
  const btnReset = $("btnReset");
  const q = $("searchInput");

  if (q) {
    q.addEventListener("input", () => {
      state.filters.q = q.value || "";
      renderAll();
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      state.filters.q = "";
      state.filters.types = new Set();
      state.filters.techId = "";
      if ($("searchInput")) $("searchInput").value = "";
      if ($("techSelect")) $("techSelect").value = "";
      buildTypeChips();
      renderAll();
    });
  }

  if (btnExtract) {
    btnExtract.addEventListener("click", async () => {
      const f = fileInput?.files?.[0];
      if (!f) return alert("Choisis un PDF d’abord.");
      try {
        await extractFromPdf(f);
      } catch (err) {
        console.error(err);
        setStatus("Erreur: " + (err?.message || err));
        alert(err?.message || err);
      }
    });
  }

  // Auto: si on sélectionne un PDF, on peut extraire directement si tu veux
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (f) setStatus(`PDF prêt: ${f.name}`);
    });
  }
}

// -----------------------------
// Init
// -----------------------------
(async function init() {
  try {
    wireUI();
    setStatus("Prêt.");
    setProgress(0);

    // zones preload (optionnel)
    try { await loadZones(); } catch { /* ignore */ }

    // build chips + select (vide au départ)
    buildTypeChips();
    buildTechSelectWithCounts();
  } catch (e) {
    console.error(e);
    setStatus("Init erreur: " + (e?.message || e));
  }
})();
