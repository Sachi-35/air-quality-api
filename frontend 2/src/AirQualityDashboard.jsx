// ============================================================
// AirWatch — Air Quality Monitoring System Frontend
// Single-file React + Tailwind component
// API base URL is configurable below
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  Wind, MapPin, Activity, Search, ChevronRight,
  AlertTriangle, RefreshCw, BarChart2, Globe, Home, Clock,
} from "lucide-react";

// ─── Config ────────────────────────────────────────────────
const API_BASE = "http://localhost:8000";

// ─── AQI scale ─────────────────────────────────────────────
const AQI_CONFIG = {
  "Good":                          { min: 0,   max: 50,  color: "#22c55e", bg: "#052e16", text: "#86efac" },
  "Moderate":                      { min: 51,  max: 100, color: "#eab308", bg: "#1c1300", text: "#fde047" },
  "Unhealthy for Sensitive Groups":{ min: 101, max: 150, color: "#f97316", bg: "#1c0a00", text: "#fdba74" },
  "Unhealthy":                     { min: 151, max: 200, color: "#ef4444", bg: "#1c0505", text: "#fca5a5" },
  "Very Unhealthy":                { min: 201, max: 300, color: "#a855f7", bg: "#1a0533", text: "#d8b4fe" },
  "Hazardous":                     { min: 301, max: 500, color: "#9f1239", bg: "#1c0010", text: "#fda4af" },
};

function getAqiConfig(aqi) {
  for (const [cat, cfg] of Object.entries(AQI_CONFIG)) {
    if (aqi >= cfg.min && aqi <= cfg.max) return { ...cfg, category: cat };
  }
  return { color: "#94a3b8", bg: "#1e293b", text: "#94a3b8", category: "Unknown" };
}

// ─── AQI Gauge ─────────────────────────────────────────────
function AqiGauge({ aqi }) {
  const cfg = getAqiConfig(aqi);
  const pct = Math.min(aqi / 500, 1);
  const r = 80, cx = 100, cy = 100;
  const totalAngle = 280;
  const startAngle = 220;

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
  const fillPath = pct > 0.001
    ? `M ${s.x} ${s.y} A ${r} ${r} 0 ${lg2} 1 ${f.x} ${f.y}`
    : "";

  return (
    <div className="flex flex-col items-center">
      <svg width={200} height={160} viewBox="0 0 200 200">
        <path d={trackPath} fill="none" stroke="#1e293b" strokeWidth={14} strokeLinecap="round" />
        {fillPath && (
          <path
            d={fillPath} fill="none" stroke={cfg.color}
            strokeWidth={14} strokeLinecap="round" opacity={0.9}
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1)" }}
          />
        )}
        <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 38, fontWeight: 700, fill: cfg.color }}>{aqi}</text>
        <text x={cx} y={cy + 32} textAnchor="middle"
          style={{ fontSize: 11, fill: "#64748b", letterSpacing: "0.05em" }}>AQI</text>
      </svg>
      <div style={{
        padding: "6px 20px", borderRadius: "20px",
        background: cfg.bg, border: `1px solid ${cfg.color}40`,
        fontSize: 14, fontWeight: 600, color: cfg.color, marginTop: -20,
      }}>
        {cfg.category}
      </div>
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────
function Skeleton({ height = 48 }) {
  return (
    <div className="rounded-lg mb-2 animate-pulse bg-slate-800" style={{ height }} />
  );
}

// ─── Error card ─────────────────────────────────────────────
function ErrorCard({ message, onRetry }) {
  return (
    <div className="rounded-xl p-6 text-center mt-4"
      style={{ background: "#1c0505", border: "1px solid #7f1d1d" }}>
      <div className="flex justify-center mb-3 text-red-500">
        <AlertTriangle size={28} />
      </div>
      <p className="font-semibold text-red-300 mb-1">Unable to load data</p>
      <p className="text-slate-400 text-sm mb-4">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="flex items-center gap-2 mx-auto px-4 py-2 text-sm rounded-lg"
          style={{ background: "#7f1d1d", border: "1px solid #ef4444", color: "#fca5a5", cursor: "pointer" }}>
          <RefreshCw size={14} /> Try again
        </button>
      )}
    </div>
  );
}

