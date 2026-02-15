/* js/pdf-extractor.js — DEMAT-BT v11.0.0 — 15/02/2026
   Extraction PDF : chargement zones, extraction texte par bbox, détection BT
*/

let ZONES = null;

// -------------------------
// Zones de coordonnées
// -------------------------
async function loadZones() {
  setZonesStatus("Chargement…");
  const res = await fetch(`./zones.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("zones.json introuvable (404).");
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
// PDF.js — chargement dynamique
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
// Extraction texte dans une bounding box
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
    const x = t[4], y = t[5];
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
      const str = (it.str || "").trim();
      if (str) picked.push({ str, x, y });
    }
  }
  picked.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  return norm(picked.map(p => p.str).join(" "));
}

// -------------------------
// Détection numéros BT / AT
// -------------------------
function isBTNumber(text) { return /BT\d{8,14}/i.test(text || ""); }
function pickBTId(text) { return ((text || "").match(/BT\d{8,14}/i) || [""])[0].toUpperCase(); }
function pickATId(text) { return ((text || "").match(/AT\d{3,}/i) || [""])[0].toUpperCase(); }

// -------------------------
// Détection type de document (page)
// -------------------------
async function detectDocTypeFromHeader(page, headerText) {
  const up = safeUpper(headerText);

  // AT
  if (up.includes("AUTORISATION DE TRAVAIL") || up.includes("AUTORISATION TRAVAIL") ||
      /AT\s*N[°O]?\s*\d+/i.test(up) || /AT\d{3,}/i.test(up) ||
      up.includes("AT N") || up.includes("A.T.") || up.includes("AUTORISATION SPECIFIQUE")) {
    return "AT";
  }

  // PROC
  if (up.includes("PROCEDURE D EXECUTION") || up.includes("PROCEDURE D'EXECUTION") ||
      up.includes("PROCEDURE EXECUTION") || up.includes("PE N") || /PE\s*\d{3,}/i.test(up) ||
      up.includes("ORDONNANCEMENT") || up.includes("MODE OPERATOIRE") ||
      up.includes("CONSIGNES") || up.includes("INSTRUCTIONS TECHNIQUES")) {
    return "PROC";
  }

  // PLAN
  if (up.includes("PLAN DE SITUATION") || up.includes("PLAN DE RECOLLEMENT") ||
      up.includes("PLAN DE MASSE") || up.includes("PLAN DU SITE") ||
      up.includes("SCHEMA") || up.includes("COUPE") ||
      up.includes("PLAN D IMPLANTATION") || up.includes("PLAN ") ||
      up.includes("PLANS") || up.includes("CARTOGRAPHIE")) {
    return "PLAN";
  }

  // PHOTO — détection d'images
  try {
    const ops = await page.getOperatorList();
    const imageCount = ops.fnArray.filter(fn =>
      fn === window.pdfjsLib.OPS.paintImageXObject ||
      fn === window.pdfjsLib.OPS.paintJpegXObject
    ).length;
    if (imageCount > 2 || up.includes("PHOTO") || up.includes("PHOTOS") ||
        up.includes("CLICHE") || up.includes("IMAGE") ||
        up.includes("VUE GENERALE") || up.includes("REPORTAGE PHOTO")) {
      return "PHOTO";
    }
  } catch {
    if (up.includes("PHOTO") || up.includes("PHOTOS") || up.includes("CLICHE")) return "PHOTO";
  }

  // STREET VIEW
  if (up.includes("STREET VIEW") || up.includes("GOOGLE STREET") || up.includes("VUE STREET")) {
    return "STREET";
  }

  // DOC
  if (up.includes("DOCUMENT") || up.includes("ANNEXE") || up.includes("PIECE JOINTE")) return "DOC";

  return "DOC";
}

// -------------------------
// Parsing équipe depuis REALISATION
// -------------------------
function parseTeamFromRealisation(text) {
  const t = safeUpper(text);
  const re = /([A-Z]\d{5})\s+([A-ZÀ-Ÿ][A-ZÀ-Ÿ' -]{2,60})/g;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const nni = m[1], name = norm(m[2]);
    if (!out.some(x => x.nni === nni)) out.push({ nni, name });
  }
  return out;
}

// -------------------------
// Extraction principale de tous les BT
// -------------------------
async function extractAll() {
  if (!state.pdf) throw new Error("PDF non chargé.");
  if (!ZONES) throw new Error("Zones non chargées.");

  const bb = (label) => getZoneBBox(label);
  const bbBTNUM    = bb("BT_NUM");
  const bbOBJ      = bb("OBJET");
  const bbDATE     = bb("DATE_PREVUE") || bb("DATE_PREVU");
  const bbLOC      = bb("LOCALISATION");
  const bbCLIENT   = bb("CLIENT_NOM");
  const bbAT       = bb("AT_NUM");
  const bbREAL     = bb("REALISATION");
  const bbDESI     = bb("DESIGNATION");
  const bbDUREE    = bb("DUREE");
  const bbANALYSE  = bb("ANALYSE_DES_RISQUES");
  const bbOBS      = bb("OBSERVATIONS");

  state.bts = [];
  state.countsByTechId = new Map();
  let currentBT = null;

  for (let p = 1; p <= state.totalPages; p++) {
    setProgress((p - 1) / state.totalPages * 100, `Analyse page ${p}/${state.totalPages}...`);
    const page = await state.pdf.getPage(p);

    const btNumTxt = norm(await extractTextInBBox(page, bbBTNUM));

    if (isBTNumber(btNumTxt)) {
      const id         = pickBTId(btNumTxt);
      const objet      = norm(await extractTextInBBox(page, bbOBJ));
      const datePrevue = norm(await extractTextInBBox(page, bbDATE));
      const client     = norm(await extractTextInBBox(page, bbCLIENT));
      const loc        = norm(await extractTextInBBox(page, bbLOC));
      const atNum      = pickATId(norm(await extractTextInBBox(page, bbAT)));
      const realTxt    = norm(await extractTextInBBox(page, bbREAL));
      const desiTxt    = norm(await extractTextInBBox(page, bbDESI));
      const dureeTxt   = norm(await extractTextInBBox(page, bbDUREE));
      const analyseTxt = norm(await extractTextInBBox(page, bbANALYSE));
      const obsTxt     = norm(await extractTextInBBox(page, bbOBS));

      const team = parseTeamFromRealisation(realTxt);

      currentBT = {
        id, pageStart: p, objet, datePrevue, client,
        localisation: loc, atNum, team,
        designation: desiTxt, duree: dureeTxt,
        analyseDesRisques: analyseTxt, observations: obsTxt,
        docs: [{ page: p, type: "BT" }],
        badges: []
      };

      currentBT.badges = detectBadgesForBT(currentBT);
      state.bts.push(currentBT);

      for (const m of team) {
        const tech = mapTechByNni(m.nni);
        if (!tech) continue;
        const key = techKey(tech);
        state.countsByTechId.set(key, (state.countsByTechId.get(key) || 0) + 1);
      }
      continue;
    }

    // Pages suivantes rattachées au dernier BT
    if (currentBT) {
      const header = norm(await extractTextInBBox(page, bbOBJ));
      const type = await detectDocTypeFromHeader(page, header);
      currentBT.docs.push({ page: p, type });
      currentBT.badges = detectBadgesForBT(currentBT);
    }
  }

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  console.log("[DEMAT-BT] Extraction OK ✅", state.bts.length, "BT");

  await saveToCache();
  renderAll();
}
