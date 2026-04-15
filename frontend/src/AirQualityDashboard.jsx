// ============================================================
// AirWatch — Air Quality Monitoring Dashboard
// Views: Dashboard (rich), Trends, Cities, World Map (D3),
//        Forecast (24h prediction), Learn
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, AreaChart, Area,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  Wind, MapPin, Activity, Search, ChevronRight,
  AlertTriangle, RefreshCw, BarChart2, Globe, BookOpen,
  Clock, ChevronLeft, Info, Shield, Zap, X, TrendingUp,
  Brain,
} from "lucide-react";

const API_BASE = "http://localhost:8000";

const AQI_CONFIG = [
  { min: 0,   max: 50,  category: "Good",                          color: "#22c55e", bg: "#052e16", badge: "#166534", text: "#bbf7d0" },
  { min: 51,  max: 100, category: "Moderate",                      color: "#eab308", bg: "#1c1300", badge: "#854d0e", text: "#fef08a" },
  { min: 101, max: 150, category: "Unhealthy for Sensitive Groups", color: "#f97316", bg: "#1c0a00", badge: "#9a3412", text: "#fed7aa" },
  { min: 151, max: 200, category: "Unhealthy",                     color: "#ef4444", bg: "#1c0505", badge: "#991b1b", text: "#fecaca" },
  { min: 201, max: 300, category: "Very Unhealthy",                color: "#a855f7", bg: "#1a0533", badge: "#6b21a8", text: "#e9d5ff" },
  { min: 301, max: 500, category: "Hazardous",                     color: "#be185d", bg: "#1c0010", badge: "#9d174d", text: "#fbcfe8" },
];

function getAqiConfig(aqi) {
  if (!aqi || aqi <= 0) return { color: "#64748b", bg: "#1e293b", badge: "#334155", text: "#94a3b8", category: "No Data" };
  for (const cfg of AQI_CONFIG) if (aqi >= cfg.min && aqi <= cfg.max) return cfg;
  return AQI_CONFIG[AQI_CONFIG.length - 1];
}

const POLLUTANTS = [
  { id: "pm25", name: "PM 2.5", full: "Fine Particulate Matter", icon: "💨", unit: "µg/m³", description: "Tiny particles less than 2.5 microns. Penetrate deep into lungs and enter the bloodstream.", levels: [{ label: "Good", range: "0–12", color: "#22c55e" }, { label: "Moderate", range: "12–35.4", color: "#eab308" }, { label: "Unhealthy", range: "35.5–55.4", color: "#f97316" }, { label: "Hazardous", range: "250.5+", color: "#be185d" }], health: "Long-term exposure linked to heart disease, lung cancer, and respiratory illness." },
  { id: "pm10", name: "PM 10", full: "Coarse Particulate Matter", icon: "🌫️", unit: "µg/m³", description: "Larger particles from dust, pollen, mold. Irritate nose, throat and lungs.", levels: [{ label: "Good", range: "0–54", color: "#22c55e" }, { label: "Moderate", range: "55–154", color: "#eab308" }, { label: "Unhealthy", range: "155–254", color: "#f97316" }, { label: "Hazardous", range: "425+", color: "#be185d" }], health: "Can trigger asthma attacks and aggravate existing respiratory conditions." },
  { id: "no2", name: "NO₂", full: "Nitrogen Dioxide", icon: "🏭", unit: "ppb", description: "Produced by burning fuel — vehicles, power plants. Contributes to smog and acid rain.", levels: [{ label: "Good", range: "0–53", color: "#22c55e" }, { label: "Moderate", range: "54–100", color: "#eab308" }, { label: "Unhealthy", range: "101–360", color: "#f97316" }, { label: "Hazardous", range: "649+", color: "#be185d" }], health: "Inflames airways, increases susceptibility to respiratory infections." },
  { id: "o3", name: "O₃", full: "Ground-level Ozone", icon: "☀️", unit: "ppb", description: "Formed when pollutants react with sunlight. Worst on hot sunny days.", levels: [{ label: "Good", range: "0–54", color: "#22c55e" }, { label: "Moderate", range: "55–70", color: "#eab308" }, { label: "Unhealthy", range: "71–85", color: "#f97316" }, { label: "Hazardous", range: "105+", color: "#be185d" }], health: "Chest pain, coughing, throat irritation, worsens bronchitis and emphysema." },
  { id: "so2", name: "SO₂", full: "Sulfur Dioxide", icon: "⚗️", unit: "ppb", description: "Released by burning coal and oil. Key cause of acid rain.", levels: [{ label: "Good", range: "0–35", color: "#22c55e" }, { label: "Moderate", range: "36–75", color: "#eab308" }, { label: "Unhealthy", range: "76–185", color: "#f97316" }, { label: "Hazardous", range: "304+", color: "#be185d" }], health: "Triggers asthma, irritates respiratory tract, damages lung function." },
  { id: "co", name: "CO", full: "Carbon Monoxide", icon: "🚗", unit: "ppm", description: "Odourless gas from incomplete combustion. Dangerous at high concentrations.", levels: [{ label: "Good", range: "0–4.4", color: "#22c55e" }, { label: "Moderate", range: "4.5–9.4", color: "#eab308" }, { label: "Unhealthy", range: "9.5–12.4", color: "#f97316" }, { label: "Hazardous", range: "30.5+", color: "#be185d" }], health: "Reduces oxygen delivery to organs. Fatal at very high levels." },
];

