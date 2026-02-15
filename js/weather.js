/* js/weather.js — DEMAT-BT v11.0.0 — 15/02/2026
   Module météo autonome — communes AI Boucle de Seine Nord
*/

const WEATHER_COMMUNES = [
  { name: "Villeneuve-la-Garenne", lat: 48.9369, lon: 2.3260 },
  { name: "Gennevilliers",         lat: 48.9326, lon: 2.2927 },
  { name: "Asnières-sur-Seine",    lat: 48.9142, lon: 2.2872 },
  { name: "Colombes",              lat: 48.9233, lon: 2.2527 },
  { name: "Bois-Colombes",         lat: 48.9169, lon: 2.2694 },
  { name: "Saint-Denis",           lat: 48.9362, lon: 2.3574 }
];

function getWeatherIcon(code) {
  const icons = {
    113: "☀️", 116: "⛅", 119: "☁️", 122: "☁️", 143: "🌫️",
    176: "🌦️", 179: "🌨️", 182: "🌧️", 185: "🌧️", 200: "⛈️",
    227: "🌨️", 230: "❄️", 248: "🌫️", 260: "🌫️", 263: "🌦️",
    266: "🌧️", 281: "🌧️", 284: "🌧️", 293: "🌦️", 296: "🌧️",
    299: "🌧️", 302: "🌧️", 305: "🌧️", 308: "🌧️", 311: "🌧️",
    314: "🌧️", 317: "🌨️", 320: "🌨️", 323: "🌨️", 326: "🌨️",
    329: "🌨️", 332: "❄️", 335: "❄️", 338: "❄️", 350: "🌧️",
    353: "🌦️", 356: "🌧️", 359: "🌧️", 362: "🌨️", 365: "🌨️",
    368: "🌨️", 371: "❄️", 374: "🌧️", 377: "🌧️", 386: "⛈️",
    389: "⛈️", 392: "⛈️", 395: "⛈️"
  };
  return icons[code] || "🌡️";
}

async function updateWeather() {
  const el = $("topWeather");
  if (!el) return;

  try {
    const weatherPromises = WEATHER_COMMUNES.map(async (commune) => {
      try {
        const url = `https://wttr.in/${commune.lat},${commune.lon}?format=j1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const current = data.current_condition[0];
        return {
          name: commune.name,
          temp: current.temp_C,
          desc: current.lang_fr[0].value,
          icon: getWeatherIcon(current.weatherCode)
        };
      } catch (err) {
        console.error(`Erreur météo pour ${commune.name}:`, err);
        return { name: commune.name, temp: "—", desc: "—", icon: "🌡️" };
      }
    });

    const results = await Promise.all(weatherPromises);

    el.innerHTML = results
      .map(r => `<span style="white-space:nowrap;">${r.icon} ${r.name.split('-')[0]}: ${r.temp}°C</span>`)
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
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const date = now.toLocaleDateString('fr-FR', opts);
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  el.textContent = `${date} — ${time}`;
}
