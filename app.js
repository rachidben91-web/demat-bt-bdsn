/* DEMAT-BT — V1.3
   - Interface gris doux
   - PDF.js viewer
   - Extraction simple (démo) -> liste BT à partir du texte
   - Timeline stable 07:30 → 17:00 (pas 30 min)
*/

const APP_VERSION = "V1.3";

const $ = (id) => document.getElementById(id);

const el = {
  appVersion: $("appVersion"),
  nowInfo: $("nowInfo"),

  pdfFile: $("pdfFile"),
  btnView: $("btnView"),
  btnExtract: $("btnExtract"),

  pdfStatus: $("pdfStatus"),
  extractStatus: $("extractStatus"),

  pdfCanvas: $("pdfCanvas"),
  viewerOverlay: $("viewerOverlay"),

  btnPrev: $("btnPrev"),
  btnNext: $("btnNext"),
  pageNum: $("pageNum"),
  pageCount: $("pageCount"),
  pdfMeta: $("pdfMeta"),

  btList: $("btList"),
  btPreview: $("btPreview"),

  timelineHeader: $("timelineHeader"),
  timelineGrid: $("timelineGrid"),
};

const state = {
  file: null,
  arrayBuffer: null,
  pdfDoc: null,
  pageNumber: 1,
  pageCount: 0,
  extractedText: "",
  btItems: [], // {id, title, meta, excerpt}
  selectedBtId: null,
};

function pad2(n){ return String(n).padStart(2,"0"); }

function setNowInfo(){
  const d = new Date();
  const fr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(d);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  el.nowInfo.textContent = `${fr} • ${hm}`;
}

function setStatusPdf(msg){ el.pdfStatus.textContent = msg; }
function setStatusExtract(msg){ el.extractStatus.textContent = msg; }

function setButtonsEnabled(){
  const hasFile = !!state.file;
  const hasPdf = !!state.pdfDoc;

  el.btnView.disabled = !hasFile;
  el.btnExtract.disabled = !hasFile;

  el.btnPrev.disabled = !(hasPdf && state.pageNumber > 1);
  el.btnNext.disabled = !(hasPdf && state.pageNumber < state.pageCount);
}

