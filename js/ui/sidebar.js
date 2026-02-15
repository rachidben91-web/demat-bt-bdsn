/* js/ui/sidebar.js — DEMAT-BT v11.0.0 — 15/02/2026
   Sidebar : liste techniciens, filtres type, recherche, KPIs
*/

// -------------------------
// Chips type de document
// -------------------------
function buildTypeChips() {
  const root = $("typeChips");
  if (!root) return;

  const docCounts = new Map();
  for (const bt of state.bts) {
    for (const doc of bt.docs || []) {
      docCounts.set(doc.type, (docCounts.get(doc.type) || 0) + 1);
    }
  }

  root.innerHTML = "";
  for (const t of DOC_TYPES) {
    const config = DOC_TYPES_CONFIG[t];
    const count = docCounts.get(t) || 0;
    if (count === 0 && t !== "BT") continue;

    const chip = document.createElement("button");
    chip.className = "chip" + (state.filters.types.has(t) ? " chip--active" : "");
    chip.innerHTML = `${config.icon} ${t} <span style="opacity:0.7">${count}</span>`;
    chip.addEventListener("click", () => {
      if (state.filters.types.has(t)) state.filters.types.delete(t);
      else state.filters.types.add(t);
      buildTypeChips();
      renderAll();
    });
    root.appendChild(chip);
  }
}

const day = extractDayFromFilename(state.pdfFile?.name);

if (day) {
  pdfLabelElement.innerHTML = `
    <div class="pdf-day-wrapper">
      <div class="pdf-day-label">JOURNÉE</div>
      <div class="pdf-day-badge">
        <span class="pdf-day-icon">📅</span>
        <span>${day}</span>
      </div>
    </div>
  `;
} else {
  pdfLabelElement.textContent = state.pdfFile?.name || "Aucun PDF chargé";
}

// -------------------------
// Liste techniciens (select dropdown avec compteurs)
// -------------------------
function renderTechList() {
  const sel = $("techSelect");
  if (!sel) return;

  const techs = window.TECHNICIANS || [];
  const currentVal = sel.value || state.filters.techId || "";

  sel.innerHTML = `<option value="">— Tous —</option>`;

  // Trier : ceux avec des BT d'abord, puis par nom
  const sorted = [...techs].sort((a, b) => {
    const ca = state.countsByTechId.get(techKey(a)) || 0;
    const cb = state.countsByTechId.get(techKey(b)) || 0;
    if (cb !== ca) return cb - ca;
    return (a.name || "").localeCompare(b.name || "");
  });

  for (const tech of sorted) {
    const key = techKey(tech);
    const count = state.countsByTechId.get(key) || 0;
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = count > 0 ? `${tech.name} (${count} BT)` : tech.name;
    if (key === currentVal) opt.selected = true;
    sel.appendChild(opt);
  }
}

// -------------------------
// KPIs
// -------------------------
function renderKpis(filtered) {
  const kpis = $("kpis");
  if (!kpis) return;

  const totalBT = filtered.length;
  const docsCount = filtered.reduce((acc, bt) => acc + (bt.docs?.length || 0), 0);

  kpis.innerHTML = `
    <div class="kpi"><b>${totalBT}</b> BT</div>
    <div class="kpi"><b>${docsCount}</b> Pages liées</div>
  `;
}

// -------------------------
// Filtre BT
// -------------------------
function filterBTs() {
  return state.bts.filter(bt => {
    // Filtre recherche texte
    if (state.filters.q) {
      const q = state.filters.q.toLowerCase();
      const searchable = [bt.id, bt.objet, bt.client, bt.localisation, bt.atNum]
        .filter(Boolean).join(" ").toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    // Filtre types de document
    if (state.filters.types.size > 0) {
      const btTypes = new Set((bt.docs || []).map(d => d.type));
      const hasMatch = [...state.filters.types].some(t => btTypes.has(t));
      if (!hasMatch) return false;
    }

    // Filtre technicien
    if (state.filters.techId) {
      const wanted = state.filters.techId;
      const has = (bt.team || []).some(m => {
        const tech = mapTechByNni(m.nni);
        return techKey(tech) === wanted;
      });
      if (!has) return false;
    }

    return true;
  });
}
