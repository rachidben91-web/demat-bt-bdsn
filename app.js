// DEMAT-BT — Site V1 (Référent + Brief Flip)
// - Import PDF → extraction BT via zones.json
// - Regroupement: toutes pages après un BT jusqu’au BT suivant
// - Classification docs: BT / AT / PROC / PLAN / PHOTO / STREET / DOC
// - Dashboard Référent + Vue Brief (filtrage par technicien)
// - Aperçu page + export BT (PDF) via pdf-lib

const $ = (id) => document.getElementById(id);

let zonesConfig = null;
let pdfFile = null;
let pdfDoc = null;
let extracted = []; // [{btId, fields, pages:[{pageNum,type,excerpt}], team:[], atNum, ...}]
let filters = { q: "", types: new Set(), techId: "" };

let modalState = { open: false, btIndex: -1, pageCursor: 0 };

const DOC_TYPES = ["BT", "AT", "PROC", "PLAN", "PHOTO", "STREET", "DOC"];

function setProgress(msg, pct) {
  $("progMsg").textContent = msg;
  $("progBar").style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function norm(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[c]));
}

function insideBBox(x, y, bbox) {
  return x >= bbox.x0 && x <= bbox.x1 && y >= bbox.y0 && y <= bbox.y1;
}

// Extract text inside bbox using pdf.js items
async function extractZoneText(page, bbox) {
  if (!bbox) return "";
  const tc = await page.getTextContent();
  const picked = [];
  for (const it of tc.items) {
    const x = it.transform[4];
    const y = it.transform[5];
    if (insideBBox(x, y, bbox)) picked.push(it);
  }
  picked.sort((a, b) => (b.transform[5] - a.transform[5]) || (a.transform[4] - b.transform[4]));
  return norm(picked.map(it => it.str).join(" "));
}

function parseBtId(btNumText) {
  const m = (btNumText || "").match(/BT\d{11}/i);
  return m ? m[0].toUpperCase() : "";
}

function parseAtId(atText) {
  const m = (atText || "").match(/\b(PRO\d+)\b/i);
  return m ? m[1].toUpperCase() : "";
}

function extractDateFromFilename(name) {
  const m = (name || "").match(/(\d{4})(\d{2})(\d{2})_\d{4}\.pdf$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function classifyPageType(fullText, isBtStart) {
  const up = (fullText || "").toUpperCase();
  if (isBtStart) return "BT";
  if (up.includes("FICHE AT") || up.includes("AT N") || (up.includes("AUTORISATION") && up.includes("TRAVAIL"))) return "AT";
  if (up.includes("PROCÉDURE D'EXÉCUTION") || up.includes("PROCEDURE D'EXECUTION") || up.includes("PROCÉDURE D'EXECUTION")) return "PROC";
  if ((up.includes("ECHELLE") && up.includes("1/200")) || up.includes("PLAN") && up.includes("1/200")) return "PLAN";
  if (up.includes("GOOGLE") && up.includes("STREET")) return "STREET";

  const compact = up.replace(/\s+/g, "");
  if (compact.length < 140) return "PHOTO";
  return "DOC";
}

function parseTeamFromRealisation(text) {
  // NNI pattern: A94073 (1 letter + 5 digits)
  // We take lines-ish from normalized text; will still work because it contains NNI then names.
  const t = (text || "").replace(/\s+/g, " ").trim();
  const re = /([A-Z]\d{5})\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'\- ]{2,40})/g;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const nni = m[1];
    const name = norm(m[2]);
    if (!out.some(x => x.nni === nni)) out.push({ nni, name });
  }
  return out;
}

function mapTech(teamItem) {
  const techs = window.TECHNICIANS || [];
  // Prefer NNI match, else loose lastname match
  const byNni = teamItem?.nni ? techs.find(t => (t.nni || "").toUpperCase() === teamItem.nni.toUpperCase()) : null;
  if (byNni) return byNni;

  const last = (teamItem?.name || "").trim().split(/\s+/)[0]?.toUpperCase();
  if (!last) return null;
  const byLast = techs.find(t => (t.name || "").toUpperCase().startsWith(last + " "));
  return byLast || null;
}

function buildTypeChips() {
  const root = $("typeChips");
  root.innerHTML = "";
  DOC_TYPES.forEach(t => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = t;
    btn.addEventListener("click", () => {
      if (filters.types.has(t)) filters.types.delete(t);
      else filters.types.add(t);
      renderAll();
    });
    root.appendChild(btn);
  });
  syncTypeChipsUI();
}

