/* js/ui/brief.js — DEMAT-BT v11.0.0 — 15/02/2026
   Vue Brief (optimisée Samsung Flip 55") — utilise les composants partagés
*/

function renderBrief(filtered) {
  const list = $("briefList");
  const meta = $("briefMeta");
  if (!list) return;

  if (!state.filters.techId) {
    if (meta) meta.textContent = "";
    list.innerHTML = `<div class="hint" style="padding:16px;">
      Mode <b>Brief</b> : sélectionne un technicien à gauche.
    </div>`;
    return;
  }

  const techs = window.TECHNICIANS || [];
  const t = techs.find(x => techKey(x) === state.filters.techId);
  if (meta) meta.textContent = t ? `${t.name} — ${filtered.length} BT` : "";

  list.innerHTML = "";
  if (filtered.length === 0) {
    list.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT pour ce technicien.</div>`;
    return;
  }

  for (const bt of filtered) {
    const card = document.createElement("div");
    card.className = "card briefCard";

    // Titre : ID + badge catégorie + PTC/PTD
    const titleDiv = document.createElement("div");
    titleDiv.className = "briefCard__title";

    const idSpan = document.createElement("div");
    idSpan.className = "briefTitle";
    idSpan.style.margin = "0";
    idSpan.textContent = bt.id;

    titleDiv.appendChild(idSpan);
    titleDiv.appendChild(createCategoryBadge(bt, "md"));

    // Badges PTC/PTD dans le titre
    if (bt.team) {
      bt.team.forEach(member => {
        const tech = mapTechByNni(member.nni);
        if (tech && (tech.ptc || tech.ptd)) {
          titleDiv.appendChild(createPtcPtdBadge(tech));
        }
      });
    }

    // Contenu
    const subDiv = document.createElement("div");
    subDiv.className = "briefSub";

    // Infos principales
    const mainInfo = document.createElement("div");
    mainInfo.className = "briefSub__main";
    const duree = formatDuree(bt.duree);
    mainInfo.innerHTML = `
      <div>📋 ${bt.objet || "—"}</div>
      <div>📅 ${bt.datePrevue || "—"}</div>
      ${duree ? `<div>⏱️ ${duree}</div>` : ""}
      <div>👤 ${bt.client || "—"}</div>
      <div>📍 ${bt.localisation || "—"}</div>
      ${bt.atNum ? `<div>🧾 ${bt.atNum}</div>` : ""}
    `;
    subDiv.appendChild(mainInfo);

    // Analyse des risques + observations
    const blocks = createInfoBlocks(bt);
    if (blocks) subDiv.appendChild(blocks);

    // Boutons documents
    const docsDiv = createDocButtons(bt, { className: "briefDocs" });

    card.appendChild(titleDiv);
    card.appendChild(subDiv);
    card.appendChild(docsDiv);
    list.appendChild(card);
  }
}