const MAP_CITIES = [
  { name: "Delhi", lat: 28.6, lng: 77.2 }, { name: "Mumbai", lat: 19.1, lng: 72.9 },
  { name: "Beijing", lat: 39.9, lng: 116.4 }, { name: "Shanghai", lat: 31.2, lng: 121.5 },
  { name: "London", lat: 51.5, lng: -0.1 }, { name: "Paris", lat: 48.9, lng: 2.3 },
  { name: "New York", lat: 40.7, lng: -74.0 }, { name: "Los Angeles", lat: 34.1, lng: -118.2 },
  { name: "Tokyo", lat: 35.7, lng: 139.7 }, { name: "Seoul", lat: 37.6, lng: 127.0 },
  { name: "Bangkok", lat: 13.8, lng: 100.5 }, { name: "Jakarta", lat: -6.2, lng: 106.8 },
  { name: "Cairo", lat: 30.0, lng: 31.2 }, { name: "Lagos", lat: 6.5, lng: 3.4 },
  { name: "São Paulo", lat: -23.5, lng: -46.6 }, { name: "Mexico City", lat: 19.4, lng: -99.1 },
  { name: "Karachi", lat: 24.9, lng: 67.1 }, { name: "Dhaka", lat: 23.8, lng: 90.4 },
  { name: "Chicago", lat: 41.9, lng: -87.6 }, { name: "Berlin", lat: 52.5, lng: 13.4 },
  { name: "Sydney", lat: -33.9, lng: 151.2 }, { name: "Toronto", lat: 43.7, lng: -79.4 },
  { name: "Dubai", lat: 25.2, lng: 55.3 }, { name: "Singapore", lat: 1.35, lng: 103.8 },
  { name: "Lahore", lat: 31.5, lng: 74.3 },
];

const PARAM_LABELS = { pm25: "PM 2.5", pm10: "PM 10", no2: "NO₂", o3: "O₃", so2: "SO₂", co: "CO" };
const PARAM_COLORS = { pm25: "#f97316", pm10: "#eab308", no2: "#a855f7", o3: "#22c55e", so2: "#ef4444", co: "#60a5fa" };

function Skeleton({ h = 48 }) {
  return <div style={{ height: h, borderRadius: 12, background: "linear-gradient(90deg,#1e293b 25%,#263548 50%,#1e293b 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />;
}

function ErrorCard({ message, onRetry }) {
  return (
    <div style={{ background: "#1c0505", border: "1px solid #7f1d1d", borderRadius: 16, padding: 24, textAlign: "center" }}>
      <div style={{ color: "#ef4444", display: "flex", justifyContent: "center", marginBottom: 10 }}><AlertTriangle size={28} /></div>
      <p style={{ color: "#fca5a5", fontWeight: 600, marginBottom: 6 }}>Unable to load data</p>
      <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 14 }}>{message}</p>
      {onRetry && <button onClick={onRetry} style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 auto", background: "#7f1d1d", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13 }}><RefreshCw size={14} /> Try again</button>}
    </div>
  );
}

function AqiBadge({ aqi }) {
  const cfg = getAqiConfig(aqi);
  return <span style={{ background: cfg.badge, color: cfg.text, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>{cfg.category}</span>;
}

function AqiGauge({ aqi, size = 200 }) {
  const cfg = getAqiConfig(aqi);
  const pct = aqi > 0 ? Math.min(aqi / 500, 1) : 0;
  const r = size * 0.38, cx = size / 2, cy = size / 2;
  const totalAngle = 260, startAngle = 230;
  function polar(angle, radius) {
    const rad = (angle - 90) * (Math.PI / 180);
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }
  const s = polar(startAngle, r), e = polar(startAngle + totalAngle, r);
  const trackPath = `M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`;
  const filledAngle = startAngle + totalAngle * pct;
  const f = polar(filledAngle, r);
  const lg2 = totalAngle * pct > 180 ? 1 : 0;
  const fillPath = pct > 0.001 ? `M ${s.x} ${s.y} A ${r} ${r} 0 ${lg2} 1 ${f.x} ${f.y}` : "";
  const sw = size * 0.065;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size * 0.82} viewBox={`0 0 ${size} ${size}`}>
        <path d={trackPath} fill="none" stroke="#1e293b" strokeWidth={sw} strokeLinecap="round" />
        {fillPath && <path d={fillPath} fill="none" stroke={cfg.color} strokeWidth={sw} strokeLinecap="round" opacity={0.9} style={{ transition: "all 0.9s cubic-bezier(.4,0,.2,1)" }} />}
        <text x={cx} y={cy + size * 0.04} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: size * 0.2, fontWeight: 700, fill: cfg.color, fontFamily: "monospace" }}>{aqi > 0 ? aqi : "—"}</text>
        <text x={cx} y={cy + size * 0.17} textAnchor="middle" style={{ fontSize: size * 0.06, fill: "#475569", letterSpacing: "0.1em" }}>AQI INDEX</text>
      </svg>
      <AqiBadge aqi={aqi} />
    </div>
  );
}