function syncTypeChipsUI() {
  const chips = $("typeChips").querySelectorAll(".chip");
  chips.forEach(ch => {
    const t = ch.textContent.trim();
    ch.classList.toggle("chip--active", filters.types.has(t));
  });
}

function populateTechSelect() {
  const sel = $("techSelect");
  const techs = window.TECHNICIANS || [];
  // reset options except first
  sel.innerHTML = `<option value="">— Tous —</option>`;
  techs
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
}

function updateButtons() {
  $("btnExtract").disabled = !(zonesConfig && pdfFile);
}

async function loadZones() {
  try {
    const res = await fetch("./zones.json", { cache: "no-store" });
    zonesConfig = await res.json();
    $("zonesStatus").textContent = `OK: ${zonesConfig.template} (${zonesConfig.units})`;
  } catch (e) {
    zonesConfig = null;
    $("zonesStatus").textContent = `Erreur: zones.json introuvable/illisible`;
  }
  updateButtons();
}

function setView(name) {
  const isReferent = name === "referent";
  $("viewReferent").classList.toggle("view--active", isReferent);
  $("viewBrief").classList.toggle("view--active", !isReferent);

  document.querySelectorAll(".seg__btn").forEach(b => {
    b.classList.toggle("seg__btn--active", b.dataset.view === name);
  });
}

function applyFilters(list) {
  const q = filters.q.toLowerCase();
  const typeSet = filters.types;

  return list.filter(bt => {
    // text filter
    const blob = [
      bt.btId,
      bt.fields?.OBJET,
      bt.fields?.CLIENT_NOM,
      bt.fields?.LOCALISATION,
      bt.fields?.REFERENCE_PDL,
      bt.atNum
    ].join(" ").toLowerCase();

    const okQ = !q || blob.includes(q);

    // type filter: require at least one selected type present
    const okTypes = typeSet.size === 0 || bt.pages.some(p => typeSet.has(p.type));

    // tech filter: for brief, we filter by mapped techId in bt.mappedTechIds
    const okTech = !filters.techId || (bt.mappedTechIds || []).includes(filters.techId);

    return okQ && okTypes && okTech;
  });
}

function computeKpis(list) {
  const totalBt = list.length;
  let pages = 0;
  const typeCounts = {};
  DOC_TYPES.forEach(t => typeCounts[t] = 0);

  list.forEach(bt => {
    pages += bt.pages.length;
    bt.pages.forEach(p => typeCounts[p.type] = (typeCounts[p.type] || 0) + 1);
  });

  return { totalBt, pages, typeCounts };
}

function renderKpis(list) {
  const { totalBt, pages, typeCounts } = computeKpis(list);
  const root = $("kpis");
  root.innerHTML = `
    <div class="kpi"><b>${totalBt}</b> BT</div>
    <div class="kpi"><b>${pages}</b> pages</div>
    <div class="kpi"><b>${typeCounts.AT || 0}</b> AT</div>
    <div class="kpi"><b>${typeCounts.PROC || 0}</b> Proc</div>
    <div class="kpi"><b>${typeCounts.PLAN || 0}</b> Plans</div>
    <div class="kpi"><b>${typeCounts.PHOTO || 0}</b> Photos</div>
    <div class="kpi"><b>${typeCounts.DOC || 0}</b> Docs</div>
  `;
}

function docBadges(bt) {
  const counts = bt.pages.reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {});
  const order = ["BT","AT","PROC","PLAN","PHOTO","STREET","DOC"];
  return order
    .filter(t => counts[t])
    .map(t => `<span class="badge ${t==="BT" ? "badge--strong" : ""}">${t}:${counts[t]}</span>`)
    .join("");
}

