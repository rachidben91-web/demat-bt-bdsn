/* js/pdf-extractor.js — DEMAT-BT v11.1.0 — 16/02/2026
   Extraction PDF : détection intelligente des BT et de leurs pièces jointes
   
   CORRECTIFS v11.1.0 :
   - Détection des pièces jointes via FULL TEXT de la page (plus seulement le header)
   - Ordre de priorité des tests revu pour éviter les faux positifs
   - PROC : détecté par "Procédure d'Exécution" (mot exact, pas juste "EXECUTION")
   - AT : détecté par "Fiche AT" ou "N° d'AT" (pas juste "AUTORISATION")
   - PLAN : détecté par "Format: A3" ou "Echelle:" ou "Lambert" + présence de "GRDF"
   - PHOTO : uniquement si page est >80% image et <50 caractères de texte significatif
   - STREET : détecté par "Google Street View" ou "Google Maps"
   - Ajout type "REPAIR" pour les fiches de réparation (Edition Réparation)
   - FOR-113 : inchangé
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

// 4. Extraction du texte COMPLET d'une page (pour classification fiable)
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
  return picked.map(p => p.str).join(" ");
}

// 5. Détection intelligente du type de document — V11.1.0 REFONTE COMPLÈTE
//    Utilise le texte COMPLET de la page au lieu du seul header
async function detectDocType(page) {
  // Récupère tout le texte de la page
  const rawText = await extractFullPageText(page);
  const up = safeUpper(rawText);
  const textLen = rawText.replace(/\s+/g, "").length; // longueur sans espaces

  // --- Log pour debug (à retirer en production si besoin) ---
  console.log(`[DEMAT-BT] Classification page — ${textLen} chars — extrait: "${up.substring(0, 200)}..."`);

  // ═══════════════════════════════════════════════════════════
  // PRIORITE 1 : Détection par mots-clés TRÈS SPÉCIFIQUES
  // ═══════════════════════════════════════════════════════════

  // PROC — Procédure d'Exécution (titre exact, PAS juste "EXECUTION")
  if (up.includes("PROCEDURE D'EXECUTION") || up.includes("PROCEDURE D EXECUTION") ||
      /PROC[EÉ]DURE\s+D.?EX[EÉ]CUTION/i.test(up)) {
    console.log("  → PROC (Procédure d'Exécution détectée)");
    return "PROC";
  }

  // FOR-113 — Fiche de préparation et de suivi
  if (up.includes("FOR-113") || up.includes("FOR 113") ||
      up.includes("FICHE DE PREPARATION ET DE SUIVI") ||
      up.includes("PREPARATION ET DE SUIVI")) {
    console.log("  → FOR113 (Fiche FOR-113 détectée)");
    return "FOR113";
  }

  // AT — Fiche AT / Autorisation de Travail (avec numéro AT spécifique)
  if (up.includes("FICHE AT") || 
      (up.includes("AUTORISATION DE TRAVAIL") && !up.includes("BON DE TRAVAIL")) ||
      /N[°O]\s*D.?AT\s*:\s*AT\d{5,}/i.test(up)) {
    console.log("  → AT (Fiche AT / Autorisation de Travail détectée)");
    return "AT";
  }

  // STREET VIEW — Google Maps / Street View
  if (up.includes("GOOGLE STREET VIEW") || up.includes("STREET VIEW") ||
      (up.includes("GOOGLE MAPS") && !up.includes("BON DE TRAVAIL"))) {
    console.log("  → STREET (Vue Google Street View détectée)");
    return "STREET";
  }

  // PLAN — Cartographie GRDF (Format A3, Echelle, Lambert, Code INSEE)
  if ((up.includes("FORMAT") && up.includes("PAYSAGE")) ||
      (up.includes("ECHELLE") && up.includes("GRDF")) ||
      (up.includes("LAMBERT") && up.includes("COMMUNE")) ||
      (up.includes("CODE INSEE") && up.includes("GRDF")) ||
      (up.includes("CARTOGRAPHIE") || up.includes("RECOLLEMENT"))) {
    console.log("  → PLAN (Cartographie/Plan GRDF détecté)");
    return "PLAN";
  }

  // REPAIR — Fiche de réparation (Edition Réparation / Modification de Réparation)
  if (up.includes("EDITION REPARATION") || up.includes("MODIFICATION DE REPARATION") ||
      /RP\d{8,14}/i.test(up) && (up.includes("REPARATION") || up.includes("SURVEILLANCE"))) {
    console.log("  → DOC (Fiche de réparation détectée)");
    return "DOC"; // Gardé en DOC pour l'instant, mais bien identifié
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITE 2 : Détection par ratio texte/images
  // ═══════════════════════════════════════════════════════════

  // PHOTO — Page avec très peu de texte ET présence d'images lourdes
  // Les vrais photos terrain ont typiquement <50 caractères de texte significatif
  if (textLen < 80) {
    try {
      const ops = await page.getOperatorList();
      const imageOps = ops.fnArray.filter(fn =>
        fn === window.pdfjsLib.OPS.paintImageXObject ||
        fn === window.pdfjsLib.OPS.paintJpegXObject
      ).length;
      
      if (imageOps > 0) {
        console.log(`  → PHOTO (${textLen} chars texte, ${imageOps} images détectées)`);
        return "PHOTO";
      }
    } catch (e) {
      console.warn("  ⚠ Erreur lors de l'analyse des opérations PDF:", e);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITE 3 : Détection secondaire (mots-clés plus larges)
  // ═══════════════════════════════════════════════════════════

  // PLAN secondaire — Schéma, Plan de situation (mais PAS "PLANS MINUTES" qui est sur chaque BT)
  if ((up.includes("PLAN DE SITUATION") || up.includes("SCHEMA DE PRINCIPE")) &&
      !up.includes("BON DE TRAVAIL") && !up.includes("PLANS MINUTES")) {
    console.log("  → PLAN (Plan de situation secondaire)");
    return "PLAN";
  }

  // MODE OPERATOIRE — mais pas si c'est un BT (qui contient "Méthode / Ordonnancement")
  if ((up.includes("MODE OPERATOIRE") || up.includes("CONSIGNE OPERATOIRE")) &&
      !up.includes("BON DE TRAVAIL") && !up.includes("METHODE / ORDONNANCEMENT")) {
    console.log("  → PROC (Mode opératoire secondaire)");
    return "PROC";
  }

  // ═══════════════════════════════════════════════════════════
  // DEFAUT : DOC générique
  // ═══════════════════════════════════════════════════════════
  console.log(`  → DOC (aucune signature spécifique trouvée, ${textLen} chars)`);
  return "DOC";
}

// --- FONCTIONS LEGACY conservées pour compatibilité (mais plus utilisées par extractAll) ---
async function extractHeaderArea(page) {
  const headerBBox = { x0: 0, y0: 700, x1: 600, y1: 842 };
  return await extractTextInBBox(page, headerBBox);
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

// 6. Boucle principale d'extraction — V11.1.0
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
      // V11.1.0 : Utilise la nouvelle détection full-page au lieu du seul header
      const type = await detectDocType(page);
      currentBT.docs.push({ page: p, type });

      // Recalculer les badges si le document apporte une info supplémentaire
      currentBT.badges = detectBadgesForBT(currentBT);
    }
  }

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  await saveToCache();
  renderAll();
}
