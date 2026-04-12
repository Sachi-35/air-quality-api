// ============================================================
// AirWatch — Air Quality Monitoring System
// Full desktop SaaS layout with sidebar nav
// Views: Dashboard, Trends, Cities, Map, Learn
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  Wind, MapPin, Activity, Search, ChevronRight,
  AlertTriangle, RefreshCw, BarChart2, Globe, BookOpen,
  Clock, ChevronLeft, Info, Shield, Zap, X,
} from "lucide-react";

// ─── Config ────────────────────────────────────────────────
const API_BASE = "http://localhost:8000";

// ─── AQI Scale ─────────────────────────────────────────────
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
  for (const cfg of AQI_CONFIG) {
    if (aqi >= cfg.min && aqi <= cfg.max) return cfg;
  }
  return AQI_CONFIG[AQI_CONFIG.length - 1];
}

// ─── Pollutant data ─────────────────────────────────────────
const POLLUTANTS = [
  {
    id: "pm25", name: "PM 2.5", full: "Fine Particulate Matter",
    icon: "💨", unit: "µg/m³",
    description: "Tiny particles less than 2.5 microns — smaller than a human hair. They penetrate deep into lungs and enter the bloodstream.",
    levels: [
      { label: "Good",      range: "0–12",     color: "#22c55e" },
      { label: "Moderate",  range: "12–35.4",  color: "#eab308" },
      { label: "Unhealthy", range: "35.5–55.4",color: "#f97316" },
      { label: "Hazardous", range: "250.5+",   color: "#be185d" },
    ],
    health: "Long-term exposure linked to heart disease, lung cancer, and respiratory illness.",
  },
  {
    id: "pm10", name: "PM 10", full: "Coarse Particulate Matter",
    icon: "🌫️", unit: "µg/m³",
    description: "Larger particles from dust, pollen, mold. Irritate nose, throat and lungs but are filtered more easily than PM 2.5.",
    levels: [
      { label: "Good",      range: "0–54",    color: "#22c55e" },
      { label: "Moderate",  range: "55–154",  color: "#eab308" },
      { label: "Unhealthy", range: "155–254", color: "#f97316" },
      { label: "Hazardous", range: "425+",    color: "#be185d" },
    ],
    health: "Can trigger asthma attacks and aggravate existing respiratory conditions.",
  },
  {
    id: "no2", name: "NO₂", full: "Nitrogen Dioxide",
    icon: "🏭", unit: "ppb",
    description: "Produced by burning fuel — vehicles, power plants. Contributes to smog and acid rain.",
    levels: [
      { label: "Good",      range: "0–53",    color: "#22c55e" },
      { label: "Moderate",  range: "54–100",  color: "#eab308" },
      { label: "Unhealthy", range: "101–360", color: "#f97316" },
      { label: "Hazardous", range: "649+",    color: "#be185d" },
    ],
    health: "Inflames airways, increases susceptibility to respiratory infections.",
  },
  {
    id: "o3", name: "O₃", full: "Ground-level Ozone",
    icon: "☀️", unit: "ppb",
    description: "Formed when pollutants from cars and industry react with sunlight. Worst on hot sunny days.",
    levels: [
      { label: "Good",      range: "0–54",  color: "#22c55e" },
      { label: "Moderate",  range: "55–70", color: "#eab308" },
      { label: "Unhealthy", range: "71–85", color: "#f97316" },
      { label: "Hazardous", range: "105+",  color: "#be185d" },
    ],
    health: "Chest pain, coughing, throat irritation, worsens bronchitis and emphysema.",
  },
  {
    id: "so2", name: "SO₂", full: "Sulfur Dioxide",
    icon: "⚗️", unit: "ppb",
    description: "Released by burning coal and oil, smelting metals. Key cause of acid rain.",
    levels: [
      { label: "Good",      range: "0–35",   color: "#22c55e" },
      { label: "Moderate",  range: "36–75",  color: "#eab308" },
      { label: "Unhealthy", range: "76–185", color: "#f97316" },
      { label: "Hazardous", range: "304+",   color: "#be185d" },
    ],
    health: "Triggers asthma, irritates respiratory tract, damages lung function.",
  },
  {
    id: "co", name: "CO", full: "Carbon Monoxide",
    icon: "🚗", unit: "ppm",
    description: "Odourless, colourless gas from incomplete combustion. Extremely dangerous at high concentrations.",
    levels: [
      { label: "Good",      range: "0–4.4",   color: "#22c55e" },
      { label: "Moderate",  range: "4.5–9.4", color: "#eab308" },
      { label: "Unhealthy", range: "9.5–12.4",color: "#f97316" },
      { label: "Hazardous", range: "30.5+",   color: "#be185d" },
    ],
    health: "Reduces oxygen delivery to organs. Fatal at very high levels.",
  },
];

