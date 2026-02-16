/* js/ui/timeline.js — DEMAT-BT v11.0.2 — 16/02/2026
   Vue "Pastilles" : à gauche les pastilles (même source que les vignettes),
   à droite les techniciens (chips + compte).
*/

/* global BADGE_RULES, detectBadgesForBT, getBadgeCfg, mapTechByNni, techKey */

// -------------------------
// Styles (injectés 1 seule fois)
// -------------------------
function ensureBadgeTimelineStylesOnce() {
  if (document.getElementById("badgeTimelineStyles")) return;

  const style = document.createElement("style");
  style.id = "badgeTimelineStyles";
  style.textContent = `
    .badgeTimelineView { padding: 14px; display:flex; flex-direction:column; gap:10px; }

    .badgeRow {
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 14px;
      padding: 12px 12px;
      border: 1px solid rgba(15,23,42,0.08);
      border-radius: 14px;
      background: rgba(255,255,255,0.85);
    }

    .badgeLeft { display:flex; flex-direction:column; gap:8px; }

    .badgeTitle {
      display:flex; align-items:center; gap:10px;
      font-weight: 900;
      letter-spacing: 0.2px;
      color: rgba(15,23,42,0.95);
    }

    .badgeDot {
      width: 12px; height: 12px; border-radius: 999px;
      background: rgba(15,23,42,0.35);
      box-shadow: 0 0 0 4px rgba(15,23,42,0.06);
      flex: 0 0 auto;
    }

    .badgeLabel { display:flex; align-items:baseline; gap:8px; }
    .badgeId {
      font-size: 12px;
      font-weight: 900;
      opacity: .65;
      letter-spacing: .6px;
    }

    .badgeMeta {
      font-size: 12px;
      color: rgba(15,23,42,0.55);
      font-weight: 700;
    }

    .badgeRight {
      display:flex; flex-wrap:wrap;
      gap: 8px;
      align-items:flex-start;
      padding-top: 2px;
    }

    .techChip {
      border: 1px solid rgba(15,23,42,0.12);
      background: rgba(248,250,252,0.9);
      border-radius: 999px;
      padding: 7px 10px;
      font-weight: 800;
      font-size: 12px;
      color: rgba(15,23,42,0.92);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
      user-select: none;
    }
    .techChip:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(15,23,42,0.10);
      background: rgba(255,255,255,0.98);
    }

    .techChipCount {
      background: rgba(37,99,235,0.12);
      color: rgba(30,58,138,0.95);
      padding: 3px 8px;
      border-radius: 999px;
      font-weight: 900;
      font-size: 12px;
      line-height: 1;
    }

    .emptyLine {
      font-size: 12px;
      color: rgba(15,23,42,0.45);
      padding: 6px 0;
      font-weight: 800;
    }
  `;
  document.head.appendChild(style);
}

// -------------------------
// Helpers
// -------------------------
function getBtTechs(bt) {
  const team = Array.isArray(bt?.team) ? bt.team : [];
  const out = [];

  for (const m of team) {
    const nni = m?.nni || "";
    let tech = null;
    try { tech = (typeof mapTechByNni === "function") ? mapTechByNni(nni) : null; } catch (_) {}

    const name = tech?.name || m?.name || nni || "Inconnu";
    let id = "";

    try { id = (tech && typeof techKey === "function") ? techKey(tech) : (nni || name); }
    catch (_) { id = nni || name; }

    out.push({ id, name });
  }
  return out;
}

function applyTechFilter(techId) {
  const sel = document.getElementById("techSelect");
  if (!sel) return;
  sel.value = techId;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
}

// Récupère l’ID pastille "officiel" comme dans les vignettes.
// Priorité: bt.badges[0] (car maxBadgesPerBT=1), sinon recalcul via detectBadgesForBT(bt).
function getPrimaryBadgeId(bt) {
  const b = bt?.badges;
  if (Array.isArray(b) && b.length) return b[0];

  try {
    if (typeof detectBadgesForBT === "function") {
      const detected = detectBadgesForBT(bt);
      if (Array.isArray(detected) && detected.length) return detected[0];
    }
  } catch (_) {}

  return null;
}

function getBadgeOrder() {
  const stack = BADGE_RULES?.notes?.ui?.display?.stackOrder;
  if (Array.isArray(stack) && stack.length) return stack.slice();
  return [];
}