function btCardHTML(bt, idx) {
  const date = bt.fields?.DATE_PREVUE || bt.date || "";
  const duree = bt.fields?.DUREE || "";
  const client = bt.fields?.CLIENT_NOM || "";
  const addr = bt.fields?.LOCALISATION || "";
  const objet = bt.fields?.OBJET || "";
  const at = bt.atNum ? `AT ${bt.atNum}` : "AT —";

  const team = (bt.teamMapped || []).map(t => t.name).join(", ");
  const teamLine = team ? `👥 ${escapeHtml(team)}` : "👥 —";

  return `
    <div class="card btCard">
      <div class="btTop">
        <div>
          <div class="btId">${escapeHtml(bt.btId || "BT ?")}</div>
          <div class="sub">${escapeHtml(objet).slice(0, 110)}</div>
        </div>
        <div class="badge badge--strong">${escapeHtml(at)}</div>
      </div>

      <div class="badges">${docBadges(bt)}</div>

      <div class="btMeta">
        📅 ${escapeHtml(date)} &nbsp;•&nbsp; ⏱️ ${escapeHtml(duree)}<br/>
        👤 ${escapeHtml(client)}<br/>
        📍 ${escapeHtml(addr)}<br/>
        ${teamLine}
      </div>

      <div class="btActions">
        <button class="btn btn--secondary" data-open="${idx}">Aperçu</button>
        <button class="btn" data-export="${idx}">Exporter BT</button>
      </div>
    </div>
  `;
}

function renderBtGrid(list) {
  const root = $("btGrid");
  if (!list.length) {
    root.innerHTML = `<div class="card" style="padding:12px"><div class="hint">Aucun BT (ou filtre trop strict).</div></div>`;
    return;
  }
  root.innerHTML = list.map((bt, idx) => btCardHTML(bt, idx)).join("");

  // Wire buttons using original extracted index
  root.querySelectorAll("[data-open]").forEach(btn => {
    btn.addEventListener("click", () => openModal(Number(btn.dataset.open)));
  });
  root.querySelectorAll("[data-export]").forEach(btn => {
    btn.addEventListener("click", () => exportBtPdf(Number(btn.dataset.export)));
  });
}

function briefCardHTML(bt, idx) {
  const objet = bt.fields?.OBJET || "";
  const addr = bt.fields?.LOCALISATION || "";
  const client = bt.fields?.CLIENT_NOM || "";
  const date = bt.fields?.DATE_PREVUE || bt.date || "";
  const at = bt.atNum ? `AT ${bt.atNum}` : "AT —";

  // Doc buttons -> open preview at first page of that type
  const typeOrder = ["BT","AT","PROC","PLAN","PHOTO","STREET","DOC"];
  const btns = typeOrder
    .filter(t => bt.pages.some(p => p.type === t))
    .map(t => `<button class="docBtn" data-doc="${idx}:${t}">${t}</button>`)
    .join("");

  const team = (bt.teamMapped || []).map(t => t.name).join(", ");
  const teamLine = team ? `👥 ${escapeHtml(team)}` : "👥 —";

  return `
    <div class="card briefCard">
      <h3 class="briefTitle">${escapeHtml(bt.btId)} — ${escapeHtml(objet).slice(0, 90)}</h3>
      <div class="briefSub">
        📅 ${escapeHtml(date)} • 📍 ${escapeHtml(addr)}<br/>
        👤 ${escapeHtml(client)} • 🧾 ${escapeHtml(at)}<br/>
        ${teamLine}
      </div>
      <div class="briefDocs">
        ${btns}
      </div>
    </div>
  `;
}

