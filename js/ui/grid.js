/* js/ui/grid.js — DEMAT-BT v11.0.0 — 15/02/2026
   Vue vignettes (cartes) — utilise les composants partagés
*/

function renderGrid(filtered, grid) {
  grid.innerHTML = "";
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT à afficher avec ces filtres.</div>`;
    return;
  }

  for (const bt of filtered) {
    const card = document.createElement("div");
    card.className = "card btCard";

    // Top : ID + badges documents
    const topDiv = document.createElement("div");
    topDiv.className = "btTop";

    const leftSection = document.createElement("div");
    leftSection.className = "btTop__left";

    const idDiv = document.createElement("div");
    idDiv.className = "btId";
    idDiv.textContent = bt.id || "BT ?";

    leftSection.appendChild(idDiv);
    leftSection.appendChild(createCategoryBadge(bt, "sm"));
    topDiv.appendChild(leftSection);
    topDiv.appendChild(createDocBadges(bt));

    // Meta info
    const metaDiv = createBTMeta(bt);
    const teamContainer = document.createElement("div");
    teamContainer.appendChild(createTeamLine(bt));
    metaDiv.appendChild(teamContainer);

    card.appendChild(topDiv);
    card.appendChild(metaDiv);
    card.appendChild(createDocButtons(bt, { className: "btActions" }));
    grid.appendChild(card);
  }
}
