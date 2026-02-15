/* js/ui/modal.js — DEMAT-BT v11.0.0 — 15/02/2026
   Modal viewer : affichage page PDF, navigation, export
*/

function openModal(bt, pageNum) {
  state.modal.open = true;
  state.modal.currentBT = bt;
  state.modal.currentPage = pageNum;

  const modal = $("modal");
  if (modal) modal.setAttribute("aria-hidden", "false");

  const title = $("modalTitle");
  if (title) title.textContent = `${bt.id} — Page ${pageNum}`;

  const subtitle = $("modalSubtitle");
  if (subtitle) subtitle.textContent = bt.objet || "";

  renderPage(pageNum);
  updateModalNavigation();
}

function closeModal() {
  state.modal.open = false;
  state.modal.currentBT = null;

  const modal = $("modal");
  if (modal) modal.setAttribute("aria-hidden", "true");
}

function updateModalNavigation() {
  const bt = state.modal.currentBT;
  if (!bt) return;

  const currentPage = state.modal.currentPage;
  const btPages = bt.docs.map(d => d.page);
  const minPage = Math.min(...btPages);
  const maxPage = Math.max(...btPages);

  const btnPrev = $("btnPrevPage");
  const btnNext = $("btnNextPage");
  if (btnPrev) btnPrev.disabled = currentPage <= minPage;
  if (btnNext) btnNext.disabled = currentPage >= maxPage;

  const info = $("modalInfo");
  if (info) {
    const doc = bt.docs.find(d => d.page === currentPage);
    const config = doc ? DOC_TYPES_CONFIG[doc.type] : null;
    info.textContent = config
      ? `${config.icon} ${config.desc} — Page ${currentPage} sur ${btPages.length} pages`
      : `Page ${currentPage}`;
  }
}

function prevPage() {
  const bt = state.modal.currentBT;
  if (!bt) return;
  const pages = bt.docs.map(d => d.page).sort((a, b) => a - b);
  const idx = pages.indexOf(state.modal.currentPage);
  if (idx > 0) {
    state.modal.currentPage = pages[idx - 1];
    renderPage(state.modal.currentPage);
    updateModalNavigation();
    const title = $("modalTitle");
    if (title) title.textContent = `${bt.id} — Page ${state.modal.currentPage}`;
  }
}

function nextPage() {
  const bt = state.modal.currentBT;
  if (!bt) return;
  const pages = bt.docs.map(d => d.page).sort((a, b) => a - b);
  const idx = pages.indexOf(state.modal.currentPage);
  if (idx < pages.length - 1) {
    state.modal.currentPage = pages[idx + 1];
    renderPage(state.modal.currentPage);
    updateModalNavigation();
    const title = $("modalTitle");
    if (title) title.textContent = `${bt.id} — Page ${state.modal.currentPage}`;
  }
}

async function renderPage(pageNum) {
  if (!state.pdf) return;
  try {
    const page = await state.pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = $("canvas");
    if (!canvas) return;

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch (e) {
    console.error("[MODAL] Erreur rendu page", pageNum, e);
  }
}