function renderBrief(list) {
  const root = $("briefList");
  if (!list.length) {
    root.innerHTML = `<div class="card" style="padding:12px"><div class="hint">Aucun BT à afficher pour ce technicien / ces filtres.</div></div>`;
    return;
  }
  root.innerHTML = list.map((bt, idx) => briefCardHTML(bt, idx)).join("");

  root.querySelectorAll("[data-doc]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [idxStr, type] = btn.dataset.doc.split(":");
      const idx = Number(idxStr);
      const pageCursor = findFirstPageCursor(list[idx], type);
      // Need index in extracted: use bt.__index
      openModal(list[idx].__index, pageCursor);
    });
  });
}

function findFirstPageCursor(bt, type) {
  const i = bt.pages.findIndex(p => p.type === type);
  return i >= 0 ? i : 0;
}

function renderAll() {
  syncTypeChipsUI();

  const baseList = extracted.map((bt, i) => ({ ...bt, __index: i }));
  const list = applyFilters(baseList);

  renderKpis(list);
  renderBtGrid(list);

  // Brief meta
  const tech = (window.TECHNICIANS || []).find(t => t.id === filters.techId);
  $("briefMeta").textContent = tech ? `Technicien sélectionné : ${tech.name}` : "Technicien : — Tous —";

  renderBrief(list);
}

// Modal / viewer
function showModal(show) {
  const m = $("modal");
  m.setAttribute("aria-hidden", show ? "false" : "true");
  modalState.open = show;
}

async function renderPdfPage(pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");

  const viewport = page.getViewport({ scale: 1.35 });
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;
}

async function openModal(btIndex, pageCursor = 0) {
  const bt = extracted[btIndex];
  if (!bt) return;

  modalState.btIndex = btIndex;
  modalState.pageCursor = pageCursor;

  const p = bt.pages[pageCursor] || bt.pages[0];
  $("modalTitle").textContent = `${bt.btId} — ${p.type}`;
  $("modalSubtitle").textContent = `${bt.fields?.CLIENT_NOM || ""} • ${bt.fields?.LOCALISATION || ""}`;

  $("btnPrevPage").disabled = pageCursor <= 0;
  $("btnNextPage").disabled = pageCursor >= bt.pages.length - 1;

  $("modalInfo").textContent = `Page ${p.pageNum} • ${p.type} • Documents: ${bt.pages.length} • AT: ${bt.atNum || "—"}`;

  showModal(true);
  await renderPdfPage(p.pageNum);
}

async function goModal(delta) {
  const bt = extracted[modalState.btIndex];
  if (!bt) return;
  const next = Math.max(0, Math.min(bt.pages.length - 1, modalState.pageCursor + delta));
  await openModal(modalState.btIndex, next);
}

