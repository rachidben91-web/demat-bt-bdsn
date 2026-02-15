/* js/state.js — DEMAT-BT v11.0.0 — 15/02/2026
   État global de l'application + constantes de configuration
*/

const APP_VERSION = "V11.0.0";

const DOC_TYPES_CONFIG = {
  "BT":     { label: "BT",     icon: "📋", color: "#1e293b", desc: "Bon de Travail" },
  "AT":     { label: "AT",     icon: "✅", color: "#059669", desc: "Autorisation de Travail" },
  "PROC":   { label: "PROC",   icon: "📝", color: "#2563eb", desc: "Procédure d'exécution" },
  "PLAN":   { label: "PLAN",   icon: "🗺️", color: "#7c3aed", desc: "Plan de situation" },
  "PHOTO":  { label: "PHOTO",  icon: "📷", color: "#dc2626", desc: "Photos/Images" },
  "STREET": { label: "STREET", icon: "🌍", color: "#ea580c", desc: "Street View" },
  "DOC":    { label: "DOC",    icon: "📄", color: "#64748b", desc: "Document générique" }
};

const DOC_TYPES = Object.keys(DOC_TYPES_CONFIG);

// État global mutable
const state = {
  pdf: null,
  pdfFile: null,
  pdfName: "",
  totalPages: 0,
  bts: [],
  view: "referent",   // referent | brief
  layout: "grid",     // grid | timeline
  filters: {
    q: "",
    types: new Set(),
    techId: ""
  },
  countsByTechId: new Map(),
  modal: {
    open: false,
    currentBT: null,
    currentPage: 1
  }
};