// ─── Major cities for world map ─────────────────────────────
const MAP_CITIES = [
  { name: "Delhi",        lat: 28.6,  lng: 77.2   },
  { name: "Mumbai",       lat: 19.1,  lng: 72.9   },
  { name: "Beijing",      lat: 39.9,  lng: 116.4  },
  { name: "Shanghai",     lat: 31.2,  lng: 121.5  },
  { name: "London",       lat: 51.5,  lng: -0.1   },
  { name: "Paris",        lat: 48.9,  lng: 2.3    },
  { name: "New York",     lat: 40.7,  lng: -74.0  },
  { name: "Los Angeles",  lat: 34.1,  lng: -118.2 },
  { name: "Tokyo",        lat: 35.7,  lng: 139.7  },
  { name: "Seoul",        lat: 37.6,  lng: 127.0  },
  { name: "Bangkok",      lat: 13.8,  lng: 100.5  },
  { name: "Jakarta",      lat: -6.2,  lng: 106.8  },
  { name: "Cairo",        lat: 30.0,  lng: 31.2   },
  { name: "Lagos",        lat: 6.5,   lng: 3.4    },
  { name: "São Paulo",    lat: -23.5, lng: -46.6  },
  { name: "Mexico City",  lat: 19.4,  lng: -99.1  },
  { name: "Karachi",      lat: 24.9,  lng: 67.1   },
  { name: "Dhaka",        lat: 23.8,  lng: 90.4   },
  { name: "Chicago",      lat: 41.9,  lng: -87.6  },
  { name: "Berlin",       lat: 52.5,  lng: 13.4   },
  { name: "Sydney",       lat: -33.9, lng: 151.2  },
  { name: "Toronto",      lat: 43.7,  lng: -79.4  },
  { name: "Dubai",        lat: 25.2,  lng: 55.3   },
  { name: "Singapore",    lat: 1.35,  lng: 103.8  },
  { name: "Lahore",       lat: 31.5,  lng: 74.3   },
];

const PARAM_LABELS = { pm25: "PM 2.5", pm10: "PM 10", no2: "NO₂", o3: "O₃", so2: "SO₂", co: "CO" };
const PARAM_COLORS = { pm25: "#f97316", pm10: "#eab308", no2: "#a855f7", o3: "#22c55e", so2: "#ef4444", co: "#60a5fa" };

// ─── Shared components ──────────────────────────────────────
function Skeleton({ h = 48 }) {
  return (
    <div style={{
      height: h, borderRadius: 12,
      background: "linear-gradient(90deg,#1e293b 25%,#263548 50%,#1e293b 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
    }} />
  );
}

function ErrorCard({ message, onRetry }) {
  return (
    <div style={{ background: "#1c0505", border: "1px solid #7f1d1d", borderRadius: 16, padding: 24, textAlign: "center" }}>
      <div style={{ color: "#ef4444", display: "flex", justifyContent: "center", marginBottom: 10 }}><AlertTriangle size={28} /></div>
      <p style={{ color: "#fca5a5", fontWeight: 600, marginBottom: 6 }}>Unable to load data</p>
      <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 14 }}>{message}</p>
      {onRetry && (
        <button onClick={onRetry} style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 auto", background: "#7f1d1d", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13 }}>
          <RefreshCw size={14} /> Try again
        </button>
      )}
    </div>
  );
}

