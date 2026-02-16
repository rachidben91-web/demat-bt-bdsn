/* js/export.js — DEMAT-BT v11.0.0 — 16/02/2026
   Génération des exports PDF (Unitaire ou Journée complète)
   Assemble les pages extraites (BT + Pièces jointes) en un fichier unique.
*/

// S'assure que jsPDF est disponible
function ensureJsPDF() {
  if (!window.jspdf) {
    throw new Error("La librairie jsPDF n'est pas chargée.");
  }
  return new window.jspdf.jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4"
  });
}

/**
 * Génère un PDF pour un seul BT (incluant toutes ses pièces jointes).
 */
async function generateSingleBTPDF(bt) {
  if (!bt || !state.pdf) return;

  try {
    const docName = `BT_${bt.id}.pdf`;
    setProgress(0, `Génération de ${docName}...`);

    const pdf = ensureJsPDF();
    await addBTToPDF(pdf, bt, true); // true = premier ajout (pas de addPage initial)

    pdf.save(docName);
    setProgress(100, `Export terminé : ${docName}`);
    setTimeout(() => setProgress(0, "Prêt"), 3000);
  } catch (e) {
    console.error("Erreur export BT:", e);
    setProgress(0, "Erreur lors de l'export du BT.");
  }
}

/**
 * Génère un PDF complet pour toute une liste de BT (Export Journée).
 */
async function generateFullDayPDF(btList) {
  if (!btList || btList.length === 0 || !state.pdf) return;

  try {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const docName = `Export_Journee_${dateStr}.pdf`;
    
    const pdf = ensureJsPDF();
    let isFirstPage = true;

    for (let i = 0; i < btList.length; i++) {
      const bt = btList[i];
      const pct = Math.round((i / btList.length) * 100);
      setProgress(pct, `Export BT ${bt.id} (${i + 1}/${btList.length})...`);

      // Ajout des pages du BT au document global
      await addBTToPDF(pdf, bt, isFirstPage);
      
      // Après le premier BT, isFirstPage sera toujours faux pour forcer addPage()
      if (bt.docs.length > 0) isFirstPage = false;
    }

    setProgress(100, "Finalisation du fichier PDF...");
    pdf.save(docName);
    
    setProgress(100, `Export terminé : ${btList.length} BT exportés.`);
    setTimeout(() => setProgress(0, "Prêt"), 3000);
  } catch (e) {
    console.error("Erreur export Journée:", e);
    setProgress(0, "Erreur lors de l'export global.");
  }
}

/**
 * Fonction interne : Ajoute toutes les pages d'un BT dans l'instance jsPDF en cours.
 */
async function addBTToPDF(pdfDoc, bt, isFirstDocOfPdf) {
  // On trie les documents par ordre de page pour respecter la chronologie du PDF source
  const sortedDocs = [...bt.docs].sort((a, b) => a.page - b.page);

  for (let i = 0; i < sortedDocs.length; i++) {
    const doc = sortedDocs[i];
    
    // Si ce n'est pas la toute première page du fichier PDF généré, on ajoute une page blanche
    if (!isFirstDocOfPdf || i > 0) {
      pdfDoc.addPage();
    }

    // 1. Rendu de la page PDF originale en image haute qualité via Canvas
    const imgData = await renderPageToDataURL(doc.page);

    // 2. Insertion de l'image dans le PDF (A4 : 210x297mm)
    // On laisse une petite marge pour l'en-tête ajouté
    const pageWidth = 210;
    const pageHeight = 297;
    pdfDoc.addImage(imgData, "JPEG", 0, 10, pageWidth, pageHeight - 10);

    // 3. Ajout d'un bandeau d'identification en haut de page
    // Utile pour savoir de quel BT il s'agit quand on imprime tout
    addPageHeader(pdfDoc, bt, doc);
  }
}

/**
 * Ajoute un petit en-tête texte sur la page PDF générée.
 */
function addPageHeader(pdfDoc, bt, doc) {
  const config = DOC_TYPES_CONFIG[doc.type] || DOC_TYPES_CONFIG.DOC;
  
  pdfDoc.setFontSize(9);
  pdfDoc.setTextColor(100); // Gris foncé
  
  // Texte gauche : N° BT
  pdfDoc.text(`${bt.id}`, 10, 6);
  
  // Texte droit : Type de document (ex: PLAN, FOR-113...)
  // On utilise la couleur configurée dans state.js pour le texte si possible, sinon noir
  pdfDoc.setTextColor(0); 
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text(`${config.label}`, 200, 6, { align: "right" });
}

/**
 * Convertit une page du PDF source (state.pdf) en image Base64 via un Canvas temporaire.
 */
async function renderPageToDataURL(pageNum) {
  const page = await state.pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2 }); // Scale 2 pour une bonne qualité d'impression

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  // Compression JPEG 0.75 pour un bon compromis poids/qualité
  return canvas.toDataURL("image/jpeg", 0.75);
}
