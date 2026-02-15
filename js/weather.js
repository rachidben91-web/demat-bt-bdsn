/* js/weather.js — DEMAT-BT v11.0.2 — 15/02/2026
   Module météo autonome — Open-Meteo (sans clé API)
   Affiche : icône + commune + température + probabilité de pluie (heure courante)
*/

const WEATHER_COMMUNES = [
  { name: "Villeneuve_la_Garenne", lat: 48.9369, lon: 2.3260 },
  { name: "Groslay",              lat: 48.9867, lon: 2.3444 },
  { name: "Bois_Colombes",        lat: 48.9169, lon: 2.2694 },
  { name: "Saint_Denis",          lat: 48.9362, lon: 2.3574 }
];

// Open-Meteo weather codes: https://open-meteo.com/en/docs
function getOpenMeteoIcon(code) {
  const c = Number(code);

  if (c === 0) return "☀️";
  if (c === 1) return "🌤️";
  if (c === 2) return "⛅";
  if (c === 3) return "☁️";

  if (c === 45 || c === 48) return "🌫️";

  if (c === 51 || c === 53 || c === 55) return "🌦️";
  if (c === 56 || c === 57) return "🌧️";

  if (c === 61 || c === 63 || c === 65) return "🌧️";
  if (c === 66 || c === 67) return "🌧️";

  if (c === 71 || c === 73 || c === 75) return "🌨️";
  if (c === 77) return "❄️";

  if (c === 80 || c === 81 || c === 82) return "🌦️";

  if (c === 85 || c === 86) return "🌨️";

  if (c === 95) return "⛈️";
  if (c === 96 || c === 99) return "⛈️";

  return "🌡️";
}

// Trouve l’index de l’heure la plus proche dans un tableau Open-Meteo (ISO strings)
function nearestHourIndex(times) {
  if (!Array.isArray(times) || times.length === 0) return -1;

  const now = Date.now();
  let bestIdx = 0;
  let bestDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]);
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function prettyName(name) {
  // "Villeneuve_la_Garenne" -> "Villeneuve la Garenne"
  // "Bois_Colombes" -> "Bois Colombes"
  return String(name || "").replace(/_/g, " ");
}

async function updateWeather() {
  const el = $("topWeather");
  if (!el) return;

  try {
    const weatherPromises = WEATHER_COMMUNES.map(async (commune) => {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${encodeURIComponent(commune.lat)}` +
          `&longitude=${encodeURIComponent(commune.lon)}` +
          `&current=temperature_2m,weathercode` +
          `&hourly=precipitation_probability` +
          `&forecast_days=1` +
          `&timezone=Europe%2FParis`;

        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const current = data?.current;

        const temp = current?.temperature_2m;
        const code = current?.weathercode;

        // Proba pluie (hourly)
        const times = data?.hourly?.time || [];
        const probs = data?.hourly?.precipitation_probability || [];
        const idx = nearestHourIndex(times);
        const rainPct =
          idx >= 0 && Number.isFinite(Number(probs[idx]))
            ? Math.round(Number(probs[idx]))
            : null;

        return {
          name: commune.name,
          temp: Number.isFinite(temp) ? Math.round(temp) : "—",
          icon: getOpenMeteoIcon(code),
          rainPct
        };
      } catch (err) {
        console.error(`Erreur météo pour ${commune.name}:`, err);
        return { name: commune.name, temp: "—", icon: "🌡️", rainPct: null };
      }
    });

    const results = await Promise.all(weatherPromises);

    el.innerHTML = results
      .map(r => {
        const city = prettyName(r.name).split("-")[0]; // garde ton split si jamais
        const rain = (r.rainPct == null) ? "" : ` <span style="opacity:.85;">(Pluie ${r.rainPct}%)</span>`;
        return `<span style="white-space:nowrap;">${r.icon} ${city}: ${r.temp}°C${rain}</span>`;
      })
      .join('<span style="margin:0 8px; opacity:0.3;">|</span>');

  } catch (err) {
    console.error("Erreur météo globale:", err);
    el.innerHTML = '<span style="opacity:0.6;">Météo indisponible</span>';
  }
}

function updateDateTime() {
  const el = $("topDatetime");
  if (!el) return;

  const now = new Date();
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  const date = now.toLocaleDateString("fr-FR", opts);
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  el.textContent = `${date} — ${time}`;
}