async function exportBtPdf(btIndex) {
  if (!pdfFile) return;
  const bt = extracted[btIndex];
  if (!bt) return;

  setProgress("Export PDF BT…", 90);

  const srcBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const srcDoc = await PDFLib.PDFDocument.load(srcBytes);
  const out = await PDFLib.PDFDocument.create();

  const pageIndices = bt.pages.map(p => p.pageNum - 1);
  const copied = await out.copyPages(srcDoc, pageIndices);
  copied.forEach(p => out.addPage(p));

  const outBytes = await out.save();
  const blob = new Blob([outBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${bt.btId}_${(bt.fields?.DATE_PREVUE || bt.date || "").replaceAll("/","-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  setProgress("Terminé.", 100);
}

// Extraction logic
async function extractAll() {
  extracted = [];
  setProgress("Chargement PDF…", 5);

  const ab = await pdfFile.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: ab }).promise;

  const total = pdfDoc.numPages;
  const dateFromName = extractDateFromFilename(pdfFile.name);

  const btZones = zonesConfig?.pages?.BT;
  if (!btZones) throw new Error("zones.json: pages.BT introuvable");

  let currentBt = null;

  function finalizeCurrent(endPage) {
    if (!currentBt) return;

    currentBt.endPage = endPage;

    // AT
    currentBt.atNum = parseAtId(currentBt.fields?.AT_NUM || "");
    currentBt.hasAT = !!currentBt.atNum || currentBt.pages.some(p => p.type === "AT");

    // Team mapping
    const teamRaw = parseTeamFromRealisation(currentBt.fields?.REALISATION || "");
    const mapped = [];
    const mappedIds = [];
    teamRaw.forEach(item => {
      const t = mapTech(item);
      if (t) {
        if (!mappedIds.includes(t.id)) mappedIds.push(t.id);
        if (!mapped.some(x => x.id === t.id)) mapped.push(t);
      }
    });

    currentBt.teamRaw = teamRaw;
    currentBt.teamMapped = mapped;
    currentBt.mappedTechIds = mappedIds;

    extracted.push(currentBt);
    currentBt = null;
  }

  for (let pageNum = 1; pageNum <= total; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);

    // Detect BT start by BT_NUM zone
    const btNumText = await extractZoneText(page, btZones.BT_NUM?.bbox);
    const btId = parseBtId(btNumText);
    const isBtStart = !!btId;

    if (isBtStart) {
      finalizeCurrent(pageNum - 1);

      // Extract all fields on start page using zones
      const fields = {};
      for (const k of Object.keys(btZones)) {
        const bbox = btZones[k]?.bbox;
        if (!bbox) continue;
        fields[k] = await extractZoneText(page, bbox);
      }

      currentBt = {
        btId,
        date: dateFromName,
        startPage: pageNum,
        endPage: pageNum,
        fields,
        pages: []
      };
    }

    if (currentBt) {
      // for classification, use light full text
      const tc = await page.getTextContent();
      const hintText = tc.items.map(it => it.str).join(" ");
      const type = classifyPageType(hintText, isBtStart);

      currentBt.pages.push({
        pageNum,
        type,
        excerpt: norm(hintText).slice(0, 160)
      });
    }

    if (pageNum % 5 === 0) {
      const pct = 10 + Math.round((pageNum / total) * 80);
      setProgress(`Analyse page ${pageNum}/${total}…`, pct);
    }
  }

  finalizeCurrent(total);
  setProgress(`Terminé. ${extracted.length} BT détecté(s).`, 100);
}

// UI wiring
function wireUI() {
  // View switch
  document.querySelectorAll(".seg__btn").forEach(b => {
    b.addEventListener("click", () => setView(b.dataset.view));
  });

  // File input
  $("pdfFile").addEventListener("change", (e) => {
    pdfFile = e.target.files?.[0] || null;
    $("pdfStatus").textContent = pdfFile ? `OK: ${pdfFile.name}` : "Aucun PDF chargé";
    updateButtons();
  });

  // Extract
  $("btnExtract").addEventListener("click", async () => {
    try {
      $("btnExtract").disabled = true;
      setProgress("Démarrage…", 1);
      await extractAll();
      renderAll();
    } catch (err) {
      console.error(err);
      alert(err.message);
      setProgress(`Erreur: ${err.message}`, 0);
    } finally {
      updateButtons();
    }
  });

  // Search
  $("searchInput").addEventListener("input", (e) => {
    filters.q = e.target.value || "";
    renderAll();
  });

  // Tech select
  $("techSelect").addEventListener("change", (e) => {
    filters.techId = e.target.value || "";
    renderAll();
  });

  // Fullscreen (Flip)
  $("btnFullscreen").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  });

  // Chips
  buildTypeChips();

  // Modal
  $("modal").addEventListener("click", (e) => {
    const close = e.target?.dataset?.close;
    if (close) showModal(false);
  });
  $("btnPrevPage").addEventListener("click", () => goModal(-1));
  $("btnNextPage").addEventListener("click", () => goModal(+1));
  $("btnExportBt").addEventListener("click", () => exportBtPdf(modalState.btIndex));

  // Flip mode toggling when brief view active
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg__btn");
    if (!btn) return;
    if (btn.dataset.view === "brief") document.body.classList.add("flip");
    else document.body.classList.remove("flip");
  });
}

// Boot
(async function init() {
  setProgress("Chargement zones…", 0);
  await loadZones();
  populateTechSelect();
  wireUI();
  renderAll();
  setProgress("Prêt.", 0);
})();