// ─── Measurements table ─────────────────────────────────────
const PARAM_INFO = {
  pm25: { label: "PM 2.5", color: "#f97316" },
  pm10: { label: "PM 10",  color: "#eab308" },
  no2:  { label: "NO₂",   color: "#a855f7" },
  o3:   { label: "O₃",    color: "#22c55e" },
  so2:  { label: "SO₂",   color: "#ef4444" },
  co:   { label: "CO",    color: "#60a5fa" },
};

function MeasurementsTable({ measurements }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
        Sensor readings
      </p>
      <div className="flex flex-col gap-1.5">
        {measurements.map((m, i) => {
          const info = PARAM_INFO[m.parameter] || { label: m.parameter.toUpperCase(), color: "#94a3b8" };
          return (
            <div key={i} className="flex items-center justify-between rounded-lg px-3.5 py-2.5"
              style={{ background: "#1e293b", border: "1px solid #334155" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                <span className="text-sm text-slate-200">{info.label}</span>
              </div>
              <div className="text-right">
                <span className="text-base font-semibold" style={{ color: info.color }}>
                  {m.value.toFixed(1)}
                </span>
                <span className="text-xs text-slate-500 ml-1">{m.unit}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Badge ──────────────────────────────────────────────────
function InfoBadge({ label, value, icon }) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 flex-1 min-w-[120px]"
      style={{ background: "#1e293b", border: "1px solid #334155" }}>
      {icon && <div className="text-blue-400 flex-shrink-0">{icon}</div>}
      <div>
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-slate-100">{value}</p>
      </div>
    </div>
  );
}

// ─── Dashboard view ─────────────────────────────────────────
function DashboardView({ initialCity }) {
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
      setData(await res.json());
    } catch (e) {
      setError(e.message.includes("fetch") ? `Cannot reach API at ${API_BASE}` : e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAqi(city); }, [city, fetchAqi]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (input.trim()) setCity(input.trim());
  };

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-2.5 mb-6">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <Search size={16} />
          </div>
          <input
            type="text" placeholder="Search city..."
            value={input} onChange={(e) => setInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm"
            style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}
          />
        </div>
        <button type="submit" className="flex items-center gap-1.5 px-4 rounded-lg text-sm font-semibold text-white"
          style={{ background: "#1d4ed8", border: "none", cursor: "pointer" }}>
          <Search size={14} /> Search
        </button>
      </form>

      {loading && (
        <div>
          <Skeleton height={200} />
          <Skeleton height={52} />
          <Skeleton height={52} />
          <Skeleton height={52} />
        </div>
      )}
      {error && <ErrorCard message={error} onRetry={() => fetchAqi(city)} />}
      {data && (
        <div>
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-5">
            <MapPin size={13} /> {data.city}, {data.country}
          </div>
          <div className="flex justify-center mb-5">
            <AqiGauge aqi={data.aqi} />
          </div>
          <div className="flex gap-2 flex-wrap mb-4">
            <InfoBadge
              label="Dominant pollutant"
              value={(data.dominant_pollutant || "—").toUpperCase()}
              icon={<Wind size={15} />}
            />
            <InfoBadge
              label="Last updated"
              value={new Date(data.last_updated).toLocaleTimeString()}
              icon={<Clock size={15} />}
            />
          </div>
          {data.measurements?.length > 0 && (
            <MeasurementsTable measurements={data.measurements} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Trend view ─────────────────────────────────────────────
const PARAM_LABELS = { pm25: "PM 2.5", pm10: "PM 10", no2: "NO₂", o3: "O₃", so2: "SO₂", co: "CO" };

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrend(city, param); }, [city, param, fetchTrend]);

  const handleSearch = (e) => { e.preventDefault(); if (input.trim()) setCity(input.trim()); };

  const chartData = data?.trend?.map((t) => ({
    time: new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    aqi: t.aqi,
  })) || [];

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const cfg = getAqiConfig(payload[0].value);
    return (
      <div className="rounded-lg px-3.5 py-2.5"
        style={{ background: "#1e293b", border: "1px solid #334155" }}>
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="text-lg font-bold" style={{ color: cfg.color }}>{payload[0].value}</p>
        <p className="text-xs" style={{ color: cfg.color }}>{cfg.category}</p>
      </div>
    );
  };

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-2.5 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[130px]">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <Search size={16} />
          </div>
          <input
            type="text" placeholder="City..." value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm"
            style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}
          />
        </div>
        <select value={param} onChange={(e) => setParam(e.target.value)}
          className="rounded-lg px-3 py-2.5 text-sm min-w-[100px]"
          style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}>
          {Object.entries(PARAM_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit" className="px-4 rounded-lg text-sm font-semibold text-white"
          style={{ background: "#1d4ed8", border: "none", cursor: "pointer" }}>
          Go
        </button>
      </form>

      {loading && <Skeleton height={280} />}
      {error && <ErrorCard message={error} onRetry={() => fetchTrend(city, param)} />}
      {data && chartData.length > 0 && (
        <div>
          <div className="rounded-xl p-5 mb-3" style={{ background: "#1e293b", border: "1px solid #334155" }}>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-0.5">
              {data.city} — {PARAM_LABELS[param] || param} ({data.unit})
            </p>
            <p className="text-sm text-slate-400 mb-5">Last 24 readings</p>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={150} stroke="#f97316" strokeDasharray="4 4" opacity={0.5} />
                  <ReferenceLine y={100} stroke="#eab308" strokeDasharray="4 4" opacity={0.5} />
                  <Line type="monotone" dataKey="aqi" stroke="#60a5fa" strokeWidth={2}
                    dot={{ r: 3, fill: "#60a5fa", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#3b82f6" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap text-xs text-slate-500">
            {[{ label: "Moderate", color: "#eab308" }, { label: "USG", color: "#f97316" }, { label: "Unhealthy", color: "#ef4444" }].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div style={{ width: 20, borderTop: `2px dashed ${l.color}`, opacity: 0.6 }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cities view ────────────────────────────────────────────
function CitiesView({ onSelectCity }) {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/cities?limit=50`)
      .then((r) => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
      .then((data) => { setCities(data.cities || data || []); setLoading(false); })
      .catch((e) => {
        setError(e.message.includes("fetch") ? `Cannot reach API at ${API_BASE}` : e.message);
        setLoading(false);
      });
  }, []);

  const filtered = cities.filter((c) => {
    const name = (typeof c === "string" ? c : c.city || c.name || "").toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div>
      <div className="relative mb-4">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          <Search size={16} />
        </div>
        <input
          type="text" placeholder="Filter cities..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm"
          style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}
        />
      </div>

      {loading && [1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} height={52} />)}
      {error && <ErrorCard message={error} />}
      {!loading && !error && (
        <div className="flex flex-col gap-1.5">
          {filtered.length === 0 && (
            <p className="text-center text-slate-500 py-8">No cities found</p>
          )}
          {filtered.map((c, i) => {
            const name = typeof c === "string" ? c : c.city || c.name || "Unknown";
            const country = typeof c === "object" ? (c.country || "") : "";
            return (
              <button key={i} onClick={() => onSelectCity(name)}
                className="flex items-center justify-between rounded-xl px-3.5 py-3 text-left w-full transition-colors hover:bg-slate-700"
                style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", cursor: "pointer" }}>
                <div className="flex items-center gap-2.5">
                  <div className="text-blue-400"><MapPin size={14} /></div>
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    {country && <p className="text-xs text-slate-500">{country}</p>}
                  </div>
                </div>
                <div className="text-blue-400"><ChevronRight size={15} /></div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Root app ───────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("dashboard");
  const [selectedCity, setSelectedCity] = useState("Delhi");

  const handleSelectCity = (city) => {
    setSelectedCity(city);
    setView("dashboard");
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <Home size={16} /> },
    { id: "trend",     label: "Trends",    icon: <BarChart2 size={16} /> },
    { id: "cities",    label: "Cities",    icon: <Globe size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 max-w-lg mx-auto">
      {/* Nav bar */}
      <div className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 px-5 pt-4 pb-0">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center">
            <Activity size={18} className="text-white" />
          </div>
          <span className="font-bold text-lg">AirWatch</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Live
          </span>
        </div>
        <div className="flex">
          {navItems.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className="flex-1 flex flex-col items-center gap-1 pb-3 pt-2 text-xs font-medium transition-colors"
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                color: view === n.id ? "#60a5fa" : "#64748b",
                borderBottom: view === n.id ? "2px solid #60a5fa" : "2px solid transparent",
              }}>
              {n.icon} {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pt-5 pb-16">
        {view === "dashboard" && <DashboardView initialCity={selectedCity} key={selectedCity} />}
        {view === "trend"     && <TrendView defaultCity={selectedCity} />}
        {view === "cities"    && <CitiesView onSelectCity={handleSelectCity} />}
      </div>
    </div>
  );
}