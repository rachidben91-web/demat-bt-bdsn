/* js/classify.js — DEMAT-BT v11.1.0 — 16/02/2026
   Classification des interventions (catégories pour couleurs timeline)
   FIX v11.1: Utilisation de "objet" + "observations" pour fiabiliser la classification.
*/

function classifyIntervention(bt) {
  const objet = safeUpper(bt.objet || "");
  const observations = safeUpper(bt.observations || "");
  const textToAnalyze = objet + " " + observations;

  // Clientèle (bleu)
  if (textToAnalyze.includes("MISE EN SERVICE") || textToAnalyze.includes("MISE OU REMISE EN SERVICE") ||
      textToAnalyze.includes("REMISE EN SERVICE") || textToAnalyze.includes("MISE HORS SERVICE") ||
      textToAnalyze.includes("MHS") || textToAnalyze.includes("MES") ||
      textToAnalyze.includes("COMPTEUR") || textToAnalyze.includes("POSTE CLIENT")) {
    return { category: "CLIENTELE", label: "MHS/MES", color: "#2563eb", icon: "🟦" };
  }

  // Maintenance (vert)
  if (textToAnalyze.includes("MAINTENANCE") || textToAnalyze.includes("CI-CM") ||
      textToAnalyze.includes("CICM") || textToAnalyze.includes("ROBINET") || textToAnalyze.includes("PREVENTIF")) {
    return { category: "MAINTENANCE", label: "MAINT CI-CM", color: "#10b981", icon: "🟩" };
  }

  // Surveillance (orange)
  if (textToAnalyze.includes("SURVEILLANCE") || textToAnalyze.includes("ADF") ||
      textToAnalyze.includes("SUIVI") || textToAnalyze.includes("ALERTE") || textToAnalyze.includes("FUITE")) {
    return { category: "SURVEILLANCE", label: "SURVEILLANCE", color: "#f59e0b", icon: "🟧" };
  }

  // Localisation (rouge)
  if (textToAnalyze.includes("LOCALISATION") || textToAnalyze.includes("LOCA") ||
      textToAnalyze.includes("ODEUR")) {
    return { category: "LOCA", label: "LOCA", color: "#ef4444", icon: "🟥" };
  }

  // Travaux (violet)
  if (textToAnalyze.includes("TRAVAUX") || textToAnalyze.includes("CHANTIER") ||
      textToAnalyze.includes("BRANCHEMENT") || textToAnalyze.includes("SOUDURE")) {
    return { category: "TRAVAUX", label: "TRAVAUX", color: "#8b5cf6", icon: "🟪" };
  }

  // RSF/SAP (jaune)
  if (textToAnalyze.includes("RSF") || textToAnalyze.includes("SAP") ||
      textToAnalyze.includes("RECHERCHE DE FUITE") || textToAnalyze.includes("A PIED")) {
    return { category: "RSF_SAP", label: "RSF/SAP", color: "#eab308", icon: "🟨" };
  }

  // Administratif (gris)
  if (textToAnalyze.includes("ADMINISTRATIF") || textToAnalyze.includes("REUNION") ||
      textToAnalyze.includes("FORMATION") || textToAnalyze.includes("EAP") ||
      textToAnalyze.includes("MAGASIN") || textToAnalyze.includes("ASTREINTE")) {
    return { category: "ADMIN", label: "ADMIN", color: "#a855f7", icon: "🟣" };
  }

  // Activité clientèle générique
  if (textToAnalyze.includes("ACTIVITE CLIENTELE") || textToAnalyze.includes("ACTIVITE CLIENT")) {
    return { category: "CLIENTELE", label: "CLIENT", color: "#2563eb", icon: "🟦" };
  }

  // Défaut
  return { category: "AUTRE", label: "AUTRE", color: "#64748b", icon: "⬜" };
}