function getBadgeInfo(id) {
  // Utilise le helper du moteur si dispo
  try {
    if (typeof getBadgeCfg === "function") {
      const cfg = getBadgeCfg(id);
      if (cfg) return { id: cfg.id, label: cfg.label || cfg.id, color: cfg.color || "#64748b" };
    }
  } catch (_) {}

  // fallback minimal
  return { id, label: id, color: "#64748b" };
}

// -------------------------
// Render
// -------------------------
function renderBadgeView(filteredBTs, rootEl) {
  ensureBadgeTimelineStylesOnce();

  const root = rootEl || document.getElementById("btTimeline");
  if (!root) return;

  // Neutralise les styles/structure de l’ancienne timeline
  root.classList.remove("grid");
  root.removeAttribute("style");
  root.style.display = "block";

  // Agrégation: badgeId -> { btCount, techs: Map(techId -> {name,count}) }
  const agg = new Map();
  const unknownKey = "__SANS_PASTILLE__";

  for (const bt of (filteredBTs || [])) {
    const badgeId = getPrimaryBadgeId(bt) || unknownKey;

    if (!agg.has(badgeId)) agg.set(badgeId, { btCount: 0, techs: new Map() });
    const entry = agg.get(badgeId);
    entry.btCount += 1;

    const techs = getBtTechs(bt);
    for (const t of techs) {
      const cur = entry.techs.get(t.id) || { name: t.name, count: 0 };
      cur.count += 1;
      entry.techs.set(t.id, cur);
    }
  }

  // Ordre d’affichage = stackOrder, puis les badges rencontrés non listés, puis Sans pastille
  const stackOrder = getBadgeOrder();
  const seenIds = [...agg.keys()].filter(k => k !== unknownKey);

  const ordered = [];
  for (const id of stackOrder) {
    if (agg.has(id)) ordered.push(id);
  }
  // Ajoute les badges présents mais pas dans stackOrder
  const leftovers = seenIds.filter(id => !stackOrder.includes(id)).sort();
  ordered.push(...leftovers);

  // Sans pastille à la fin si présent
  if (agg.has(unknownKey)) ordered.push(unknownKey);

  // Build HTML
  root.innerHTML = `<div class="badgeTimelineView" id="badgeTimelineViewRoot"></div>`;
  const container = document.getElementById("badgeTimelineViewRoot");
  if (!container) return;

  for (const id of ordered) {
    const entry = agg.get(id);
    if (!entry) continue;

    const badgeInfo = (id === unknownKey)
      ? { id: "SANS", label: "SANS PASTILLE", color: "#64748b" }
      : getBadgeInfo(id);

    const techEntries = [...entry.techs.entries()]
      .map(([tid, v]) => ({ id: tid, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const row = document.createElement("div");
    row.className = "badgeRow";

    row.innerHTML = `
      <div class="badgeLeft">
        <div class="badgeTitle">
          <span class="badgeDot" style="background:${badgeInfo.color}; box-shadow:0 0 0 4px ${badgeInfo.color}22;"></span>
          <span class="badgeLabel">
            <span>${badgeInfo.label}</span>
            <span class="badgeId">${badgeInfo.id}</span>
          </span>
        </div>
        <div class="badgeMeta">${entry.btCount} BT • ${techEntries.length} technicien(s)</div>
      </div>
      <div class="badgeRight" id="badge_${badgeInfo.id.replace(/[^A-Z0-9_]/gi, "_")}"></div>
    `;

    container.appendChild(row);

    const right = row.querySelector(".badgeRight");
    if (!right) continue;

    if (!techEntries.length) {
      const empty = document.createElement("div");
      empty.className = "emptyLine";
      empty.textContent = "— Aucun —";
      right.appendChild(empty);
      continue;
    }

    for (const t of techEntries) {
      const chip = document.createElement("button");
      chip.className = "techChip";
      chip.type = "button";
      chip.title = `Filtrer sur ${t.name}`;
      chip.innerHTML = `<span>${t.name}</span><span class="techChipCount">${t.count}</span>`;
      chip.addEventListener("click", () => applyTechFilter(t.id));
      right.appendChild(chip);
    }
  }
}

// -------------------------
// API appelée par main.js : renderTimeline(filtered, timelineEl)
// -------------------------
function renderTimeline(filtered, timelineEl) {
  renderBadgeView(filtered || [], timelineEl);
}

window.renderTimeline = renderTimeline;
window.renderBadgeView = renderBadgeView;
