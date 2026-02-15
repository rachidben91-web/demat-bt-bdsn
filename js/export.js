/* js/export.js — DEMAT-BT v11.0.0 — 15/02/2026
   Export PDF : BT individuel + journée complète technicien
   Nécessite pdf-lib (chargé via CDN dans index.html)
*/

async function exportBTPDF() {
  const bt = state.modal.currentBT;
  if (!bt || !state.pdfFile) {
    alert("Aucun BT sélectionné ou PDF non disponible.");
    return;
  }

  try {
    const { PDFDocument } = PDFLib;
    const existingPdfBytes = await state.pdfFile.arrayBuffer();
    const srcDoc = await PDFDocument.load(existingPdfBytes);
    const newDoc = await PDFDocument.create();

    const pages = bt.docs.map(d => d.page - 1); // 0-indexed
    const copiedPages = await newDoc.copyPages(srcDoc, pages);
    copiedPages.forEach(p => newDoc.addPage(p));

    const pdfBytes = await newDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${bt.id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    console.log("[EXPORT] BT exporté ✅", bt.id);
  } catch (e) {
    console.error("[EXPORT] Erreur:", e);
    alert("Erreur lors de l'export. Voir la console.");
  }
}

async function exportDayPDF() {
  if (!state.filters.techId || !state.pdfFile) {
    alert("Sélectionne un technicien et charge un PDF d'abord.");
    return;
  }

  try {
    const filtered = filterBTs();
    if (filtered.length === 0) {
      alert("Aucun BT pour ce technicien.");
      return;
    }

    const { PDFDocument } = PDFLib;
    const existingPdfBytes = await state.pdfFile.arrayBuffer();
    const srcDoc = await PDFDocument.load(existingPdfBytes);
    const newDoc = await PDFDocument.create();

    // Collecter toutes les pages de tous les BT du technicien
    const allPages = [];
    for (const bt of filtered) {
      for (const doc of bt.docs || []) {
        if (!allPages.includes(doc.page - 1)) allPages.push(doc.page - 1);
      }
    }
    allPages.sort((a, b) => a - b);

    const copiedPages = await newDoc.copyPages(srcDoc, allPages);
    copiedPages.forEach(p => newDoc.addPage(p));

    const pdfBytes = await newDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const techs = window.TECHNICIANS || [];
    const tech = techs.find(x => techKey(x) === state.filters.techId);
    const techName = tech ? tech.name.replace(/\s+/g, "_") : "technicien";

    const a = document.createElement("a");
    a.href = url;
    a.download = `Journee_${techName}_${filtered.length}BT.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    console.log("[EXPORT] Journée exportée ✅", filtered.length, "BT");
  } catch (e) {
    console.error("[EXPORT] Erreur:", e);
    alert("Erreur lors de l'export. Voir la console.");
  }
}
