/* js/ui/grid.js — DEMAT-BT v11.0.0 — 16/02/2026
   Vue vignettes (cartes) — utilise les composants partagés
   Mise à jour : Intégration des classes de précision pour les types de docs
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

    // Top : ID + badges de comptage par type
    const topDiv = document.createElement("div");
    topDiv.className = "btTop";

    const leftSection = document.createElement("div");
    leftSection.className = "btTop__left";

    const idDiv = document.createElement("div");
    idDiv.className = "btId";
    idDiv.textContent = bt.id || "BT ?";

    leftSection.appendChild(idDiv);
    leftSection.appendChild(createCategoryBadge(bt, "sm")); // Pastille métier
    topDiv.appendChild(leftSection);
    
    // Les badges de comptage utilisent maintenant les couleurs de DOC_TYPES_CONFIG
    topDiv.appendChild(createDocBadges(bt));

    // Meta info (Date, Client, Adresse)
    const metaDiv = createBTMeta(bt);
    
    // Équipe et badges PTC/PTD
    const teamContainer = document.createElement("div");
    teamContainer.appendChild(createTeamLine(bt));
    metaDiv.appendChild(teamContainer);

    card.appendChild(topDiv);
    card.appendChild(metaDiv);
    
    // Boutons d'action (Utilisent les classes .doc-btn--type pour la précision)
    card.appendChild(createDocButtons(bt, { className: "btActions" }));
    
    grid.appendChild(card);
  }
}