function AqiBadge({ aqi }) {
  const cfg = getAqiConfig(aqi);
  return (
    <span style={{ background: cfg.badge, color: cfg.text, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
      {cfg.category}
    </span>
  );
}

// ─── AQI Gauge ─────────────────────────────────────────────
function AqiGauge({ aqi, size = 200 }) {
  const cfg = getAqiConfig(aqi);
  const pct = aqi > 0 ? Math.min(aqi / 500, 1) : 0;
  const r = size * 0.38, cx = size / 2, cy = size / 2;
  const totalAngle = 260, startAngle = 230;

  function polar(angle, radius) {
    const rad = (angle - 90) * (Math.PI / 180);
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  const s = polar(startAngle, r);
  const e = polar(startAngle + totalAngle, r);
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
        {fillPath && (
          <path d={fillPath} fill="none" stroke={cfg.color} strokeWidth={sw} strokeLinecap="round" opacity={0.9}
            style={{ transition: "all 0.9s cubic-bezier(.4,0,.2,1)" }} />
        )}
        <text x={cx} y={cy + size * 0.04} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: size * 0.2, fontWeight: 700, fill: cfg.color, fontFamily: "monospace" }}>
          {aqi > 0 ? aqi : "—"}
        </text>
        <text x={cx} y={cy + size * 0.17} textAnchor="middle"
          style={{ fontSize: size * 0.06, fill: "#475569", letterSpacing: "0.1em" }}>
          AQI INDEX
        </text>
      </svg>
      <AqiBadge aqi={aqi} />
    </div>
  );
}