function humanFileSize(bytes){
  if (!bytes && bytes !== 0) return "—";
  const units = ["B","KB","MB","GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length-1){ v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* -------------------- PDF VIEWER (PDF.js) -------------------- */
async function loadPdfFromArrayBuffer(arrayBuffer){
  if (!window.pdfjsLib){
    setStatusPdf("PDF.js non chargé (CDN bloqué ?)");
    return;
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";

  try{
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    state.pdfDoc = await loadingTask.promise;

    state.pageCount = state.pdfDoc.numPages;
    state.pageNumber = 1;

    el.pageCount.textContent = String(state.pageCount);
    el.pdfMeta.textContent = `Pages: ${state.pageCount}`;

    await renderPage(state.pageNumber);
    el.viewerOverlay.style.display = "none";

    setButtonsEnabled();
  } catch(err){
    console.error(err);
    setStatusPdf("Erreur de chargement PDF");
  }
}

async function renderPage(num){
  if (!state.pdfDoc) return;

  const page = await state.pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: 1.4 });

  const canvas = el.pdfCanvas;
  const ctx = canvas.getContext("2d");

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const renderContext = { canvasContext: ctx, viewport };
  await page.render(renderContext).promise;

  el.pageNum.textContent = String(num);
  setButtonsEnabled();
}

/* -------------------- EXTRACTION SIMPLE -------------------- */
async function extractAllText(){
  if (!state.pdfDoc) {
    await loadPdfFromArrayBuffer(state.arrayBuffer);
    if (!state.pdfDoc) return "";
  }

  setStatusExtract("Extraction en cours…");

  let full = "";
  for (let i = 1; i <= state.pageCount; i++){
    const page = await state.pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(it => it.str).filter(Boolean);
    full += `\n\n--- PAGE ${i} ---\n` + strings.join(" ");
  }

  setStatusExtract("Extraction terminée.");
  return full;
}

function buildBtListFromText(text){
  // Base simple (démo) : on repère des occurrences "BT" + chiffres, ou "BT-" etc.
  // Tu me diras ensuite ton vrai format exact, et on rend ça béton.
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const hits = [];

  const rx = /\bBT[\s\-:]*([0-9]{2,})\b/gi;

  for (const l of lines){
    let m;
    while ((m = rx.exec(l)) !== null){
      const id = `BT${m[1]}`;
      hits.push({ id, raw: l });
    }
  }

  // Dédup + limite
  const map = new Map();
  for (const h of hits){
    if (!map.has(h.id)){
      map.set(h.id, {
        id: h.id,
        title: h.id,
        meta: "Détection automatique (démo)",
        excerpt: h.raw.slice(0, 240),
      });
    }
  }

  // Si rien trouvé, on fabrique une “liste” fallback juste pour éviter un vide total
  const items = Array.from(map.values());
  if (items.length === 0){
    return [{
      id: "BT—",
      title: "Aucun identifiant BT détecté",
      meta: "On adaptera le parseur à ton format réel",
      excerpt: text.slice(0, 350) || "—",
    }];
  }

  return items.slice(0, 60);
}

function renderBtList(){
  el.btList.innerHTML = "";

  if (!state.btItems.length){
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "Aucun BT (fais “Extraire”).";
    el.btList.appendChild(d);
    return;
  }

  for (const item of state.btItems){
    const btn = document.createElement("div");
    btn.className = "bt" + (item.id === state.selectedBtId ? " bt--active" : "");
    btn.innerHTML = `
      <div class="bt__title">${escapeHtml(item.title)}</div>
      <div class="bt__meta">${escapeHtml(item.meta)}</div>
    `;
    btn.addEventListener("click", () => selectBt(item.id));
    el.btList.appendChild(btn);
  }
}

function selectBt(id){
  state.selectedBtId = id;
  const item = state.btItems.find(x => x.id === id);
  el.btPreview.textContent = item ? item.excerpt : "—";
  renderBtList();
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* -------------------- TIMELINE -------------------- */
function timeToMinutes(h, m){ return h*60 + m; }

function buildTimeSlots(startMin, endMin, stepMin){
  const slots = [];
  for (let t = startMin; t <= endMin; t += stepMin){
    const h = Math.floor(t/60);
    const m = t % 60;
    slots.push({ t, label: `${pad2(h)}:${pad2(m)}` });
  }
  return slots;
}

function renderTimeline(){
  const start = timeToMinutes(7,30);
  const end = timeToMinutes(17,0);
  const step = 30;

  const slots = buildTimeSlots(start, end, step);

  // Header
  el.timelineHeader.innerHTML = "";
  for (let i = 0; i < slots.length; i++){
    const chip = document.createElement("div");
    chip.className = "timechip";
    chip.textContent = slots[i].label;
    el.timelineHeader.appendChild(chip);
  }

  // Grid : 4 lignes “exemple”
  el.timelineGrid.innerHTML = "";
  const rows = ["BT/Inter 1", "BT/Inter 2", "BT/Inter 3", "BT/Inter 4"];

  for (let r = 0; r < rows.length; r++){
    const row = document.createElement("div");
    row.className = "gridrow";

    for (let i = 0; i < slots.length; i++){
      const c = document.createElement("div");
      c.className = "cell" + ((i % 2 === 1) ? " cell--half" : "");
      row.appendChild(c);
    }

    el.timelineGrid.appendChild(row);
  }
}

/* -------------------- EVENTS -------------------- */
function wireEvents(){
  el.pdfFile.addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;

    state.file = f;
    state.arrayBuffer = await f.arrayBuffer();
    state.pdfDoc = null;
    state.pageNumber = 1;
    state.pageCount = 0;
    state.extractedText = "";
    state.btItems = [];
    state.selectedBtId = null;

    setStatusPdf(`${f.name} • ${humanFileSize(f.size)}`);
    setStatusExtract("—");

    el.pdfMeta.textContent = "—";
    el.pageNum.textContent = "—";
    el.pageCount.textContent = "—";
    el.btPreview.textContent = "—";
    el.viewerOverlay.style.display = "flex";

    renderBtList();
    setButtonsEnabled();
  });

  el.btnView.addEventListener("click", async () => {
    if (!state.arrayBuffer) return;
    setStatusPdf("Chargement PDF…");
    await loadPdfFromArrayBuffer(state.arrayBuffer);
    setStatusPdf(`${state.file.name} • ${humanFileSize(state.file.size)}`);
  });

  el.btnExtract.addEventListener("click", async () => {
    if (!state.arrayBuffer) return;

    // S’assure que le PDF est chargé
    if (!state.pdfDoc) await loadPdfFromArrayBuffer(state.arrayBuffer);
    if (!state.pdfDoc) return;

    state.extractedText = await extractAllText();
    state.btItems = buildBtListFromText(state.extractedText);
    state.selectedBtId = state.btItems[0]?.id ?? null;

    renderBtList();
    if (state.selectedBtId) selectBt(state.selectedBtId);

    setStatusExtract(`BT détectés : ${state.btItems.length}`);
  });

  el.btnPrev.addEventListener("click", async () => {
    if (!state.pdfDoc || state.pageNumber <= 1) return;
    state.pageNumber--;
    await renderPage(state.pageNumber);
  });

  el.btnNext.addEventListener("click", async () => {
    if (!state.pdfDoc || state.pageNumber >= state.pageCount) return;
    state.pageNumber++;
    await renderPage(state.pageNumber);
  });
}

/* -------------------- INIT -------------------- */
function init(){
  el.appVersion.textContent = APP_VERSION;
  setNowInfo();
  setInterval(setNowInfo, 15_000);

  renderTimeline();
  renderBtList();
  setButtonsEnabled();

  wireEvents();
}

document.addEventListener("DOMContentLoaded", init);
