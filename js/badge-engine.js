/* js/badge-engine.js — DEMAT-BT v11.0.0 — 15/02/2026
   Moteur de classification des pastilles métier (badges-rules.json)
*/

let BADGE_RULES = null;

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

function normalizeBadgeText(str = "") {
  const s = String(str)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${s} `;
}

function normalizeBadgeKey(k = "") {
  const s = String(k)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${s} `;
}

function buildBTBadgeText(bt) {
  return normalizeBadgeText([bt.objet, bt.precisionObjet].filter(Boolean).join(" | "));
}

function ruleMatches(text, rule) {
  if (!rule) return false;
  const has = (k) => text.includes(normalizeBadgeKey(k));
  const anyOk  = !rule.any  || rule.any.some(has);
  const allOk  = !rule.all  || rule.all.every(has);
  const any2Ok = !rule.any2 || rule.any2.some(has);
  return anyOk && any2Ok && allOk;
}

function detectBadgesForBT(bt) {
  if (!BADGE_RULES?.badges?.length) return [];

  const text = buildBTBadgeText(bt);
  const badges = [];

  const ordered = [...BADGE_RULES.badges].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const badge of ordered) {
    const excludes = badge.exclude || [];
    if (excludes.some(ex => text.includes(normalizeBadgeKey(ex)))) continue;
    const rules = badge.rules || [];
    if (rules.some(r => ruleMatches(text, r))) badges.push(badge.id);
  }

  const stackOrder = BADGE_RULES?.notes?.ui?.display?.stackOrder || [];
  const max = BADGE_RULES?.notes?.ui?.display?.maxBadgesPerBT || 2;
  const byOrder = (id) => {
    const idx = stackOrder.indexOf(id);
    return idx === -1 ? 9999 : idx;
  };

  const unique = [...new Set(badges)];
  unique.sort((a, b) => byOrder(a) - byOrder(b));
  return unique.slice(0, max);
}

function getBadgeCfg(id) {
  if (!BADGE_RULES?.badges) return null;
  return BADGE_RULES.badges.find(b => b.id === id) || null;
}
