/* js/export.js — DEMAT-BT v11.0.0 — 16/02/2026
   Génération des exports PDF (Unitaire ou Journée complète)
   Assemble les pages extraites (BT + Pièces jointes) en un fichier unique.
*/

// Chargeur automatique de la librairie jsPDF si elle est manquante
async function ensureJsPDF() {
  if (window.jspdf) return window.jspdf;
  
  // Injection dynamique du script CDN
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Impossible de charger la librairie jsPDF."));
    document.head.appendChild(script);
  });
  
  return window.jspdf;
}

/**
 * EXPORT UNITAIRE (Relié au bouton "Exporter" de la Modal et du BT)
 * Nommé exportBTPDF pour correspondre à l'appel dans main.js et modal.js
 */
async function exportBTPDF(btArg) {
  // Si appelé depuis un bouton click, btArg est un Event, donc on prend le BT courant de la modal
  // Sinon, c'est l'objet BT passé directement
  const bt = (btArg && btArg.id) ? btArg : state.modal.currentBT;
  
  if (!bt) {
    alert("Aucun BT sélectionné pour l'export.");
    return;
  }
  if (!state.pdf) return;

  try {
    const docName = `BT_${bt.id}.pdf`;
    setProgress(0, `Génération ${docName}...`);

    const jspdfLib = await ensureJsPDF();
    const pdf = new jspdfLib.jsPDF({ orientation: "p", unit: "mm", format: "a4" });

    await addBTToPDF(pdf, bt, true); // true = c'est la première page du fichier

    pdf.save(docName);
    setProgress(100, `Export OK : ${docName}`);
    setTimeout(() => setProgress(0, "Prêt"), 3000);
  } catch (e) {
    console.error("Erreur export BT:", e);
    setProgress(0, "Erreur export.");
    alert("Erreur lors de la génération du PDF : " + e.message);
  }
}

/**
 * EXPORT JOURNÉE (Relié au bouton "Exporter PDF du jour" dans le header)
 * Nommé exportDayPDF pour correspondre à l'appel dans main.js
 */
async function exportDayPDF() {
  // On récupère la liste filtrée actuelle via la fonction globale (si dispo) ou le state
  const btList = (typeof filterBTs === 'function') ? filterBTs() : state.bts;

  if (!btList || btList.length === 0) {
    alert("Aucun BT à exporter dans la vue actuelle.");
    return;
  }
  if (!state.pdf) return;

  if (!confirm(`Confirmez-vous l'export de ${btList.length} BT et de leurs pièces jointes ?`)) return;

  try {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const docName = `Export_Journee_${dateStr}.pdf`;
    
    const jspdfLib = await ensureJsPDF();
    const pdf = new jspdfLib.jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    
    let isFirstPageOfFile = true;

    for (let i = 0; i < btList.length; i++) {
      const bt = btList[i];
      const pct = Math.round((i / btList.length) * 100);
      setProgress(pct, `Fusion BT ${bt.id} (${i + 1}/${btList.length})...`);

      // Ajoute toutes les pages de ce BT
      // Si le BT a des documents, il va générer des pages.
      // On passe isFirstPageOfFile pour savoir si on doit faire addPage() avant ou pas.
      if (bt.docs && bt.docs.length > 0) {
        await addBTToPDF(pdf, bt, isFirstPageOfFile);
        isFirstPageOfFile = false; // Dès qu'une page est écrite, ce n'est plus la première
      }
    }

    setProgress(100, "Finalisation du fichier...");
    pdf.save(docName);
    
    setProgress(100, `Terminé : ${btList.length} BT exportés.`);
    setTimeout(() => setProgress(0, "Prêt"), 3000);
  } catch (e) {
    console.error("Erreur export Journée:", e);
    setProgress(0, "Erreur export global.");
    alert("Erreur lors de l'export groupé : " + e.message);
  }
}

/**
 * Fonction interne : Ajoute toutes les pages d'un BT dans l'instance jsPDF en cours.
 */
async function addBTToPDF(pdfDoc, bt, isFirstDocOfPdf) {
  // Tri des documents par ordre de page
  const sortedDocs = [...bt.docs].sort((a, b) => a.page - b.page);

  for (let i = 0; i < sortedDocs.length; i++) {
    const doc = sortedDocs[i];
    
    // Nouvelle page PDF (sauf si c'est la toute première du fichier entier)
    if (!isFirstDocOfPdf || i > 0) {
      pdfDoc.addPage();
    }

    // 1. Capture de la page PDF originale en image haute qualité
    const imgData = await renderPageToDataURL(doc.page);

    // 2. Insertion image (A4 standard)
    const pageWidth = 210;
    const pageHeight = 297;
    pdfDoc.addImage(imgData, "JPEG", 0, 0, pageWidth, pageHeight);

    // 3. Ajout du tatouage discret (Numéro BT + Type document)
    addPageHeader(pdfDoc, bt, doc);
  }
}

/**
 * Ajoute un petit en-tête texte sur la page PDF générée.
 */
function addPageHeader(pdfDoc, bt, doc) {
  const config = (typeof DOC_TYPES_CONFIG !== 'undefined') 
    ? (DOC_TYPES_CONFIG[doc.type] || DOC_TYPES_CONFIG.DOC)
    : { label: doc.type, color: "#000" };
  
  pdfDoc.setFontSize(9);
  pdfDoc.setTextColor(80); // Gris
  
  // En haut à gauche : ID du BT
  pdfDoc.text(`${bt.id}`, 10, 6);
  
  // En haut à droite : Type de pièce (PLAN, PHOTO, etc.)
  pdfDoc.setTextColor(0); 
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text(`${config.label}`, 200, 6, { align: "right" });
}

/**
 * Convertit une page du PDF source en image pour l'intégration
 */
async function renderPageToDataURL(pageNum) {
  const page = await state.pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 }); // Qualité standard (1.5x)

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL("image/jpeg", 0.8);
}