// ─── Measurements table ─────────────────────────────────────
function MeasurementsTable({ measurements }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
        Sensor Readings
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {measurements.map((m, i) => {
          const color = PARAM_COLORS[m.parameter] || "#94a3b8";
          const label = PARAM_LABELS[m.parameter] || m.parameter.toUpperCase();
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f172a", borderRadius: 10, padding: "10px 14px", border: "1px solid #1e293b" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}80` }} />
                <span style={{ fontSize: 13, color: "#cbd5e1" }}>{label}</span>
              </div>
              <div>
                <span style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "monospace" }}>{m.value.toFixed(1)}</span>
                <span style={{ fontSize: 11, color: "#475569", marginLeft: 4 }}>{m.unit}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dashboard View ─────────────────────────────────────────
function DashboardView({ initialCity, onCityChange }) {
  const [city, setCity] = useState(initialCity || "Delhi");
  const [input, setInput] = useState(initialCity || "Delhi");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAqi = useCallback(async (c) => {
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`${API_BASE}/aqi?city=${encodeURIComponent(c)}`);
      if (res.status === 404) throw new Error(`City "${c}" not found`);
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const d = await res.json();
      setData(d);
      if (onCityChange) onCityChange(c);
    } catch (e) {
      setError(e.message.includes("fetch") ? `Cannot reach API at ${API_BASE}` : e.message);
    } finally { setLoading(false); }
  }, [onCityChange]);

  useEffect(() => { fetchAqi(city); }, [city]);

  const handleSearch = (e) => { e.preventDefault(); if (input.trim()) setCity(input.trim()); };
  const cfg = data ? getAqiConfig(data.aqi) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <form onSubmit={handleSearch} style={{ display: "flex", gap: 10 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#475569" }}>
            <Search size={16} />
          </div>
          <input type="text" placeholder="Search any city…" value={input} onChange={e => setInput(e.target.value)}
            style={{ width: "100%", paddingLeft: 42, paddingRight: 14, paddingTop: 12, paddingBottom: 12, background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 12, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
        </div>
        <button type="submit" style={{ background: "#2563eb", border: "none", color: "white", borderRadius: 12, padding: "0 28px", cursor: "pointer", fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
          Search
        </button>
      </form>

      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Skeleton h={340} /><Skeleton h={340} />
        </div>
      )}
      {error && <ErrorCard message={error} onRetry={() => fetchAqi(city)} />}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={14} style={{ color: "#64748b" }} />
              <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 20 }}>{data.city}</span>
              <span style={{ color: "#64748b", fontSize: 14 }}>{data.country}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
              <Clock size={12} />
              {new Date(data.last_updated).toLocaleTimeString()}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Gauge card */}
            <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, border: `1px solid ${cfg.color}30`, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <AqiGauge aqi={data.aqi} size={220} />
              <div style={{ width: "100%", display: "flex", gap: 10 }}>
                <div style={{ flex: 1, background: "#0f172a", borderRadius: 12, padding: "10px 14px", border: "1px solid #1e293b" }}>
                  <p style={{ fontSize: 11, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Dominant</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Wind size={14} style={{ color: "#60a5fa" }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{(data.dominant_pollutant || "—").toUpperCase()}</span>
                  </div>
                </div>
                <div style={{ flex: 1, background: "#0f172a", borderRadius: 12, padding: "10px 14px", border: "1px solid #1e293b" }}>
                  <p style={{ fontSize: 11, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sensors</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Activity size={14} style={{ color: "#60a5fa" }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{data.measurements?.length || 0} active</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Measurements */}
            <div style={{ background: "#1e293b", borderRadius: 20, padding: 24, border: "1px solid #334155" }}>
              {data.measurements?.length > 0
                ? <MeasurementsTable measurements={data.measurements} />
                : <div style={{ color: "#475569", textAlign: "center", paddingTop: 80, fontSize: 14 }}>No sensor data available</div>
              }
            </div>
          </div>

          {/* AQI scale bar */}
          <div style={{ background: "#1e293b", borderRadius: 16, padding: "16px 20px", border: "1px solid #334155" }}>
            <p style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>AQI Scale</p>
            <div style={{ display: "flex", gap: 4 }}>
              {AQI_CONFIG.map((c, i) => {
                const active = data.aqi >= c.min && data.aqi <= c.max;
                return (
                  <div key={i} style={{ flex: 1, borderRadius: 8, padding: "8px 4px", background: active ? c.badge : "#0f172a", border: `1px solid ${active ? c.color : "#1e293b"}`, textAlign: "center", transition: "all 0.3s" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: active ? c.text : "#334155" }}>{c.min}–{c.max}</div>
                    <div style={{ fontSize: 9, color: active ? c.color : "#334155", marginTop: 2 }}>{c.category.split(" ")[0]}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trends View ────────────────────────────────────────────
function TrendView({ defaultCity }) {
  const [city, setCity] = useState(defaultCity || "Delhi");
  const [param, setParam] = useState("pm25");
  const [input, setInput] = useState(defaultCity || "Delhi");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTrend = useCallback(async (c, p) => {
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`${API_BASE}/trend?city=${encodeURIComponent(c)}&parameter=${p}&limit=24`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message.includes("fetch") ? `Cannot reach API at ${API_BASE}` : e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTrend(city, param); }, [city, param]);
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
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#475569" }}>
            <Search size={16} />
          </div>
          <input type="text" placeholder="City…" value={input} onChange={e => setInput(e.target.value)}
            style={{ width: "100%", paddingLeft: 42, paddingRight: 14, paddingTop: 12, paddingBottom: 12, background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 12, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
        </div>
        <select value={param} onChange={e => setParam(e.target.value)}
          style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 12, padding: "0 16px", fontSize: 14, outline: "none", cursor: "pointer" }}>
          {Object.entries(PARAM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit" style={{ background: "#2563eb", border: "none", color: "white", borderRadius: 12, padding: "0 24px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
          Search
        </button>
      </form>

      {loading && <Skeleton h={380} />}
      {error && <ErrorCard message={error} onRetry={() => fetchTrend(city, param)} />}

      {data && chartData.length > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, border: "1px solid #334155" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>{data.city}</p>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>{PARAM_LABELS[param]} · {data.unit} · Last 24 readings</p>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748b" }}>
              {[{ label: "Moderate", color: "#eab308" }, { label: "Sensitive", color: "#f97316" }, { label: "Unhealthy", color: "#ef4444" }].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 20, borderTop: `2px dashed ${l.color}`, opacity: 0.6 }} />
                  {l.label}
                </div>
              ))}
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
                <ReferenceLine y={50}  stroke="#eab308" strokeDasharray="4 4" opacity={0.4} />
                <Line type="monotone" dataKey="aqi" stroke={paramColor} strokeWidth={2.5}
                  dot={{ r: 3, fill: paramColor, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: paramColor, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {data && chartData.length === 0 && (
        <div style={{ textAlign: "center", color: "#475569", padding: 60, background: "#1e293b", borderRadius: 20, fontSize: 14 }}>
          No trend data available for {data.city} / {PARAM_LABELS[param]}
        </div>
      )}
    </div>
  );
}

// ─── Cities View ────────────────────────────────────────────
function CitiesView({ onSelectCity }) {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/cities?limit=50`)
      .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
      .then(d => { setCities(d.cities || d || []); setLoading(false); })
      .catch(e => { setError(e.message.includes("fetch") ? `Cannot reach API at ${API_BASE}` : e.message); setLoading(false); });
  }, []);

  const filtered = cities.filter(c => {
    const name = (typeof c === "string" ? c : c.city || c.name || "").toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#475569" }}><Search size={16} /></div>
        <input type="text" placeholder="Filter cities…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", paddingLeft: 42, paddingRight: 14, paddingTop: 12, paddingBottom: 12, background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 12, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
      </div>

      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {[...Array(12)].map((_, i) => <Skeleton key={i} h={62} />)}
        </div>
      )}
      {error && <ErrorCard message={error} />}
      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {filtered.length === 0 && (
            <p style={{ color: "#475569", gridColumn: "1/-1", textAlign: "center", padding: 40, fontSize: 14 }}>No cities found</p>
          )}
          {filtered.map((c, i) => {
            const name = typeof c === "string" ? c : c.city || c.name || "Unknown";
            const country = typeof c === "object" ? (c.country || "") : "";
            return (
              <button key={i} onClick={() => onSelectCity(name)}
                style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 14, padding: "14px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#263548"; e.currentTarget.style.borderColor = "#3b82f6"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.borderColor = "#334155"; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ color: "#3b82f6" }}><MapPin size={14} /></div>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{name}</p>
                    {country && <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{country}</p>}
                  </div>
                </div>
                <ChevronRight size={14} style={{ color: "#475569" }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Map View ───────────────────────────────────────────────
function MapView({ onSelectCity }) {
  const [cityData, setCityData] = useState({});
  const [initialized, setInitialized] = useState(false);
  const [popup, setPopup] = useState(null);

  useEffect(() => {
    const load = async () => {
      const results = {};
      await Promise.allSettled(
        MAP_CITIES.map(async (city) => {
          try {
            const res = await fetch(`${API_BASE}/aqi?city=${encodeURIComponent(city.name)}`);
            if (res.ok) results[city.name] = await res.json();
          } catch (_) {}
        })
      );
      setCityData(results);
      setInitialized(true);
    };
    load();
  }, []);

  const W = 900, H = 460;
  function project(lat, lng) {
    return { x: ((lng + 180) / 360) * W, y: ((90 - lat) / 180) * H };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>Live World Map</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Click any city dot to view AQI · {MAP_CITIES.length} cities monitored</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[{ label: "Good", color: "#22c55e" }, { label: "Moderate", color: "#eab308" }, { label: "Unhealthy", color: "#ef4444" }, { label: "Hazardous", color: "#be185d" }].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} /> {l.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "relative", background: "#1e293b", borderRadius: 20, overflow: "hidden", border: "1px solid #334155" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          <rect width={W} height={H} fill="#0a0f1e" />
          {[-60, -30, 0, 30, 60].map(lat => {
            const { y } = project(lat, 0);
            return <line key={lat} x1={0} y1={y} x2={W} y2={y} stroke="#1e293b" strokeWidth={1} />;
          })}
          {[-120, -60, 0, 60, 120].map(lng => {
            const { x } = project(0, lng);
            return <line key={lng} x1={x} y1={0} x2={x} y2={H} stroke="#1e293b" strokeWidth={1} />;
          })}
          {(() => { const { y } = project(0, 0); return <line x1={0} y1={y} x2={W} y2={y} stroke="#334155" strokeWidth={1} strokeDasharray="4 4" />; })()}

          {MAP_CITIES.map((city) => {
            const { x, y } = project(city.lat, city.lng);
            const d = cityData[city.name];
            const aqi = d?.aqi || 0;
            const cfg = getAqiConfig(aqi);
            const isActive = popup?.name === city.name;
            return (
              <g key={city.name} style={{ cursor: "pointer" }} onClick={() => setPopup(isActive ? null : { ...city, aqi, cfg, data: d })}>
                {initialized && aqi > 0 && <circle cx={x} cy={y} r={14} fill={cfg.color} opacity={0.12} />}
                <circle cx={x} cy={y} r={isActive ? 9 : 6}
                  fill={initialized && aqi > 0 ? cfg.color : "#334155"}
                  stroke={isActive ? "#fff" : "transparent"} strokeWidth={2}
                  style={{ transition: "all 0.2s" }} />
              </g>
            );
          })}
        </svg>

        {popup && (() => {
          const { x, y } = project(popup.lat, popup.lng);
          const pctX = (x / W) * 100, pctY = (y / H) * 100;
          const flipX = pctX > 70, flipY = pctY > 60;
          return (
            <div style={{
              position: "absolute",
              left: flipX ? "auto" : `calc(${pctX}% + 16px)`,
              right: flipX ? `calc(${100 - pctX}% + 16px)` : "auto",
              top: flipY ? "auto" : `calc(${pctY}% + 8px)`,
              bottom: flipY ? `calc(${100 - pctY}% + 8px)` : "auto",
              background: "#1e293b", borderRadius: 14, padding: "14px 18px",
              border: `1px solid ${popup.cfg.color}50`, minWidth: 160,
              boxShadow: "0 8px 32px #00000080", zIndex: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>
                  <MapPin size={12} style={{ color: "#64748b" }} /> {popup.name}
                </div>
                <button onClick={() => setPopup(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 0 }}>
                  <X size={14} />
                </button>
              </div>
              {popup.aqi > 0 ? (
                <>
                  <div style={{ fontSize: 32, fontWeight: 800, color: popup.cfg.color, fontFamily: "monospace", lineHeight: 1 }}>{popup.aqi}</div>
                  <div style={{ fontSize: 11, color: popup.cfg.color, marginBottom: 12 }}>{popup.cfg.category}</div>
                  <button onClick={() => { onSelectCity(popup.name); setPopup(null); }}
                    style={{ width: "100%", background: "#2563eb", border: "none", color: "white", borderRadius: 8, padding: "8px 0", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    View Dashboard →
                  </button>
                </>
              ) : (
                <div style={{ color: "#475569", fontSize: 13 }}>No data available</div>
              )}
            </div>
          );
        })()}

        {!initialized && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1e80" }}>
            <div style={{ color: "#64748b", fontSize: 14 }}>Loading city data…</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Learn View ─────────────────────────────────────────────
function LearnView() {
  const [selected, setSelected] = useState("pm25");
  const pollutant = POLLUTANTS.find(p => p.id === selected);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* What is AQI */}
      <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, border: "1px solid #334155" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ background: "#1d4ed820", borderRadius: 10, padding: 8 }}><Info size={20} style={{ color: "#60a5fa" }} /></div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>What is AQI?</h2>
        </div>
        <p style={{ color: "#94a3b8", lineHeight: 1.7, fontSize: 14, marginBottom: 20 }}>
          The Air Quality Index (AQI) is a standardised scale developed by the EPA to communicate how clean or polluted the air is. It runs from 0 to 500 — the higher the number, the greater the health risk. Each pollutant is measured separately, and the highest individual score becomes the overall AQI.
        </p>
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

      {/* When is it safe */}
      <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, border: "1px solid #334155" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ background: "#16653420", borderRadius: 10, padding: 8 }}><Shield size={20} style={{ color: "#22c55e" }} /></div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>When is it safe?</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { range: "0–50",    color: "#22c55e", label: "Good",           advice: "Air quality is satisfactory. Outdoor activities are safe for everyone." },
            { range: "51–100",  color: "#eab308", label: "Moderate",       advice: "Acceptable quality. Unusually sensitive people should consider reducing prolonged outdoor exertion." },
            { range: "101–150", color: "#f97316", label: "Sensitive groups",advice: "Elderly, children, and people with asthma should limit prolonged outdoor exertion." },
            { range: "151–200", color: "#ef4444", label: "Unhealthy",      advice: "Everyone may experience health effects. Sensitive groups should avoid outdoor exertion." },
            { range: "201–300", color: "#a855f7", label: "Very Unhealthy", advice: "Health alert. Everyone may experience serious effects. Avoid prolonged outdoor activity." },
            { range: "301+",    color: "#be185d", label: "Hazardous",      advice: "Emergency conditions. The entire population is likely affected. Stay indoors with windows closed." },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "#0f172a", borderRadius: 12, padding: "12px 16px", borderLeft: `3px solid ${row.color}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: row.color, minWidth: 64, marginTop: 1, flexShrink: 0 }}>{row.range}</span>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{row.label} — </span>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>{row.advice}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pollutant guide */}
      <div style={{ background: "#1e293b", borderRadius: 20, padding: 28, border: "1px solid #334155" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ background: "#f9731620", borderRadius: 10, padding: 8 }}><Zap size={20} style={{ color: "#f97316" }} /></div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Pollutant Guide</h2>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
          {POLLUTANTS.map(p => (
            <button key={p.id} onClick={() => setSelected(p.id)} style={{
              background: selected === p.id ? "#2563eb" : "#0f172a",
              border: `1px solid ${selected === p.id ? "#3b82f6" : "#334155"}`,
              color: selected === p.id ? "white" : "#64748b",
              borderRadius: 10, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.15s",
            }}>
              {p.name}
            </button>
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
              <div style={{ background: "#0f172a", borderRadius: 12, padding: "14px 16px", borderLeft: "3px solid #ef4444" }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Health Impact</p>
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{pollutant.health}</p>
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                Concentration Levels ({pollutant.unit})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pollutant.levels.map((l, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f172a", borderRadius: 10, padding: "12px 16px", borderLeft: `3px solid ${l.color}` }}>
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

// ─── Root App ───────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("dashboard");
  const [selectedCity, setSelectedCity] = useState("Delhi");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleSelectCity = (city) => { setSelectedCity(city); setView("dashboard"); };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <Activity size={18} /> },
    { id: "trend",     label: "Trends",    icon: <BarChart2 size={18} /> },
    { id: "cities",    label: "Cities",    icon: <MapPin size={18} /> },
    { id: "map",       label: "World Map", icon: <Globe size={18} /> },
    { id: "learn",     label: "Learn",     icon: <BookOpen size={18} /> },
  ];

  const viewTitles = { dashboard: "Dashboard", trend: "Trends", cities: "Cities", map: "World Map", learn: "Learn" };

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
      `}</style>

      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 220 : 64, flexShrink: 0,
        background: "#0d1526", borderRight: "1px solid #1e293b",
        display: "flex", flexDirection: "column",
        transition: "width 0.25s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden", position: "sticky", top: 0, height: "100vh",
      }}>
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
              <button key={n.id} onClick={() => setView(n.id)} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 10px", borderRadius: 10, border: "none", cursor: "pointer",
                background: active ? "#1d4ed820" : "transparent",
                color: active ? "#60a5fa" : "#64748b",
                borderLeft: `2px solid ${active ? "#3b82f6" : "transparent"}`,
                transition: "all 0.15s", whiteSpace: "nowrap", width: "100%", textAlign: "left",
                fontSize: 14, fontWeight: active ? 600 : 400,
              }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.color = "#94a3b8"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748b"; } }}>
                <div style={{ flexShrink: 0 }}>{n.icon}</div>
                {sidebarOpen && <span>{n.label}</span>}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "10px 8px", borderTop: "1px solid #1e293b" }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 10px",
            borderRadius: 10, border: "none", cursor: "pointer", background: "transparent",
            color: "#475569", width: "100%", transition: "all 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.background = "#1e293b"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            {sidebarOpen && <span style={{ fontSize: 13 }}>Collapse</span>}
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto", minWidth: 0 }}>
        <div style={{ padding: "18px 32px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d1526", position: "sticky", top: 0, zIndex: 5 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>{viewTitles[view]}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#475569" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
            Live · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>

        <div style={{ flex: 1, padding: "28px 32px" }}>
          {view === "dashboard" && <DashboardView initialCity={selectedCity} key={selectedCity} onCityChange={setSelectedCity} />}
          {view === "trend"     && <TrendView defaultCity={selectedCity} />}
          {view === "cities"    && <CitiesView onSelectCity={handleSelectCity} />}
          {view === "map"       && <MapView onSelectCity={handleSelectCity} />}
          {view === "learn"     && <LearnView />}
        </div>
      </div>
    </div>
  );
}