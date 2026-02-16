/* js/pdf-extractor.js — DEMAT-BT v11.0.0 — 16/02/2026
   Extraction PDF : détection intelligente des BT et de leurs pièces jointes (AT, FOR-113, Plans...)
*/

let ZONES = null;

// 1. Chargement des zones de coordonnées depuis le JSON
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

// 2. Initialisation de PDF.js
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

// 3. Extraction de texte dans une zone précise (Bounding Box)
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

// 4. Scanner de bandeau large (Nouveauté pour documents annexes)
async function extractHeaderArea(page) {
  // Scanne tout le haut de la page sur 150 points de hauteur pour ne rater aucun titre
  const headerBBox = { x0: 0, y0: 700, x1: 600, y1: 842 }; 
  return await extractTextInBBox(page, headerBBox);
}

// 5. Détection intelligente du type de document
async function detectDocTypeFromHeader(page, headerText) {
  const up = safeUpper(headerText);

  // AT - Autorisation de Travail
  if (up.includes("AUTORISATION DE TRAVAIL") || up.includes("AUTORISATION TRAVAIL") || /AT\d{3,}/.test(up)) {
    return "AT";
  }
  // FOR-113 (Fiche de préparation et de suivi)
  if (up.includes("FOR-113") || up.includes("FOR 113") || up.includes("PREPARATION ET DE SUIVI")) {
    return "FOR113";
  }
  // PROCÉDURES
  if (up.includes("PROCEDURE") || up.includes("MODE OPERATOIRE") || up.includes("EXECUTION")) {
    return "PROC";
  }
  // PLANS ET CARTOGRAPHIE
  if (up.includes("PLAN") || up.includes("SCHEMA") || up.includes("SITUATION") || up.includes("RECOLLEMENT")) {
    return "PLAN";
  }
  // STREET VIEW
  if (up.includes("STREET VIEW") || up.includes("GOOGLE") || up.includes("VUE IMMERSIVE")) {
    return "STREET";
  }
  // PHOTOS (Basé sur la détection d'objets images dans le PDF)
  try {
    const ops = await page.getOperatorList();
    const hasImages = ops.fnArray.some(fn => 
      fn === window.pdfjsLib.OPS.paintImageXObject || fn === window.pdfjsLib.OPS.paintJpegXObject
    );
    if (hasImages || up.includes("PHOTO")) return "PHOTO";
  } catch(e) {}

  return "DOC";
}

// Utilitaires de détection de numéros
function isBTNumber(text) { return /BT\d{8,14}/i.test(text || ""); }
function pickBTId(text) { return ((text || "").match(/BT\d{8,14}/i) || [""])[0].toUpperCase(); }
function pickATId(text) { return ((text || "").match(/AT\d{3,}/i) || [""])[0].toUpperCase(); }

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

// 6. Boucle principale d'extraction
async function extractAll() {
  if (!state.pdf) throw new Error("PDF non chargé.");
  if (!ZONES) throw new Error("Zones non chargées.");

  const bb = (label) => getZoneBBox(label);
  
  state.bts = [];
  state.countsByTechId = new Map();
  let currentBT = null;

  for (let p = 1; p <= state.totalPages; p++) {
    setProgress((p - 1) / state.totalPages * 100, `Analyse page ${p}/${state.totalPages}...`);
    const page = await state.pdf.getPage(p);

    // Tentative de détection d'un nouveau BT via sa bbox précise
    const btNumTxt = norm(await extractTextInBBox(page, bb("BT_NUM")));

    if (isBTNumber(btNumTxt)) {
      const id = pickBTId(btNumTxt);
      const team = parseTeamFromRealisation(norm(await extractTextInBBox(page, bb("REALISATION"))));

      currentBT = {
        id, 
        pageStart: p, 
        objet: norm(await extractTextInBBox(page, bb("OBJET"))),
        datePrevue: norm(await extractTextInBBox(page, bb("DATE_PREVUE"))),
        client: norm(await extractTextInBBox(page, bb("CLIENT_NOM"))),
        localisation: norm(await extractTextInBBox(page, bb("LOCALISATION"))),
        atNum: pickATId(norm(await extractTextInBBox(page, bb("AT_NUM")))),
        team,
        designation: norm(await extractTextInBBox(page, bb("DESIGNATION"))),
        duree: norm(await extractTextInBBox(page, bb("DUREE"))),
        analyseDesRisques: norm(await extractTextInBBox(page, bb("ANALYSE_DES_RISQUES"))),
        observations: norm(await extractTextInBBox(page, bb("OBSERVATIONS"))),
        docs: [{ page: p, type: "BT" }],
        badges: []
      };

      // Détection des pastilles métier
      currentBT.badges = detectBadgesForBT(currentBT);
      state.bts.push(currentBT);

      // Mise à jour des compteurs techniciens
      for (const m of team) {
        const tech = mapTechByNni(m.nni);
        if (!tech) continue;
        const key = techKey(tech);
        state.countsByTechId.set(key, (state.countsByTechId.get(key) || 0) + 1);
      }
    } 
    // Si ce n'est pas une page BT, c'est une pièce jointe du BT précédent
    else if (currentBT) {
      const headerText = await extractHeaderArea(page);
      const type = await detectDocTypeFromHeader(page, headerText);
      currentBT.docs.push({ page: p, type });
      
      // Recalculer les badges si le document apporte une info supplémentaire
      currentBT.badges = detectBadgesForBT(currentBT);
    }
  }

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  await saveToCache();
  renderAll();
}
