/* js/badge-engine.js — DEMAT-BT v11.0.0 — 16/02/2026
   Moteur de classification des pastilles métier (badges-rules.json)
   Mise à jour : Optimisation du tri par priorité et gestion des exclusions strictes
*/

let BADGE_RULES = null;

/**
 * Charge les règles de classification depuis le serveur.
 */
async function loadBadgeRules() {
  try {
    const res = await fetch("./config/badges-rules.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    BADGE_RULES = await res.json();
    console.log("[BADGES] Règles chargées ✅", BADGE_RULES?.version || "");
  } catch (e) {
    console.warn("[BADGES] Impossible de charger badges-rules.json — pastilles désactivées.", e);
    BADGE_RULES = null;
  }
}

/**
 * Normalise le texte pour la comparaison (Majuscules, sans accents, espaces cleans).
 */
function normalizeBadgeText(str = "") {
  const s = String(str)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${s} `; // Espaces de sécurité pour les correspondances exactes
}

function normalizeBadgeKey(k = "") {
  return normalizeBadgeText(k);
}

/**
 * Prépare le texte de recherche à partir de l'objet et de la désignation du BT.
 */
function buildBTBadgeText(bt) {
  // On fusionne l'objet et la précision pour maximiser les chances de détection
  return normalizeBadgeText([bt.objet, bt.precisionObjet, bt.designation].filter(Boolean).join(" | "));
}

/**
 * Vérifie si une règle (any, all, any2) correspond au texte du BT.
 */
function ruleMatches(text, rule) {
  if (!rule) return false;
  const has = (k) => text.includes(normalizeBadgeKey(k));
  const anyOk  = !rule.any  || rule.any.some(has);
  const allOk  = !rule.all  || rule.all.every(has);
  const any2Ok = !rule.any2 || rule.any2.some(has);
  return anyOk && any2Ok && allOk;
}

/**
 * Détecte la pastille la plus pertinente pour un BT donné.
 */
function detectBadgesForBT(bt) {
  if (!BADGE_RULES?.badges?.length) return [];

  const text = buildBTBadgeText(bt);
  const badges = [];

  // 1. On trie les badges par priorité descendante définie dans le JSON
  const ordered = [...BADGE_RULES.badges].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const badge of ordered) {
    // Vérification des exclusions (Si un mot exclu est présent, on passe au badge suivant)
    const excludes = badge.exclude || [];
    if (excludes.some(ex => text.includes(normalizeBadgeKey(ex)))) continue;

    // Vérification des règles de correspondance
    const rules = badge.rules || [];
    if (rules.some(r => ruleMatches(text, r))) {
      badges.push(badge.id);
    }
  }

  // 2. Gestion de l'affichage UI selon les notes du JSON
  const stackOrder = BADGE_RULES?.notes?.ui?.display?.stackOrder || [];
  const max = BADGE_RULES?.notes?.ui?.display?.maxBadgesPerBT || 1; // Limite à 1 comme demandé

  // On filtre pour ne garder que les badges uniques
  const unique = [...new Set(badges)];

  // On trie selon l'ordre d'empilement (stackOrder) pour l'affichage final
  unique.sort((a, b) => {
    const idxA = stackOrder.indexOf(a);
    const idxB = stackOrder.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  return unique.slice(0, max);
}

/**
 * Récupère la configuration complète d'un badge par son ID.
 */
function getBadgeCfg(id) {
  if (!BADGE_RULES?.badges) return null;
  return BADGE_RULES.badges.find(b => b.id === id) || null;
}
