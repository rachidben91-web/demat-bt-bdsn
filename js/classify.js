/* js/classify.js — DEMAT-BT v11.0.0 — 15/02/2026
   Classification des interventions (catégories pour couleurs timeline)
*/

function classifyIntervention(bt) {
  const objet = safeUpper(bt.objet || "");

  // Clientèle (bleu)
  if (objet.includes("MISE EN SERVICE") || objet.includes("MISE OU REMISE EN SERVICE") ||
      objet.includes("REMISE EN SERVICE") || objet.includes("MISE HORS SERVICE") ||
      objet.includes("MHS") || objet.includes("MES") ||
      objet.includes("COMPTEUR") || objet.includes("POSTE CLIENT")) {
    return { category: "CLIENTELE", label: "MHS/MES", color: "#2563eb", icon: "🟦" };
  }

  // Maintenance (vert)
  if (objet.includes("MAINTENANCE") || objet.includes("CI-CM") ||
      objet.includes("CICM") || objet.includes("ROBINET") || objet.includes("PREVENTIF")) {
    return { category: "MAINTENANCE", label: "MAINT CI-CM", color: "#10b981", icon: "🟩" };
  }

  // Surveillance (orange)
  if (objet.includes("SURVEILLANCE") || objet.includes("ADF") ||
      objet.includes("SUIVI") || objet.includes("ALERTE") || objet.includes("FUITE")) {
    return { category: "SURVEILLANCE", label: "SURVEILLANCE", color: "#f59e0b", icon: "🟧" };
  }

  // Localisation (rouge)
  if (objet.includes("LOCALISATION") || objet.includes("LOCA") ||
      objet.includes("ODEUR")) {
    return { category: "LOCA", label: "LOCA", color: "#ef4444", icon: "🟥" };
  }

  // Travaux (violet)
  if (objet.includes("TRAVAUX") || objet.includes("CHANTIER") ||
      objet.includes("BRANCHEMENT") || objet.includes("SOUDURE")) {
    return { category: "TRAVAUX", label: "TRAVAUX", color: "#8b5cf6", icon: "🟪" };
  }

  // RSF/SAP (jaune)
  if (objet.includes("RSF") || objet.includes("SAP") ||
      objet.includes("RECHERCHE DE FUITE") || objet.includes("A PIED")) {
    return { category: "RSF_SAP", label: "RSF/SAP", color: "#eab308", icon: "🟨" };
  }

  // Administratif (gris)
  if (objet.includes("ADMINISTRATIF") || objet.includes("REUNION") ||
      objet.includes("FORMATION") || objet.includes("EAP") ||
      objet.includes("MAGASIN") || objet.includes("ASTREINTE")) {
    return { category: "ADMIN", label: "ADMIN", color: "#a855f7", icon: "🟣" };
  }

  // Activité clientèle générique
  if (objet.includes("ACTIVITE CLIENTELE") || objet.includes("ACTIVITE CLIENT")) {
    return { category: "CLIENTELE", label: "CLIENT", color: "#2563eb", icon: "🟦" };
  }

  // Défaut
  return { category: "AUTRE", label: "AUTRE", color: "#64748b", icon: "⬜" };
}
