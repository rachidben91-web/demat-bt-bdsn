/* js/pdf-extractor.js — DEMAT-BT v11.1.0 — 16/02/2026
   Extraction PDF : détection intelligente des BT et de leurs pièces jointes (AT, FOR-113, Plans...)
   FIX v11.1: Détection documents annexes corrigée + suppression faux positifs PLAN/PROC/PHOTO
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
    // Tente d'abord les libs locales, fallback CDN
    s.src = "./libs/pdfjs/pdf.min.js";
    s.onerror = () => {
      console.warn("[PDF.js] Lib locale introuvable, fallback CDN");
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s2.onload = resolve;
      s2.onerror = () => reject(new Error("Impossible de charger pdf.js"));
      document.head.appendChild(s2);
    };
    s.onload = resolve;
    document.head.appendChild(s);
  });
  // Worker : même logique local → CDN
  const workerLocal = "./libs/pdfjs/pdf.worker.min.js";
  const workerCDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerLocal;
  // Note: si le worker local échoue, PDF.js bascule en mode fake worker
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

// 4. Extraction de texte COMPLET d'une page (pour la détection de type)
async function extractFullPageText(page) {
  const tc = await page.getTextContent();
  const items = tc.items || [];
  const picked = [];
  for (const it of items) {
    const str = (it.str || "").trim();
    if (str) {
      const t = it.transform;
      picked.push({ str, x: t ? t[4] : 0, y: t ? t[5] : 0 });
    }
  }
  picked.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  return norm(picked.map(p => p.str).join(" "));
}

// 5. Détection intelligente du type de document (v11.1 — corrigée)
//    Analyse le texte complet de la page pour une classification fiable
async function detectDocType(page) {
  const fullText = await extractFullPageText(page);
  const up = safeUpper(fullText);

  // -----------------------------------------------------------
  // A) Page 2 du BT GRDF (côté "Méthode / Ordonnancement")
  //    → On la rattache comme "BT" (2ème page du même bon)
  //    Signature : contient "METHODE" + "ORDONNANCEMENT" + "BON DE TRAVAIL"
  // -----------------------------------------------------------
  if (up.includes("METHODE") && up.includes("ORDONNANCEMENT") && up.includes("BON DE TRAVAIL")) {
    return "BT";
  }

  // -----------------------------------------------------------
  // B) Autorisation de Travail (AT)
  //    Signatures strictes : titre exact ou numéro AT
  // -----------------------------------------------------------
  if (/AUTORISATION\s+DE\s+TRAVAIL/i.test(up) && !up.includes("DOCUMENTS SATELLITES")) {
    return "AT";
  }
  if (/\bAT\s*N\s*[°:]\s*\w+/.test(fullText) && up.includes("AUTORISATION")) {
    return "AT";
  }

  // -----------------------------------------------------------
  // C) FOR-113 (Fiche de préparation et de suivi)
  //    Très spécifique : "FOR-113" ou "FOR 113"
  // -----------------------------------------------------------
  if (/FOR[\s-]*113/i.test(up)) {
    return "FOR113";
  }
  if (up.includes("FICHE DE PREPARATION") && up.includes("SUIVI")) {
    return "FOR113";
  }

  // -----------------------------------------------------------
  // D) Procédure d'exécution / Mode opératoire
  //    ⚠️ STRICT : on exige "MODE OPERATOIRE" ou "PROCEDURE D'EXECUTION"
  //    On exclut le texte standard du BT "La procédure d'exécution..."
  // -----------------------------------------------------------
  if (up.includes("MODE OPERATOIRE")) {
    return "PROC";
  }
  // "PROCEDURE D'EXECUTION" mais PAS la phrase standard du BT
  if (up.includes("PROCEDURE") && !up.includes("LA PROCEDURE D EXECUTION")) {
    // Vérifier qu'il y a un vrai titre de procédure, pas juste une mention
    if (up.includes("PROCEDURE D EXECUTION") || up.includes("CONSIGNE DE SECURITE") || up.includes("FICHE DE MANOEUVRE")) {
      return "PROC";
    }
  }

  // -----------------------------------------------------------
  // E) Plan de situation / Cartographie
  //    ⚠️ STRICT : on exige des termes spécifiques aux vrais plans
  //    Exclut "PLANS MINUTES" et "PLANS" du tableau DOCUMENTS SATELLITES
  // -----------------------------------------------------------
  if (up.includes("PLAN DE SITUATION") || up.includes("PLAN DE MASSE") || 
      up.includes("CARTOGRAPHIE") || up.includes("SCHEMA DE PRINCIPE") ||
      up.includes("PLAN DE RECOLEMENT") || up.includes("RECOLLEMENT")) {
    return "PLAN";
  }
  // "PLAN" seul : seulement si c'est clairement un document plan (pas le mot isolé dans un formulaire)
  if (/\bPLAN\s+(DE|DU|D)\s+/i.test(fullText) && !up.includes("PLANS MINUTES") && !up.includes("DOCUMENTS SATELLITES")) {
    return "PLAN";
  }

  // -----------------------------------------------------------
  // F) Google Street View
  // -----------------------------------------------------------
  if (up.includes("STREET VIEW") || up.includes("GOOGLE MAPS") || up.includes("VUE IMMERSIVE")) {
    return "STREET";
  }

  // -----------------------------------------------------------
  // G) Photos terrain
  //    ⚠️ STRICT : on vérifie que la page contient BEAUCOUP d'images
  //    (pas juste un logo ou un en-tête), OU le mot "PHOTO" en titre
  // -----------------------------------------------------------
  if (up.includes("PHOTO") && !up.includes("DOCUMENTS SATELLITES") && !up.includes("FICHE D EXPOSITION")) {
    return "PHOTO";
  }
  try {
    const ops = await page.getOperatorList();
    let imageCount = 0;
    for (const fn of ops.fnArray) {
      if (fn === window.pdfjsLib.OPS.paintImageXObject || fn === window.pdfjsLib.OPS.paintJpegXObject) {
        imageCount++;
      }
    }
    // Seulement si la page a 3+ images (pas juste les logos GRDF)
    // ET peu de texte (une page photo a peu de texte, un BT en a beaucoup)
    if (imageCount >= 3 && fullText.length < 200) {
      return "PHOTO";
    }
  } catch(e) {
    console.warn("[DETECT] Erreur détection images:", e);
  }

  // -----------------------------------------------------------
  // H) Défaut : DOC générique
  // -----------------------------------------------------------
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

// 6. Boucle principale d'extraction (v11.1 — corrigée)
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

      console.log(`[EXTRACT] p.${p} → BT ${id} | badges: [${currentBT.badges}] | objet: "${currentBT.objet?.substring(0, 60)}"`);
    } 
    // Si ce n'est pas une page BT, c'est une pièce jointe du BT précédent
    else if (currentBT) {
      const type = await detectDocType(page);
      currentBT.docs.push({ page: p, type });
      console.log(`[EXTRACT] p.${p} → Annexe ${type} rattachée à ${currentBT.id}`);
      
      // NOTE v11.1 : On ne recalcule PAS les badges ici.
      // Les badges sont basés uniquement sur l'objet du BT, pas sur les annexes.
    }
  }

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  await saveToCache();
  renderAll();
}
