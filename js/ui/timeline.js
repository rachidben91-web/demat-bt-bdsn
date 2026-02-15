/* js/ui/timeline.js — DEMAT-BT v11.0.0 — 15/02/2026
   Vue timeline (planning journalier 7h30 → 17h00)
*/

function renderTimeline(filtered, timeline) {
  timeline.innerHTML = "";
  if (filtered.length === 0) {
    timeline.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT à afficher.</div>`;
    return;
  }

  // Construire la grille horaire (quarts d'heure)
  const timeSlots = [];
  for (let h = 7; h <= 17; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 7 && m < 30) continue;
      if (h === 17 && m > 0) continue;
      timeSlots.push({
        hour: h, min: m,
        value: h + m / 60,
        label: m === 0 ? `${h}h` : `${String(m).padStart(2, "0")}`,
        isHour: m === 0
      });
    }
  }

  // Grouper BT par technicien
  const btsByTech = new Map();
  for (const bt of filtered) {
    for (const m of bt.team || []) {
      const tech = mapTechByNni(m.nni);
      const key = tech ? techKey(tech) : m.nni;
      const name = tech ? tech.name : m.name;
      if (!btsByTech.has(key)) btsByTech.set(key, []);
      btsByTech.get(key).push(bt);
    }
  }

  const techs = [...btsByTech.entries()].map(([id, bts]) => {
    const tech = (window.TECHNICIANS || []).find(t => techKey(t) === id);
    return [id, tech ? tech.name : id, bts];
  }).sort((a, b) => a[1].localeCompare(b[1]));

  // Container
  const container = document.createElement("div");
  container.style.overflowX = "auto";

  const grid = document.createElement("div");
  grid.className = "timeline-grid";
  grid.style.gridTemplateColumns = `200px repeat(${timeSlots.length}, minmax(35px, 1fr))`;
  grid.style.gridTemplateRows = `48px repeat(${techs.length}, 56px)`;

  // Header
  const corner = document.createElement("div");
  corner.className = "timeline-corner";
  corner.textContent = `👥 ${techs.length} techniciens`;
  grid.appendChild(corner);

  timeSlots.forEach((slot, i) => {
    const cell = document.createElement("div");
    cell.className = "timeline-hour";
    cell.style.gridColumn = i + 2;
    cell.style.fontSize = slot.isHour ? "11px" : "9px";
    cell.style.fontWeight = slot.isHour ? "700" : "600";
    cell.style.color = slot.isHour ? "var(--txt)" : "var(--muted)";
    cell.textContent = slot.label;
    grid.appendChild(cell);
  });

  // Lignes techniciens
  techs.forEach(([techId, techName, techBTs], techIdx) => {
    const rowNum = techIdx + 2;

    // Cellule nom
    const techCell = document.createElement("div");
    techCell.className = "timeline-tech";
    techCell.style.gridRow = rowNum;

    const avatar = document.createElement("div");
    avatar.className = "timeline-tech-avatar";
    avatar.textContent = techName.substring(0, 2).toUpperCase();

    const nameDiv = document.createElement("div");
    nameDiv.style.cssText = "font-size:12px;line-height:1.3;";
    nameDiv.textContent = techName;

    techCell.appendChild(avatar);
    techCell.appendChild(nameDiv);
    grid.appendChild(techCell);

    // Cellules vides
    for (let i = 0; i < timeSlots.length; i++) {
      const cell = document.createElement("div");
      cell.className = "timeline-cell";
      cell.style.gridRow = rowNum;
      cell.style.gridColumn = i + 2;
      if (timeSlots[i].isHour) cell.style.borderLeft = "2px solid var(--line-strong)";
      grid.appendChild(cell);
    }

    // Blocs BT
    techBTs.forEach(bt => {
      const timeSlot = extractTimeSlot(bt);
      const classification = classifyIntervention(bt);
      const metierIds = Array.isArray(bt.badges) ? bt.badges : [];
      const primaryMetier = metierIds.length ? getBadgeCfg(metierIds[0]) : null;

      let startCol, colSpan;
      if (timeSlot) {
        const startVal = Math.max(timeSlot.start, 7.5);
        const endVal = Math.min(timeSlot.end, 17);
        startCol = Math.round((startVal - 7.5) * 4) + 2;
        colSpan = Math.max(1, Math.round((endVal - startVal) * 4));
      } else {
        startCol = 2;
        colSpan = 2;
      }

      const color = primaryMetier?.color || classification.color;

      const btDiv = document.createElement("div");
      btDiv.className = "timeline-bt-block";
      btDiv.style.gridRow = rowNum;
      btDiv.style.gridColumn = `${startCol} / span ${colSpan}`;
      btDiv.style.background = `linear-gradient(135deg, ${color}, ${color}dd)`;
      btDiv.style.borderRadius = "6px";
      btDiv.style.padding = "4px 8px";
      btDiv.style.cursor = "pointer";
      btDiv.style.overflow = "hidden";
      btDiv.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
      btDiv.title = `${bt.id} — ${bt.objet || ""}`;

      const idDiv = document.createElement("div");
      idDiv.className = "timeline-bt-id";
      idDiv.textContent = bt.id;
      btDiv.appendChild(idDiv);

      const typeDiv = document.createElement("div");
      typeDiv.className = "timeline-bt-type";
      typeDiv.textContent = primaryMetier ? primaryMetier.label : classification.label;
      btDiv.appendChild(typeDiv);

      if (timeSlot && colSpan >= 4) {
        const timeDiv = document.createElement("div");
        timeDiv.className = "timeline-bt-time";
        timeDiv.textContent = timeSlot.text;
        btDiv.appendChild(timeDiv);
      }

      btDiv.addEventListener("click", () => openModal(bt, bt.pageStart));
      grid.appendChild(btDiv);
    });
  });

  container.appendChild(grid);
  timeline.appendChild(container);
}