function HealthAdvisory({ aqi }) {
  const cfg = getAqiConfig(aqi);
  const advisories = {
    "Good": { groups: ["Everyone"], advice: "Air quality is satisfactory. Enjoy outdoor activities freely.", outdoor: "Safe", mask: "Not needed", exercise: "Recommended" },
    "Moderate": { groups: ["Sensitive people"], advice: "Acceptable quality. Very sensitive individuals should consider limiting prolonged outdoor exertion.", outdoor: "Generally safe", mask: "Optional", exercise: "Fine for most" },
    "Unhealthy for Sensitive Groups": { groups: ["Elderly", "Children", "Asthma"], advice: "Sensitive groups should limit prolonged outdoor exertion.", outdoor: "Limit time", mask: "Recommended", exercise: "Reduce intensity" },
    "Unhealthy": { groups: ["Everyone"], advice: "Everyone may experience health effects. Sensitive groups should avoid outdoor exertion.", outdoor: "Avoid prolonged", mask: "Wear outdoors", exercise: "Move indoors" },
    "Very Unhealthy": { groups: ["Everyone"], advice: "Health alert. Everyone may experience serious effects.", outdoor: "Avoid", mask: "N95 recommended", exercise: "Stay indoors" },
    "Hazardous": { groups: ["Everyone"], advice: "Emergency conditions. Stay indoors with windows closed.", outdoor: "Stay inside", mask: "N95 essential", exercise: "No outdoor" },
    "No Data": { groups: [], advice: "No air quality data available.", outdoor: "Unknown", mask: "Unknown", exercise: "Unknown" },
  };
  const adv = advisories[cfg.category] || advisories["No Data"];
  return (
    <div style={{ background: "#1e293b", borderRadius: 20, padding: 24, border: "1px solid #334155" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Shield size={16} style={{ color: cfg.color }} />
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Health Advisory</p>
      </div>
      <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>{adv.advice}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[{ label: "Outdoor", value: adv.outdoor }, { label: "Mask", value: adv.mask }, { label: "Exercise", value: adv.exercise }].map((item) => (
          <div key={item.label} style={{ background: "#0f172a", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e293b" }}>
            <p style={{ margin: 0, fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{item.label}</p>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#cbd5e1" }}>{item.value}</p>
          </div>
        ))}
      </div>
      {adv.groups.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#475569" }}>At risk:</span>
          {adv.groups.map(g => <span key={g} style={{ fontSize: 11, background: cfg.badge, color: cfg.text, borderRadius: 12, padding: "2px 8px" }}>{g}</span>)}
        </div>
      )}
    </div>
  );
}

function PollutantBreakdown({ measurements }) {
  const maxVal = Math.max(...measurements.map(m => m.value), 1);
  return (
    <div style={{ background: "#1e293b", borderRadius: 20, padding: 24, border: "1px solid #334155" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Pollutant Breakdown</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {measurements.map((m, i) => {
          const color = PARAM_COLORS[m.parameter] || "#94a3b8";
          const label = PARAM_LABELS[m.parameter] || m.parameter.toUpperCase();
          const pct = Math.min((m.value / maxVal) * 100, 100);
          return (
            <div key={i}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 13, color: "#cbd5e1" }}>{label}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace" }}>
                  {m.value.toFixed(1)} <span style={{ fontSize: 10, color: "#475569", fontFamily: "inherit" }}>{m.unit}</span>
                </span>
              </div>
              <div style={{ height: 5, background: "#0f172a", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.8s cubic-bezier(.4,0,.2,1)", opacity: 0.75 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dashboard View ────────────────────────────────────────────

function DashboardView({ initialCity, onCityChange }) {
  const [city, setCity] = useState("");
  const [input, setInput] = useState("");
  const [data, setData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (initialCity && !hasSearched) { setInput(initialCity); setCity(initialCity); setHasSearched(true); }
  }, [initialCity]);

  const fetchAqi = useCallback(async (c) => {
    if (!c) return;
    setLoading(true); setError(null); setData(null); setTrendData(null);
    try {
      const [aqiRes, trendRes] = await Promise.allSettled([
        fetch(`${API_BASE}/aqi?city=${encodeURIComponent(c)}`),
        fetch(`${API_BASE}/trend?city=${encodeURIComponent(c)}&parameter=pm25&limit=24`),
      ]);
      if (aqiRes.status === "fulfilled") {
        const r = aqiRes.value;
        if (r.status === 404) throw new Error(`City "${c}" not found on OpenAQ`);
        if (!r.ok) throw new Error(`Server error (${r.status})`);
        setData(await r.json());
      }
      if (trendRes.status === "fulfilled" && trendRes.value.ok) {
        const t = await trendRes.value.json();
        if (t.trend?.length > 0) setTrendData(t);
      }
      if (onCityChange) onCityChange(c);
    } catch (e) {
      setError(e.message.includes("fetch") ? `Cannot reach API at ${API_BASE}` : e.message);
    } finally { setLoading(false); }
  }, [onCityChange]);

  useEffect(() => { if (city) fetchAqi(city); }, [city]);
  const handleSearch = (e) => { e.preventDefault(); if (input.trim()) { setCity(input.trim()); setHasSearched(true); } };
  const cfg = data ? getAqiConfig(data.aqi) : null;

  const miniChartData = trendData?.trend?.slice(-12).map(t => ({
    time: new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    aqi: t.aqi,
  })) || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <form onSubmit={handleSearch} style={{ display: "flex", gap: 10 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#475569" }}><Search size={16} /></div>
          <input type="text" placeholder="Search any city — e.g. Delhi, London, Tokyo…" value={input} onChange={e => setInput(e.target.value)}
            style={{ width: "100%", paddingLeft: 42, paddingRight: 14, paddingTop: 13, paddingBottom: 13, background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 12, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
        </div>
        <button type="submit" style={{ background: "#2563eb", border: "none", color: "white", borderRadius: 12, padding: "0 28px", cursor: "pointer", fontWeight: 600, fontSize: 14, flexShrink: 0 }}>Search</button>
      </form>

      {!hasSearched && !loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#1e293b", border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wind size={30} style={{ color: "#334155" }} />
          </div>
          <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 18, margin: 0 }}>Search for a city</p>
          <p style={{ color: "#475569", fontSize: 14, margin: 0, textAlign: "center", maxWidth: 380 }}>Enter any city name to see live AQI, pollutant levels, health advisory and recent trend.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
            {["Delhi", "London", "Tokyo", "New York", "Beijing", "Sydney"].map(c => (
              <button key={c} onClick={() => { setInput(c); setCity(c); setHasSearched(true); }}
                style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>{c}</button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton h={220} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>{[0,1,2,3].map(i => <Skeleton key={i} h={80} />)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}><Skeleton h={260} /><Skeleton h={260} /></div>
        </div>
      )}
      {error && <ErrorCard message={error} onRetry={() => fetchAqi(city)} />}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Hero banner */}
          <div style={{ background: `linear-gradient(135deg, ${cfg.color}12 0%, #0f172a 55%)`, borderRadius: 24, padding: 32, border: `1px solid ${cfg.color}25`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: -50, top: -50, width: 220, height: 220, borderRadius: "50%", background: `${cfg.color}06`, border: `1px solid ${cfg.color}12` }} />
            <div style={{ position: "absolute", right: 30, top: 30, width: 120, height: 120, borderRadius: "50%", background: `${cfg.color}05` }} />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 24, position: "relative" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <MapPin size={13} style={{ color: "#64748b" }} />
                  <span style={{ color: "#64748b", fontSize: 14 }}>{data.city}, {data.country}</span>
                  <span style={{ fontSize: 11, background: "#1e293b80", color: "#475569", borderRadius: 12, padding: "2px 10px", display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={10} />{new Date(data.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 10 }}>
                  <span style={{ fontSize: 88, fontWeight: 800, color: cfg.color, fontFamily: "monospace", lineHeight: 1 }}>{data.aqi > 0 ? data.aqi : "—"}</span>
                  <div style={{ paddingBottom: 8 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 13, color: "#64748b" }}>AQI</p>
                    <AqiBadge aqi={data.aqi} />
                  </div>
                </div>
                <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 18px" }}>
                  Dominant: <span style={{ color: cfg.color, fontWeight: 700 }}>{(data.dominant_pollutant || "unknown").toUpperCase()}</span>
                  {" · "}{data.measurements?.length || 0} sensors active
                </p>
                {miniChartData.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, color: "#334155", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>PM2.5 — last 12 readings</p>
                    <div style={{ height: 56, width: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={miniChartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                          <defs>
                            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={cfg.color} stopOpacity={0.25} />
                              <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="aqi" stroke={cfg.color} strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0 }}>
                <AqiGauge aqi={data.aqi} size={175} />
              </div>
            </div>
          </div>

          {/* AQI scale */}
          <div style={{ display: "flex", gap: 3 }}>
            {AQI_CONFIG.map((c, i) => {
              const active = data.aqi >= c.min && data.aqi <= c.max;
              return (
                <div key={i} style={{ flex: c.max - c.min, borderRadius: 6, padding: "7px 5px", background: active ? c.badge : "#0f172a", border: `1px solid ${active ? c.color : "#1e293b"}`, textAlign: "center", transition: "all 0.3s" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: active ? c.text : "#334155" }}>{c.min}–{c.max}</div>
                  <div style={{ fontSize: 9, color: active ? c.color : "#334155", marginTop: 1 }}>{c.category.split(" ")[0]}</div>
                </div>
              );
            })}
          </div>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "AQI Level", value: data.aqi > 0 ? data.aqi : "N/A", sub: cfg.category, color: cfg.color },
              { label: "Dominant", value: (data.dominant_pollutant || "—").toUpperCase(), sub: "Primary pollutant", color: PARAM_COLORS[data.dominant_pollutant] || "#64748b" },
              { label: "Sensors", value: data.measurements?.length || 0, sub: "Active stations", color: "#60a5fa" },
              { label: "Updated", value: new Date(data.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), sub: new Date(data.last_updated).toLocaleDateString([], { day: "numeric", month: "short" }), color: "#94a3b8" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#1e293b", borderRadius: 16, padding: "16px 18px", border: "1px solid #334155" }}>
                <p style={{ margin: "0 0 4px", fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</p>
                <p style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</p>
                <p style={{ margin: 0, fontSize: 11, color: "#475569" }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Pollutant breakdown + health advisory */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {data.measurements?.length > 0
              ? <PollutantBreakdown measurements={data.measurements} />
              : <div style={{ background: "#1e293b", borderRadius: 20, padding: 24, border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 14 }}>No sensor data available</div>
            }
            <HealthAdvisory aqi={data.aqi} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Trends View ───────────────────────────────────────────────

function TrendView({ defaultCity }) {
  const [city, setCity] = useState(defaultCity || "");
  const [param, setParam] = useState("pm25");
  const [input, setInput] = useState(defaultCity || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTrend = useCallback(async (c, p) => {
    if (!c) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`${API_BASE}/trend?city=${encodeURIComponent(c)}&parameter=${p}&limit=24`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message.includes("fetch") ? `Cannot reach API at ${API_BASE}` : e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (city) fetchTrend(city, param); }, [city, param]);
  const handleSearch = (e) => { e.preventDefault(); if (input.trim()) setCity(input.trim()); };

  const chartData = data?.trend?.map(t => ({
    time: new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    aqi: t.aqi,
  })) || [];

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const cfg = getAqiConfig(payload[0].value);
    return (
      <div style={{ background: "#1e293b", border: `1px solid ${cfg.color}40`, borderRadius: 10, padding: "10px 14px" }}>
        <p style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: 22, fontWeight: 700, color: cfg.color, fontFamily: "monospace", margin: 0 }}>{payload[0].value}</p>
        <p style={{ fontSize: 11, color: cfg.color, margin: 0 }}>{cfg.category}</p>
      </div>
    );
  };

  const paramColor = PARAM_COLORS[param] || "#60a5fa";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#475569" }}><Search size={16} /></div>
          <input type="text" placeholder="City…" value={input} onChange={e => setInput(e.target.value)}
            style={{ width: "100%", paddingLeft: 42, paddingRight: 14, paddingTop: 12, paddingBottom: 12, background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 12, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
        </div>
        <select value={param} onChange={e => setParam(e.target.value)}
          style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 12, padding: "0 16px", fontSize: 14, outline: "none", cursor: "pointer" }}>
          {Object.entries(PARAM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit" style={{ background: "#2563eb", border: "none", color: "white", borderRadius: 12, padding: "0 24px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Search</button>
      </form>
      {loading && <Skeleton h={380} />}
      {error && <ErrorCard message={error} onRetry={() => fetchTrend(city, param)} />}
      {data && chartData.length > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, border: "1px solid #334155" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>{data.city}</p>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>{PARAM_LABELS[param]} · {data.unit} · Last {chartData.length} readings</p>
            </div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={150} stroke="#ef4444" strokeDasharray="4 4" opacity={0.4} />
                <ReferenceLine y={100} stroke="#f97316" strokeDasharray="4 4" opacity={0.4} />
                <ReferenceLine y={50} stroke="#eab308" strokeDasharray="4 4" opacity={0.4} />
                <Line type="monotone" dataKey="aqi" stroke={paramColor} strokeWidth={2.5} dot={{ r: 3, fill: paramColor, strokeWidth: 0 }} activeDot={{ r: 6, fill: paramColor, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {data && chartData.length === 0 && (
        <div style={{ background: "#1e293b", borderRadius: 20, border: "1px solid #334155", padding: "48px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
          <TrendingUp size={32} style={{ color: "#334155" }} />
          <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 16, margin: 0 }}>No historical data available</p>
          <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>OpenAQ doesn't have recent {PARAM_LABELS[param]} readings for {data.city}.</p>
          {data.message && <p style={{ color: "#334155", fontSize: 13, margin: 0, background: "#0f172a", borderRadius: 10, padding: "10px 14px", maxWidth: 460 }}>{data.message}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <p style={{ color: "#475569", fontSize: 13, width: "100%", margin: "0 0 6px" }}>Try a different pollutant:</p>
            {Object.entries(PARAM_LABELS).filter(([k]) => k !== param).map(([k, v]) => (
              <button key={k} onClick={() => setParam(k)} style={{ background: "#0f172a", border: "1px solid #334155", color: "#94a3b8", borderRadius: 20, padding: "5px 14px", cursor: "pointer", fontSize: 12 }}>{v}</button>
            ))}
          </div>
        </div>
      )}
      {!data && !loading && !error && (
        <div style={{ background: "#1e293b", borderRadius: 20, border: "1px solid #334155", padding: "48px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <TrendingUp size={32} style={{ color: "#334155" }} />
          <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 16, margin: 0 }}>Enter a city to view trends</p>
          <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>Historical AQI readings will be plotted here once you search.</p>
        </div>
      )}
    </div>
  );
}

// ── Forecast View ─────────────────────────────────────────────

function ForecastView({ defaultCity }) {
  const [city, setCity] = useState(defaultCity || "");
  const [param, setParam] = useState("pm25");
  const [input, setInput] = useState(defaultCity || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchForecast = useCallback(async (c, p) => {
    if (!c) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`${API_BASE}/predict?city=${encodeURIComponent(c)}&parameter=${p}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message.includes("fetch") ? `Cannot reach API at ${API_BASE}` : e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (city) fetchForecast(city, param); }, [city, param]);
  const handleSearch = (e) => { e.preventDefault(); if (input.trim()) setCity(input.trim()); };

  const chartData = data?.forecast?.map(f => ({
    time: new Date(f.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    aqi: f.aqi, confidence: Math.round(f.confidence * 100), category: f.category,
  })) || [];

  const methodLabels = { weighted_seasonal: "Weighted seasonal regression", linear_regression: "Linear regression", flat_mean: "Mean estimate", no_data: "Insufficient data" };
  const peakForecast = chartData.length > 0 ? chartData.reduce((a, b) => a.aqi > b.aqi ? a : b) : null;
  const avgAqi = chartData.length > 0 ? Math.round(chartData.reduce((s, f) => s + f.aqi, 0) / chartData.length) : 0;
  const avgCfg = getAqiConfig(avgAqi);
  const paramColor = PARAM_COLORS[param] || "#60a5fa";

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const cfg = getAqiConfig(payload[0].value);
    return (
      <div style={{ background: "#1e293b", border: `1px solid ${cfg.color}40`, borderRadius: 10, padding: "10px 14px" }}>
        <p style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: 20, fontWeight: 700, color: cfg.color, fontFamily: "monospace", margin: 0 }}>{payload[0].value}</p>
        <p style={{ fontSize: 11, color: cfg.color, margin: "2px 0" }}>{payload[0]?.payload?.category}</p>
        <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>Confidence: {payload[0]?.payload?.confidence}%</p>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#475569" }}><Search size={16} /></div>
          <input type="text" placeholder="City…" value={input} onChange={e => setInput(e.target.value)}
            style={{ width: "100%", paddingLeft: 42, paddingRight: 14, paddingTop: 12, paddingBottom: 12, background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 12, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
        </div>
        <select value={param} onChange={e => setParam(e.target.value)}
          style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 12, padding: "0 16px", fontSize: 14, outline: "none", cursor: "pointer" }}>
          {Object.entries(PARAM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit" style={{ background: "#2563eb", border: "none", color: "white", borderRadius: 12, padding: "0 24px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Predict</button>
      </form>

      {loading && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>{[0,1,2].map(i => <Skeleton key={i} h={80} />)}</div><Skeleton h={320} /></div>}
      {error && <ErrorCard message={error} onRetry={() => fetchForecast(city, param)} />}

      {data && chartData.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <Brain size={14} style={{ color: "#60a5fa", flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
              Forecast using <span style={{ color: "#60a5fa" }}>{methodLabels[data.method] || data.method}</span> on {data.history_points} historical readings.
              {data.message && <span style={{ color: "#ef4444" }}> {data.message}</span>}
              {" "}Confidence degrades over time — treat as estimates only.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { label: "Avg forecast AQI", value: avgAqi, sub: avgCfg.category, color: avgCfg.color },
              { label: "Peak AQI", value: peakForecast?.aqi || "—", sub: peakForecast?.time || "", color: getAqiConfig(peakForecast?.aqi).color },
              { label: "Forecast horizon", value: "24h", sub: `${chartData.length} hourly points`, color: "#60a5fa" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#1e293b", borderRadius: 16, padding: "16px 18px", border: "1px solid #334155" }}>
                <p style={{ margin: "0 0 4px", fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</p>
                <p style={{ margin: "0 0 2px", fontSize: 26, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</p>
                <p style={{ margin: 0, fontSize: 11, color: "#475569" }}>{s.sub}</p>
              </div>
            ))}
          </div>

          <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, border: "1px solid #334155" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>{data.city} — 24h AQI Forecast</p>
                <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>{PARAM_LABELS[param]} · {data.unit}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", background: "#0f172a", borderRadius: 8, padding: "4px 10px" }}>
                <Brain size={12} style={{ color: "#60a5fa" }} />
                {methodLabels[data.method]}
              </div>
            </div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
                  <defs>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={paramColor} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={paramColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={150} stroke="#ef4444" strokeDasharray="4 4" opacity={0.35} />
                  <ReferenceLine y={100} stroke="#f97316" strokeDasharray="4 4" opacity={0.35} />
                  <ReferenceLine y={50} stroke="#eab308" strokeDasharray="4 4" opacity={0.35} />
                  <Area type="monotone" dataKey="aqi" stroke={paramColor} strokeWidth={2.5} fill="url(#forecastGrad)"
                    dot={{ r: 3, fill: paramColor, strokeWidth: 0 }} activeDot={{ r: 6, fill: paramColor, strokeWidth: 0 }} strokeDasharray="6 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 11, color: "#334155", textAlign: "center" }}>Dashed line = forecasted values. Confidence score shown per hour below.</p>
          </div>

          <div style={{ background: "#1e293b", borderRadius: 20, padding: 24, border: "1px solid #334155" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Hourly breakdown — next 12 hours</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
              {chartData.slice(0, 12).map((f, i) => {
                const fcfg = getAqiConfig(f.aqi);
                return (
                  <div key={i} style={{ background: "#0f172a", borderRadius: 12, padding: "12px 8px", textAlign: "center", border: `1px solid ${fcfg.color}20` }}>
                    <p style={{ margin: "0 0 6px", fontSize: 11, color: "#475569" }}>{f.time}</p>
                    <p style={{ margin: "0 0 3px", fontSize: 20, fontWeight: 800, color: fcfg.color, fontFamily: "monospace" }}>{f.aqi}</p>
                    <p style={{ margin: "0 0 6px", fontSize: 9, color: fcfg.color }}>{f.category.split(" ")[0]}</p>
                    <div style={{ height: 2, background: "#1e293b", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${f.confidence}%`, background: fcfg.color, opacity: 0.5, borderRadius: 2 }} />
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: 9, color: "#334155" }}>{f.confidence}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {data && chartData.length === 0 && (
        <div style={{ background: "#1e293b", borderRadius: 20, border: "1px solid #334155", padding: "48px 32px", textAlign: "center" }}>
          <Brain size={32} style={{ color: "#334155", margin: "0 auto 16px" }} />
          <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 16, margin: "0 0 8px" }}>Insufficient data for forecast</p>
          <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>{data.message || "Not enough historical readings to generate a prediction."}</p>
        </div>
      )}

      {!data && !loading && !error && (
        <div style={{ background: "#1e293b", borderRadius: 20, border: "1px solid #334155", padding: "56px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#0f172a", border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Brain size={28} style={{ color: "#334155" }} />
          </div>
          <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 18, margin: 0 }}>24-hour AQI Prediction</p>
          <p style={{ color: "#475569", fontSize: 14, margin: 0, maxWidth: 400 }}>Enter a city to generate a machine-learning forecast of AQI over the next 24 hours, with per-hour confidence scores.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
            {["Delhi", "London", "Tokyo", "Beijing"].map(c => (
              <button key={c} onClick={() => { setInput(c); setCity(c); }}
                style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>{c}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cities View ───────────────────────────────────────────────

function CitiesView({ onSelectCity }) {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/cities?limit=200`)
      .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
      .then(raw => {
        const grouped = {};
        (raw.cities || raw || []).forEach(c => {
          const cityName = typeof c === "string" ? c : (c.city || c.name || "Unknown");
          const country = typeof c === "object" ? (c.country || "") : "";
          const key = `${cityName}|${country}`;
          if (!grouped[key]) grouped[key] = { city: cityName, country, count: 0 };
          grouped[key].count++;
        });
        setCities(Object.values(grouped));
        setLoading(false);
      })
      .catch(e => { setError(e.message.includes("fetch") ? `Cannot reach API at ${API_BASE}` : e.message); setLoading(false); });
  }, []);

  const filtered = cities.filter(c =>
    c.city.toLowerCase().includes(search.toLowerCase()) ||
    c.country.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#475569" }}><Search size={16} /></div>
        <input type="text" placeholder="Filter cities…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", paddingLeft: 42, paddingRight: 14, paddingTop: 12, paddingBottom: 12, background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 12, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
      </div>
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Info size={14} style={{ color: "#475569", flexShrink: 0, marginTop: 2 }} />
        <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
          Cities sourced from OpenAQ's monitoring station registry. Coverage varies by region.
          {cities.length > 0 && <span style={{ color: "#64748b" }}> Showing {filtered.length} of {cities.length} locations.</span>}
        </p>
      </div>
      {loading && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>{[...Array(12)].map((_, i) => <Skeleton key={i} h={62} />)}</div>}
      {error && <ErrorCard message={error} />}
      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {filtered.length === 0 && <p style={{ color: "#475569", gridColumn: "1/-1", textAlign: "center", padding: 40, fontSize: 14 }}>No cities found</p>}
          {filtered.map((c, i) => (
            <button key={i} onClick={() => onSelectCity(c.city)}
              style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 14, padding: "14px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#263548"; e.currentTarget.style.borderColor = "#3b82f6"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.borderColor = "#334155"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ color: "#3b82f6", flexShrink: 0 }}><MapPin size={14} /></div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.city}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{c.country}{c.count > 1 && <span style={{ color: "#334155" }}> · {c.count} stations</span>}</p>
                </div>
              </div>
              <ChevronRight size={14} style={{ color: "#475569", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Map View — D3 + real world topology ───────────────────────

function MapView({ onSelectCity }) {
  const containerRef = useRef(null);
  const [cityData, setCityData] = useState({});
  const [initialized, setInitialized] = useState(false);
  const [popup, setPopup] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const loadD3 = () => new Promise(resolve => {
      if (window.d3 && window.topojson) { resolve(); return; }
      const s1 = document.createElement("script");
      s1.src = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js";
      s1.onload = () => {
        const s2 = document.createElement("script");
        s2.src = "https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js";
        s2.onload = resolve;
        document.head.appendChild(s2);
      };
      document.head.appendChild(s1);
    });

    const drawMap = async () => {
      await loadD3();
      const d3 = window.d3, topo = window.topojson;
      if (!containerRef.current) return;

      const W = 960, H = 480;
      d3.select(containerRef.current).selectAll("*").remove();
      const svg = d3.select(containerRef.current).append("svg")
        .attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%").attr("preserveAspectRatio", "xMidYMid meet");

      const proj = d3.geoNaturalEarth1().scale(160).translate([W / 2, H / 2 + 20]);
      const path = d3.geoPath(proj);

      svg.append("rect").attr("width", W).attr("height", H).attr("fill", "#070d1a");

      const graticule = d3.geoGraticule().step([30, 30]);
      svg.append("path").datum(graticule()).attr("d", path).attr("fill", "none").attr("stroke", "#0e1e35").attr("stroke-width", 0.5);

      setStatus("fetching");
      const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
      const countries = topo.feature(world, world.objects.countries);
      const borders = topo.mesh(world, world.objects.countries, (a, b) => a !== b);
      const outline = { type: "Sphere" };

      svg.append("path").datum(outline).attr("d", path).attr("fill", "none").attr("stroke", "#0e1e35").attr("stroke-width", 1);
      svg.selectAll(".land").data(countries.features).join("path")
        .attr("class", "land").attr("d", path).attr("fill", "#14243d").attr("stroke", "none");
      svg.append("path").datum(borders).attr("d", path).attr("fill", "none").attr("stroke", "#1d3454").attr("stroke-width", 0.6);
      svg.append("path").datum({ type: "LineString", coordinates: [[-180, 0], [180, 0]] })
        .attr("d", path).attr("fill", "none").attr("stroke", "#1d3454").attr("stroke-width", 0.8).attr("stroke-dasharray", "4 4");

      setStatus("ready");

      const cityGroup = svg.append("g").attr("class", "cities");
      MAP_CITIES.forEach(city => {
        const coords = proj([city.lng, city.lat]);
        if (!coords) return;
        const [x, y] = coords;
        const g = cityGroup.append("g").attr("transform", `translate(${x},${y})`).style("cursor", "pointer");
        g.append("circle").attr("r", 8).attr("fill", "#60a5fa").attr("opacity", 0.08).attr("class", `pulse-${city.name.replace(/\s/g,"")}`);
        g.append("circle").attr("r", 4.5).attr("fill", "#1e3a5f").attr("stroke", "#2d4a6e").attr("stroke-width", 1).attr("class", `dot-${city.name.replace(/\s/g,"")}`);
        g.on("click", () => setPopup(p => p?.name === city.name ? null : { name: city.name, lat: city.lat, lng: city.lng, x, y }));
      });

      window._airwatchD3 = { svg, proj, cityGroup };
    };

    drawMap();

    // Fetch AQI for all cities
    const loadData = async () => {
      const results = {};
      await Promise.allSettled(MAP_CITIES.map(async city => {
        try {
          const res = await fetch(`${API_BASE}/aqi?city=${encodeURIComponent(city.name)}`);
          if (res.ok) results[city.name] = await res.json();
        } catch (_) {}
      }));
      setCityData(results);
      setInitialized(true);
    };
    loadData();
  }, []);

  // Update dot colors when data arrives
  useEffect(() => {
    if (!initialized || !window._airwatchD3) return;
    const { svg } = window._airwatchD3;
    MAP_CITIES.forEach(city => {
      const d = cityData[city.name];
      const aqi = d?.aqi || 0;
      const cfg = getAqiConfig(aqi);
      const safeId = city.name.replace(/\s/g, "");
      svg.select(`.dot-${safeId}`).attr("fill", aqi > 0 ? cfg.color : "#1e3a5f").attr("stroke", aqi > 0 ? cfg.color + "60" : "#2d4a6e").attr("r", 5);
      if (aqi > 0) svg.select(`.pulse-${safeId}`).attr("fill", cfg.color).attr("opacity", 0.12).attr("r", 11);
    });
  }, [initialized, cityData]);

  const getPopupCity = () => MAP_CITIES.find(c => c.name === popup?.name);
  const getPopupData = () => popup ? cityData[popup.name] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>Live World Map</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Click any city dot to view AQI · {MAP_CITIES.length} cities tracked</p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[{ label: "Good", color: "#22c55e" }, { label: "Moderate", color: "#eab308" }, { label: "Unhealthy", color: "#ef4444" }, { label: "Hazardous", color: "#be185d" }, { label: "No data", color: "#1e3a5f" }].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />{l.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "relative", background: "#070d1a", borderRadius: 20, overflow: "hidden", border: "1px solid #1e2f4a" }}>
        <div ref={containerRef} style={{ width: "100%", display: "block" }} />

        {(status === "loading" || status === "fetching") && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <p style={{ color: "#475569", fontSize: 13 }}>{status === "loading" ? "Loading D3…" : "Fetching world map…"}</p>
          </div>
        )}

        {popup && (() => {
          const d = getPopupData();
          const aqi = d?.aqi || 0;
          const cfg = getAqiConfig(aqi);
          const container = containerRef.current;
          const cW = container?.clientWidth || 800;
          const cH = container?.clientHeight || 400;
          const scaleX = cW / 960;
          const scaleY = cH / 480;
          const sx = (popup.x || 0) * scaleX;
          const sy = (popup.y || 0) * scaleY;
          const flipX = sx > cW * 0.65, flipY = sy > cH * 0.55;
          return (
            <div style={{
              position: "absolute",
              left: flipX ? "auto" : sx + 14, right: flipX ? cW - sx + 14 : "auto",
              top: flipY ? "auto" : sy + 8, bottom: flipY ? cH - sy + 8 : "auto",
              background: "#1e293b", borderRadius: 14, padding: "14px 18px",
              border: `1px solid ${cfg.color}50`, minWidth: 170,
              boxShadow: "0 8px 32px #00000080", zIndex: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>
                  <MapPin size={12} style={{ color: "#64748b" }} /> {popup.name}
                </div>
                <button onClick={() => setPopup(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 0 }}><X size={14} /></button>
              </div>
              {aqi > 0 ? (
                <>
                  <div style={{ fontSize: 32, fontWeight: 800, color: cfg.color, fontFamily: "monospace", lineHeight: 1 }}>{aqi}</div>
                  <div style={{ fontSize: 11, color: cfg.color, marginBottom: 12 }}>{cfg.category}</div>
                  <button onClick={() => { onSelectCity(popup.name); setPopup(null); }}
                    style={{ width: "100%", background: "#2563eb", border: "none", color: "white", borderRadius: 8, padding: "8px 0", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    View Dashboard →
                  </button>
                </>
              ) : (
                <div style={{ color: "#475569", fontSize: 13, marginBottom: 10 }}>No data available</div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Learn View ────────────────────────────────────────────────

function LearnView() {
  const [selected, setSelected] = useState("pm25");
  const pollutant = POLLUTANTS.find(p => p.id === selected);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, border: "1px solid #334155" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ background: "#1d4ed820", borderRadius: 10, padding: 8 }}><Info size={20} style={{ color: "#60a5fa" }} /></div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>What is AQI?</h2>
        </div>
        <p style={{ color: "#94a3b8", lineHeight: 1.7, fontSize: 14, marginBottom: 20 }}>The Air Quality Index (AQI) is a standardised scale developed by the EPA to communicate how clean or polluted the air is. It runs from 0 to 500 — the higher the number, the greater the health risk.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {AQI_CONFIG.map((c, i) => (
            <div key={i} style={{ background: "#0f172a", borderRadius: 12, padding: "12px 14px", border: `1px solid ${c.color}30` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.min}–{c.max}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#cbd5e1" }}>{c.category}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, border: "1px solid #334155" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ background: "#16653420", borderRadius: 10, padding: 8 }}><Shield size={20} style={{ color: "#22c55e" }} /></div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>When is it safe?</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[{ range: "0–50", color: "#22c55e", label: "Good", advice: "Air quality is satisfactory. Outdoor activities are safe for everyone." }, { range: "51–100", color: "#eab308", label: "Moderate", advice: "Acceptable quality. Very sensitive people should consider reducing prolonged outdoor exertion." }, { range: "101–150", color: "#f97316", label: "Sensitive groups", advice: "Elderly, children, and people with asthma should limit prolonged outdoor exertion." }, { range: "151–200", color: "#ef4444", label: "Unhealthy", advice: "Everyone may experience health effects. Sensitive groups should avoid outdoor exertion." }, { range: "201–300", color: "#a855f7", label: "Very Unhealthy", advice: "Health alert. Everyone may experience serious effects. Avoid prolonged outdoor activity." }, { range: "301+", color: "#be185d", label: "Hazardous", advice: "Emergency conditions. Stay indoors with windows closed." }].map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "#0f172a", borderRadius: 12, padding: "12px 16px", borderLeft: `3px solid ${row.color}`, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: row.color, minWidth: 64, marginTop: 1, flexShrink: 0 }}>{row.range}</span>
              <div><span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{row.label} — </span><span style={{ fontSize: 13, color: "#94a3b8" }}>{row.advice}</span></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, border: "1px solid #334155" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ background: "#f9731620", borderRadius: 10, padding: 8 }}><Zap size={20} style={{ color: "#f97316" }} /></div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Pollutant Guide</h2>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
          {POLLUTANTS.map(p => (
            <button key={p.id} onClick={() => setSelected(p.id)} style={{ background: selected === p.id ? "#2563eb" : "#0f172a", border: `1px solid ${selected === p.id ? "#3b82f6" : "#334155"}`, color: selected === p.id ? "white" : "#64748b", borderRadius: 10, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.15s" }}>{p.name}</button>
          ))}
        </div>
        {pollutant && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 28 }}>{pollutant.icon}</span>
                <div>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#f1f5f9" }}>{pollutant.name}</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>{pollutant.full}</p>
                </div>
              </div>
              <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>{pollutant.description}</p>
              <div style={{ background: "#0f172a", borderRadius: 12, padding: "14px 16px", borderLeft: "3px solid #ef4444", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Health Impact</p>
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{pollutant.health}</p>
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Concentration Levels ({pollutant.unit})</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pollutant.levels.map((l, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f172a", borderRadius: 10, padding: "12px 16px", borderLeft: `3px solid ${l.color}`, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
                    <span style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 600 }}>{l.label}</span>
                    <span style={{ fontSize: 13, color: l.color, fontFamily: "monospace", fontWeight: 700 }}>{l.range}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState("dashboard");
  const [selectedCity, setSelectedCity] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleSelectCity = (city) => { setSelectedCity(city); setView("dashboard"); };

  const navItems = [
    { id: "dashboard", label: "Dashboard",  icon: <Activity size={18} /> },
    { id: "trend",     label: "Trends",     icon: <BarChart2 size={18} /> },
    { id: "forecast",  label: "Forecast",   icon: <Brain size={18} /> },
    { id: "cities",    label: "Cities",     icon: <MapPin size={18} /> },
    { id: "map",       label: "World Map",  icon: <Globe size={18} /> },
    { id: "learn",     label: "Learn",      icon: <BookOpen size={18} /> },
  ];

  const viewTitles = { dashboard: "Dashboard", trend: "Trends", forecast: "24h Forecast", cities: "Cities", map: "World Map", learn: "Learn" };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0f1e", color: "#f1f5f9", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        input::placeholder { color: #475569; }
        select option { background: #1e293b; }
      `}</style>

      <div style={{ width: sidebarOpen ? 220 : 64, flexShrink: 0, background: "#0d1526", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", transition: "width 0.25s cubic-bezier(.4,0,.2,1)", overflow: "hidden", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "20px 14px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 10, minHeight: 68 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#1d4ed8,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Activity size={18} color="white" />
          </div>
          {sidebarOpen && <span style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", whiteSpace: "nowrap" }}>AirWatch</span>}
        </div>
        <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {navItems.map(n => {
            const active = view === n.id;
            return (
              <button key={n.id} onClick={() => setView(n.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 10, border: "none", cursor: "pointer", background: active ? "#1d4ed820" : "transparent", color: active ? "#60a5fa" : "#64748b", borderLeft: `2px solid ${active ? "#3b82f6" : "transparent"}`, transition: "all 0.15s", whiteSpace: "nowrap", width: "100%", textAlign: "left", fontSize: 14, fontWeight: active ? 600 : 400 }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.color = "#94a3b8"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748b"; } }}>
                <div style={{ flexShrink: 0 }}>{n.icon}</div>
                {sidebarOpen && <span>{n.label}</span>}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: "10px 8px", borderTop: "1px solid #1e293b" }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 10, border: "none", cursor: "pointer", background: "transparent", color: "#475569", width: "100%", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#1e293b"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            {sidebarOpen && <span style={{ fontSize: 13 }}>Collapse</span>}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto", minWidth: 0 }}>
        <div style={{ padding: "18px 32px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d1526", position: "sticky", top: 0, zIndex: 5 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>{viewTitles[view]}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#475569" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
            Live · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
        <div style={{ flex: 1, padding: "28px 32px" }}>
          {view === "dashboard" && <DashboardView initialCity={selectedCity} key={selectedCity || "empty"} onCityChange={setSelectedCity} />}
          {view === "trend"     && <TrendView defaultCity={selectedCity} />}
          {view === "forecast"  && <ForecastView defaultCity={selectedCity} />}
          {view === "cities"    && <CitiesView onSelectCity={handleSelectCity} />}
          {view === "map"       && <MapView onSelectCity={handleSelectCity} />}
          {view === "learn"     && <LearnView />}
        </div>
      </div>
    </div>
  );
}