import { useState, useEffect, useRef } from "react";
import SP_LOGO from "./assets/sp-logo.svg";
import FAIRPRICE_LOGO from "./assets/fairprice-logo.png";
import GRABFOOD_LOGO from "./assets/grabfood-logo.png";
import KOPITIAM_LOGO from "./assets/kopitiam-logo.png";

const COLORS = {
  bg: "#f8fafc",
  card: "#ffffff",
  cardBorder: "#dbe3f0",
  accent: "#00bfa5",
  accentSoft: "#00bfa522",
  peak: "#f97316",
  peakSoft: "#f9731622",
  spike: "#ef4444",
  spikeSoft: "#ef444422",
  normal: "#2563eb",
  normalSoft: "#2563eb22",
  gold: "#f59e0b",
  text: "#0f172a",
  textMuted: "#64748b",
  textSub: "#475569",
  green: "#16a34a",
  greenSoft: "#16a34a22",
  purple: "#7c3aed",
};

const halfHourlyData = [
  0.02, 0.01, 0.01, 0.01, 0.02, 0.02, 0.05, 0.12, 0.18, 0.15, 0.10, 0.09,
  0.11, 0.10, 0.09, 0.08, 0.10, 0.09, 0.12, 0.15, 0.38, 0.72, 0.95, 1.10,
  1.25, 1.30, 0.98, 0.75, 0.62, 0.48, 0.35, 0.20, 0.14, 0.10, 0.08, 0.05,
  0.04, 0.03, 0.03, 0.02, 0.02, 0.02, 0.02, 0.01, 0.01, 0.01, 0.02, 0.02,
];

const labels = halfHourlyData.map((_, i) => {
  const totalMins = i * 30;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
});

const PEAK_START = 20;
const PEAK_END = 28;
const SPIKE_INDICES = [21, 22, 23, 24, 25];
const avg = halfHourlyData.reduce((a, b) => a + b) / halfHourlyData.length;

// Pricing models (SGD per kWh, based on SP Group indicative rates)
const PRICING = {
  flat: { rate: 0.3256, label: "Flat Rate", desc: "Same price all day" },
  tou: {
    peak: 0.4100,      // 7am–11pm weekdays
    offPeak: 0.1890,   // 11pm–7am & weekends
    label: "Time-of-Use",
    desc: "Peak 7am–11pm · Off-peak 11pm–7am",
  },
};

// Which slots are peak for TOU (7am=slot14 to 11pm=slot46)
function isTouPeak(slotIndex) {
  return slotIndex >= 14 && slotIndex <= 45;
}

// Avg SG household half-hourly profile (~400 kWh/month, typical 4-room HDB)
const sgAvgData = [
  0.03, 0.02, 0.02, 0.02, 0.02, 0.03, 0.08, 0.16, 0.20, 0.17, 0.14, 0.13,
  0.14, 0.13, 0.12, 0.12, 0.13, 0.14, 0.17, 0.20, 0.32, 0.48, 0.58, 0.62,
  0.65, 0.63, 0.55, 0.46, 0.38, 0.30, 0.22, 0.16, 0.12, 0.09, 0.07, 0.05,
  0.04, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.02, 0.02, 0.02, 0.03, 0.03,
];

function getBarColor(i) {
  if (SPIKE_INDICES.includes(i)) return COLORS.spike;
  if (i >= PEAK_START && i <= PEAK_END) return COLORS.peak;
  return COLORS.normal;
}

const weeklyProgress = [
  { day: "Mon", saved: 0.8, shifted: 0.4 },
  { day: "Tue", saved: 1.1, shifted: 0.7 },
  { day: "Wed", saved: 0.6, shifted: 0.3 },
  { day: "Thu", saved: 1.4, shifted: 0.9 },
  { day: "Fri", saved: 1.2, shifted: 0.8 },
  { day: "Sat", saved: 0.9, shifted: 0.5 },
  { day: "Sun", saved: 1.6, shifted: 1.1 },
];

const INITIAL_GOALS = [
  { id: 1, text: "Shift laundry out of peak hours", points: 50, done: true, streak: 5 },
  { id: 2, text: "Reduce overnight AC to 26°C", points: 30, done: true, streak: 5 },
  { id: 3, text: "Pre-cool home before 6pm", points: 40, done: false, streak: 0 },
  { id: 4, text: "Run dishwasher after 10pm", points: 25, done: false, streak: 0 },
];

const leaderboard = [
  { block: "Blk 412 (You)", saved: 184, rank: 1, trend: "up" },
  { block: "Blk 308", saved: 171, rank: 2, trend: "up" },
  { block: "Blk 419", saved: 163, rank: 3, trend: "down" },
  { block: "Blk 215", saved: 155, rank: 4, trend: "same" },
  { block: "Blk 507", saved: 148, rank: 5, trend: "down" },
];

// ─── Forest Plot Component ────────────────────────────────────────────────────
//
// REAL DATA SOURCES (all publicly available, SP can cite these):
//
// 1. EMA Grid Emission Factor 2024: 0.402 kgCO₂/kWh
//    Source: EMA Singapore Energy Statistics 2024, Chapter 2
//    https://www.ema.gov.sg/resources/singapore-energy-statistics/chapter2
//
// 2. Avg SG household: ~600 kWh/month (7,200 kWh/yr)
//    Source: EMA / Sunollo citing EMA data
//    Baseline comparison: user's 42 kWh saved vs 600 kWh avg monthly = 7% reduction
//
// 3. Singapore GreenPlan 2030 – OneMillionTrees target:
//    1,000,000 trees → sequester 78,000 tonnes CO₂ total
//    = 0.078 kgCO₂ sequestered per tree per year
//    Source: Singapore Green Plan 2030, greenplan.gov.sg/vision
//
// 4. Progress as of early 2025: ~700,000 trees planted (NParks)
//    Source: NParks press release, nparks.gov.sg
//
// MATH:
//   User saved 42 kWh this month
//   CO₂ offset = 42 × 0.402 = 16.88 kgCO₂
//   Trees equivalent = 16.88 / (0.078 / 12) = 16.88 / 0.0065 = ~2,597 tree-months
//   But we show it as equivalent tree-years of CO₂ absorbed:
//   16.88 kg / 0.078 kgCO₂/tree/yr × (1/12 months) → annual rate = 16.88 × 12 / 0.078 = 2,600 tree-years/yr
//   More intuitively: 16.88 kg ÷ 0.078 = 216 trees absorb this in 1 year
//   OR: 1 tree absorbs this in 216 years — not intuitive
//   BETTER FRAMING: "equivalent to planting N trees that absorb CO₂ for a month"
//   16.88 kgCO₂ / (0.078/12) kgCO₂/tree/month = 16.88 / 0.0065 ≈ 2,597 tree-months
//   = equivalent of 2,597 trees absorbing CO₂ for 1 month — too big a number
//
//   SIMPLEST honest framing: your monthly saving offsets the same CO₂ that
//   1 tree sequesters over (16.88 / 0.0065) months... still complex.
//
//   FINAL APPROACH used in UI:
//   Plot = district share of 1M tree goal = 1,000,000 / 28 districts = ~35,714 trees per district
//   Grid shows 200 cells = each cell = 35,714/200 = ~179 trees
//   Your contribution (42 kWh → 16.88 kgCO₂) fills:
//     cells_you = 42 × 0.402 / (78000 / 1000000 × 35714 / 200) ... 
//   
//   SIMPLER: just show scaled cells honestly labelled.
//   District target = 35,714 trees. Grid = 200 cells. Each cell = ~179 trees.
//   You (1 month): 16.88 kgCO₂ / (78000/1000000 kgCO₂/tree/yr × 1/12) = ~31 tree-months → 0.17 cells
//   You (1 year): 16.88×12 / (78000/1000000) = 2,597 tree-years → 1 cell (show as 1)
//   You (year, honest): saves 42×12=504 kWh/yr → 202.6 kgCO₂/yr → 202.6/0.078 = 2,598 tree-equivalent → ~14.5 cells
//   District (28,000 HH × 42 kWh saved = 1,176,000 kWh → 472,752 kgCO₂ → 472752/0.078 = 6,061,564 tree-equiv/yr)
//   That far exceeds the goal — scale down: show per-month district contribution
//   District 1 month: 28,000 × 16.88 = 472,640 kgCO₂ → /0.078 × (1/12 yr) = 505,000 tree-months
//   As cells: 505,000 / 179 ≈ 2,820 cells — way more than 200. Cap at 200 (full plot).
//
//   FINAL NUMBERS USED:
//   Grid = 200 cells. Each cell = ~179 trees (of the 35,714 district target).
//   you_month  = 1 cell  (honest: 0.17, rounded up to show something — labelled as ~31 tree-equivalent)
//   you_year   = 14 cells (honest: 14.5 → ~2,500 tree-equivalent offset)  
//   district   = 200 cells (full plot — district collective fills the whole thing in 1 month)
//   Baseline comparison: avg SG household saves 0 kWh extra → 0 cells

const COLS = 20;
const ROWS = 10;
const TOTAL_CELLS = COLS * ROWS; // 200 cells, each = ~179 trees of district 35,714 target

// Cells filled per view (calculated from real data above)
const VIEW_DATA = {
  you_month: {
    cells: 1,
    treesEquiv: 31,         // tree-month equivalents
    co2kg: 16.9,            // 42 kWh × 0.402
    label: "You · This Month",
    color: "#22c55e",       // bright green
    desc: "42 kWh saved → 16.9 kg CO₂ offset",
    sub: "= 31 tree-months of carbon absorption",
    baseline: "Avg SG household this month: 0 kg offset (no action taken)",
  },
  you_year: {
    cells: 14,
    treesEquiv: 2597,
    co2kg: 202.6,           // 504 kWh × 0.402
    label: "You · Full Year",
    color: "#16a34a",       // medium green
    desc: "504 kWh saved/yr → 202.6 kg CO₂ offset",
    sub: "= 2,597 tree-equivalent absorption per year",
    baseline: "SG avg household uses 7,200 kWh/yr (no savings assumed)",
  },
  district: {
    cells: 200,             // fills entire plot
    treesEquiv: 505000,
    co2kg: 472640,
    label: "Toa Payoh · 1 Month",
    color: "#15803d",       // dark green
    desc: "28,000 households × 42 kWh = 1.18M kWh saved",
    sub: "→ fills the entire district plot in just 1 month",
    baseline: "District baseline (no action): 28,000 × 600 kWh = 16.8M kWh/month consumed",
  },
};

// SVG Tree components — 3 realistic variants by contribution level
function TreeSVG({ variant, size }) {
  if (variant === "bare") {
    // Bare plot — cracked dry soil mound, no tree
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
        <ellipse cx="12" cy="20" rx="9" ry="3.5" fill="#a16207" />
        <ellipse cx="12" cy="19" rx="7" ry="2.5" fill="#92400e" />
        {/* Crack lines */}
        <line x1="10" y1="18" x2="9" y2="20" stroke="#78350f" strokeWidth="0.5" opacity="0.7"/>
        <line x1="13" y1="17" x2="15" y2="20" stroke="#78350f" strokeWidth="0.5" opacity="0.7"/>
        <line x1="11" y1="18" x2="12" y2="21" stroke="#78350f" strokeWidth="0.4" opacity="0.5"/>
      </svg>
    );
  }
  if (variant === "you") {
    // Bright vivid tropical tree — tall layered canopy, glowing
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
        {/* Shadow */}
        <ellipse cx="12" cy="22" rx="5" ry="1.5" fill="#000" opacity="0.25" />
        {/* Trunk */}
        <rect x="10.5" y="14" width="3" height="7" rx="1.2" fill="#7c4a1a" />
        <rect x="11" y="14" width="1.5" height="7" rx="0.8" fill="#a0621e" opacity="0.5" />
        {/* Root flare */}
        <ellipse cx="12" cy="21" rx="4.5" ry="1.2" fill="#5a3510" opacity="0.6"/>
        {/* Bottom canopy layer */}
        <ellipse cx="12" cy="14" rx="7" ry="3.5" fill="#15803d" />
        {/* Mid canopy */}
        <ellipse cx="12" cy="10.5" rx="5.5" ry="3" fill="#16a34a" />
        {/* Top canopy */}
        <ellipse cx="12" cy="7.5" rx="3.5" ry="2.5" fill="#22c55e" />
        {/* Highlight */}
        <ellipse cx="10.5" cy="6.5" rx="1.5" ry="1" fill="#86efac" opacity="0.5" />
        {/* Glow dot */}
        <circle cx="12" cy="5" r="1.2" fill="#bbf7d0" opacity="0.7" />
      </svg>
    );
  }
  if (variant === "year") {
    // Mature medium tree
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
        <ellipse cx="12" cy="22" rx="4.5" ry="1.2" fill="#000" opacity="0.2" />
        <rect x="10.5" y="15" width="3" height="6.5" rx="1" fill="#6b3d14" />
        <rect x="11" y="15" width="1.5" height="6.5" rx="0.8" fill="#8b5a1e" opacity="0.4" />
        <ellipse cx="12" cy="15" rx="6.5" ry="3" fill="#166534" />
        <ellipse cx="12" cy="11.5" rx="5" ry="2.8" fill="#15803d" />
        <ellipse cx="12" cy="8.5" rx="3.5" ry="2.5" fill="#16a34a" />
        <ellipse cx="11" cy="7.5" rx="1.2" ry="0.8" fill="#4ade80" opacity="0.4" />
      </svg>
    );
  }
  if (variant === "district") {
    // Dense dark forest tree — part of a collective canopy
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
        <ellipse cx="12" cy="22" rx="4" ry="1.2" fill="#000" opacity="0.18" />
        <rect x="10.5" y="15" width="3" height="6.5" rx="1" fill="#5a3310" />
        <ellipse cx="12" cy="15" rx="6" ry="3" fill="#14532d" />
        <ellipse cx="12" cy="11.5" rx="5" ry="2.8" fill="#166534" />
        <ellipse cx="12" cy="8.5" rx="3.5" ry="2.3" fill="#15803d" />
      </svg>
    );
  }
  return null;
}

function ForestPlot() {
  const [view, setView] = useState("you_month");
  const [animated, setAnimated] = useState(false);
  const [prevView, setPrevView] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 300);
    return () => clearTimeout(t);
  }, []);

  const changeView = (v) => { setPrevView(view); setView(v); };

  const data = VIEW_DATA[view];
  const filledCells = animated ? Math.min(data.cells, TOTAL_CELLS) : 0;

  // Assign tree type per cell
  const getVariant = (idx) => {
    if (idx >= filledCells) return "bare";
    if (view === "you_month") return "you";
    if (view === "you_year") return idx === 0 ? "you" : "year";
    return "district";
  };

  // Stagger delay — faster for district (all fill at once)
  const getDelay = (idx) => {
    if (view === "district") return `${Math.min(idx * 4, 400)}ms`;
    return `${Math.min(idx * 40, 1200)}ms`;
  };

  const pctOfGoal = ((data.cells / TOTAL_CELLS) * 100).toFixed(0);

  // NParks real progress: 700,000 of 1,000,000 = 70%
  const nationalPct = 70;

  return (
    <div style={{ marginTop: 16, borderRadius: 14, overflow: "hidden", border: "1px solid #86efac", background: "#f0fdf4" }}>

      {/* Header */}
      <div style={{ padding: "12px 14px 10px", background: "linear-gradient(135deg, #bbf7d0, #86efac)", borderBottom: "1px solid #86efac" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, color: COLORS.green, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
              NParks OneMillionTrees · SGGreenPlan2030
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.text, marginTop: 2 }}>
              Toa Payoh's Share of the National Forest
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
            <div style={{ fontSize: 9, color: COLORS.textMuted }}>National progress</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: COLORS.green }}>70%</div>
            <div style={{ fontSize: 9, color: COLORS.textMuted }}>700K / 1M trees</div>
          </div>
        </div>

        {/* National progress bar */}
        <div style={{ marginTop: 8 }}>
          <div style={{ background: "#d1fae5", borderRadius: 99, height: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${nationalPct}%`, background: "linear-gradient(90deg, #15803d, #22c55e)", borderRadius: 99, boxShadow: "0 0 6px #22c55e66" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
            <span style={{ fontSize: 8.5, color: COLORS.textMuted }}>Started 2020</span>
            <span style={{ fontSize: 8.5, color: COLORS.green, fontWeight: 600 }}>On track for 2027</span>
            <span style={{ fontSize: 8.5, color: COLORS.textMuted }}>Goal: 2030</span>
          </div>
        </div>

        <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.5 }}>
          Each cell = ~179 trees · Full plot = Toa Payoh's 35,714-tree target
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 3, padding: "10px 10px 0" }}>
        {[
          { key: "you_month", label: "You · Month", color: "#22c55e" },
          { key: "you_year",  label: "You · Year",  color: "#16a34a" },
          { key: "district",  label: "District",    color: "#15803d" },
        ].map(btn => (
          <button key={btn.key} onClick={() => changeView(btn.key)} style={{
            flex: 1, padding: "6px 2px", fontSize: 10,
            fontWeight: view === btn.key ? 800 : 500,
            borderRadius: 8,
            border: `1.5px solid ${view === btn.key ? btn.color : "#d1fae5"}`,
            background: view === btn.key ? btn.color + "22" : "transparent",
            color: view === btn.key ? btn.color : COLORS.textMuted,
            cursor: "pointer", transition: "all 0.2s",
          }}>{btn.label}</button>
        ))}
      </div>

      {/* THE FOREST PLOT */}
      <div style={{ padding: "8px 8px 4px" }}>
        <div style={{
          background: "linear-gradient(180deg, #d1fae5 0%, #bbf7d0 40%, #86efac 100%)",
          borderRadius: 10,
          padding: "8px 4px 0",
          border: "1px solid #86efac",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Misty sky atmosphere */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 16, background: "linear-gradient(180deg, #bbf7d088 0%, transparent 100%)", zIndex: 1, pointerEvents: "none" }} />

          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: "1px",
            position: "relative", zIndex: 2,
          }}>
            {Array.from({ length: TOTAL_CELLS }, (_, i) => {
              const variant = getVariant(i);
              const isFilled = i < filledCells;
              return (
                <div key={`${view}-${i}`} style={{
                  display: "flex", justifyContent: "center", alignItems: "flex-end",
                  opacity: animated ? 1 : 0,
                  transform: animated && isFilled ? "translateY(0) scale(1)" : "translateY(4px) scale(0.8)",
                  transition: `opacity 0.35s ease ${getDelay(i)}, transform 0.4s cubic-bezier(0.34,1.4,0.64,1) ${getDelay(i)}`,
                }}>
                  <TreeSVG variant={variant} size={18} />
                </div>
              );
            })}
          </div>

          {/* Ground */}
          <div style={{ height: 10, background: "linear-gradient(180deg, #86efac 0%, #4ade80 100%)", marginTop: 1 }} />
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 10, padding: "6px 12px 4px", flexWrap: "wrap" }}>
        {[
          ...(view === "you_month" ? [{ v: "you", label: "Your trees (this month)", c: "#22c55e" }] : []),
          ...(view === "you_year" ? [
            { v: "you", label: "Month 1 (you)", c: "#22c55e" },
            { v: "year", label: "Months 2–12 (you)", c: "#16a34a" },
          ] : []),
          ...(view === "district" ? [{ v: "district", label: "District collective", c: "#15803d" }] : []),
          { v: "bare", label: "Bare plot (not yet planted)", c: "#4a3520" },
        ].map(l => (
          <div key={l.v} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, color: COLORS.textMuted }}>
            <TreeSVG variant={l.v} size={13} />
            <span style={{ color: l.c }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Stats card */}
      <div style={{ margin: "4px 8px 8px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "12px 12px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: data.color, fontWeight: 700 }}>{data.label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginTop: 2 }}>{data.desc}</div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{data.sub}</div>
          </div>
          <div style={{ textAlign: "right", marginLeft: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: COLORS.textMuted }}>Plot filled</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: data.color, lineHeight: 1 }}>
              {view === "district" ? "100" : pctOfGoal}<span style={{ fontSize: 12 }}>%</span>
            </div>
            <div style={{ fontSize: 9, color: COLORS.textMuted }}>of district target</div>
          </div>
        </div>

        {/* Comparison vs baseline */}
        <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px 10px", borderLeft: "3px solid #facc15" }}>
          <div style={{ fontSize: 9, color: "#facc15", fontWeight: 700, marginBottom: 3, textTransform: "uppercase", letterSpacing: 1 }}>
            vs Baseline · EMA 2024
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.6 }}>{data.baseline}</div>
          <div style={{ fontSize: 10, color: COLORS.text, marginTop: 4, fontWeight: 600 }}>
            {view === "you_month" && `Your saving = ${((42 / 600) * 100).toFixed(0)}% reduction vs avg SG household's monthly 600 kWh`}
            {view === "you_year" && `Your annual saving = ${((504 / 7200) * 100).toFixed(0)}% below SG avg of 7,200 kWh/yr (EMA)`}
            {view === "district" && `District saving = 1.18M kWh vs 16.8M kWh baseline — a 7% collective reduction`}
          </div>
        </div>

        {/* Mini fill bar */}
        <div style={{ marginTop: 8, background: "#d1fae5", borderRadius: 99, height: 5, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: view === "district" ? "100%" : `${(data.cells / TOTAL_CELLS) * 100}%`,
            background: `linear-gradient(90deg, ${data.color}, #86efac)`,
            borderRadius: 99,
            transition: "width 1.2s ease 0.3s",
            boxShadow: `0 0 8px ${data.color}88`,
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
          <span style={{ fontSize: 9, color: COLORS.textMuted }}>0 trees</span>
          <span style={{ fontSize: 9, color: COLORS.textMuted }}>35,714 trees (Toa Payoh target)</span>
        </div>
      </div>

      {/* Data source footnote */}
      <div style={{ padding: "0 12px 10px", borderTop: "1px solid #86efac" }}>
        <div style={{ fontSize: 8.5, color: COLORS.textMuted, lineHeight: 1.6, marginTop: 8 }}>
          <span style={{ color: COLORS.green, fontWeight: 700 }}>Data sources: </span>
          EMA Grid Emission Factor 0.402 kgCO₂/kWh (Singapore Energy Statistics 2024) ·
          NParks OneMillionTrees = 78,000 tCO₂ sequestered (Green Plan 2030) ·
          Avg household 600 kWh/month (EMA) ·
          Toa Payoh: ~28,000 households (SingStat)
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("usage");
  const [pricingModel, setPricingModel] = useState("flat"); // "flat" | "tou"
  const [showAI, setShowAI] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [habitCoachText, setHabitCoachText] = useState("");
  const [habitCoachLoading, setHabitCoachLoading] = useState(false);
  const [habitCoachLoaded, setHabitCoachLoaded] = useState(false);
  const [aiTasks, setAiTasks] = useState([]);
  const [aiTasksLoading, setAiTasksLoading] = useState(false);
  const [aiTasksDone, setAiTasksDone] = useState({});
  const [openInsights, setOpenInsights] = useState({});
  const [redeemedVouchers, setRedeemedVouchers] = useState({});
  const [spentPts, setSpentPts] = useState(0);
  const [mysteryDrop, setMysteryDrop] = useState(null);
  const [gridStrainClaimed, setGridStrainClaimed] = useState(false);
  const [gridStrainVisible, setGridStrainVisible] = useState(true);
  const [gridStrainDay, setGridStrainDay] = useState(7); // 1–7, day 7 = can claim
  const [totalSaved, setTotalSaved] = useState(12.40);
  const [streak, setStreak] = useState(5);
  const [streakBroken, setStreakBroken] = useState(false);
  const [streakProtectionAccepted, setStreakProtectionAccepted] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const [goals, setGoals] = useState(INITIAL_GOALS);
  const [impactPeriod, setImpactPeriod] = useState("month");
  const [hoveredBar, setHoveredBar] = useState(null); // { index, val }

  const toggleGoal = (id) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, done: !g.done } : g));
  };
  const [treeCount, setTreeCount] = useState(3);
  const [animBar, setAnimBar] = useState(false);

  useEffect(() => {
    setTimeout(() => setAnimBar(true), 300);
  }, []);

  const typeAI = async () => {
    setShowAI(true);
    setAiText("");
    setAiLoading(true);
    try {
      const usageSummary = halfHourlyData.map((v, i) => {
        const h = Math.floor(i / 2);
        const m = i % 2 === 0 ? "00" : "30";
        return `${h}:${m} = ${v.toFixed(2)} kWh`;
      }).join(", ");

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.REACT_APP_GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `You are an energy analyst for SP Group Singapore. Analyse half-hourly smart meter data for a residential HDB flat at 2 Nasim Road. Focus on: (1) which appliances were likely left on overnight based on the baseline load, (2) which appliances were likely used simultaneously during the evening peak causing spikes, (3) which appliances generate the most electricity in this profile. For each, give one specific way to reduce consumption and one way to shift usage away from peak. Be specific to Singapore HDB context. Plain text only, no markdown. 4–5 sentences.\n\nHalf-hourly data (kWh per slot): ${usageSummary}` }] }],
            generationConfig: { maxOutputTokens: 300 },
          }),
        }
      );
      const data = await res.json();
      if (res.status === 429) throw new Error("rate_limit");
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to generate analysis.";
      setAiLoading(false);
      let i = 0;
      const interval = setInterval(() => {
        setAiText(text.slice(0, i));
        i++;
        if (i > text.length) clearInterval(interval);
      }, 18);
    } catch (e) {
      setAiLoading(false);
      const fallback = "Your overnight baseline of ~0.02 kWh suggests a refrigerator and router were left running — both normal, but check for other idle devices. The sharp 7–9pm spike to 1.30 kWh points to AC and cooking appliances running simultaneously; staggering these by even 30 minutes would cut your peak reading significantly. Your AC is likely your single biggest consumer — raising the setpoint from 23°C to 26°C alone could save 0.3–0.5 kWh per evening. Try pre-cooling before 6pm and turning the water heater off outside shower times to reduce both overall usage and peak load.";
      let i = 0;
      const interval = setInterval(() => {
        setAiText(fallback.slice(0, i));
        i++;
        if (i > fallback.length) clearInterval(interval);
      }, 18);
    }
  };

  const loadHabitCoach = async () => {
    setHabitCoachLoading(true);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.REACT_APP_GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `You are a friendly energy coach for SP Group Singapore. You help HDB residents both REDUCE overall electricity use and SHIFT usage away from peak hours. Be encouraging, specific, and brief. Plain text only, no markdown, 2–3 sentences.\n\nThe resident at 2 Nasim Road HDB has a ${streak}-day streak. They have reduced 0.5 kWh and shifted 0.8 kWh out of peak daily, saving ~$0.25/day. Their main peak is 7–9pm from AC and cooking overlap. Give a motivational message covering both reducing overall usage and shifting peak load, and one tip to reach 7 days for the 2× multiplier.` }] }],
            generationConfig: { maxOutputTokens: 200 },
          }),
        }
      );
      const data = await res.json();
      if (res.status === 429) throw new Error("rate_limit");
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Keep going — you're doing great!";
      setHabitCoachText(text);
      setHabitCoachLoaded(true);
    } catch (e) {
      setHabitCoachText(`Amazing — ${streak} days in a row! You've cut 0.5 kWh of overall usage and shifted 0.8 kWh out of peak daily — saving ~$0.25/day. Hold 2 more days to unlock your 2× streak multiplier.`);
      setHabitCoachLoaded(true);
    }
    setHabitCoachLoading(false);
  };

  useEffect(() => {
    if (tab === "actions" && !streakBroken && !habitCoachLoaded) {
      loadHabitCoach();
    }
  }, [tab, streakBroken]);

  useEffect(() => {
    loadAiTasks();
  }, []);

  const loadAiTasks = async () => {
    setAiTasksLoading(true);
    const completedGoals = goals.filter(g => g.done).map(g => g.text).join(", ");
    const pendingGoals = goals.filter(g => !g.done).map(g => g.text).join(", ");
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.REACT_APP_GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `You are an energy saving coach for SP Group Singapore. A resident at 2 Nasim Road HDB has a ${streak}-day streak. Their evening peak is 7–9pm. They are on the ${pricingModel === "tou" ? `Time-of-Use plan (peak $${PRICING.tou.peak}/kWh 7am–11pm, off-peak $${PRICING.tou.offPeak}/kWh 11pm–7am)` : `Flat Rate plan ($${PRICING.flat.rate}/kWh all day)`}.\n\nThey have already completed: ${completedGoals || "none"}.\nThey still have pending: ${pendingGoals || "none"}.\n\nSuggest exactly 3 tasks — mix of both SHIFTING usage to off-peak hours AND REDUCING overall electricity consumption. Make them specific to an HDB flat in Singapore. Each task should be achievable today. Return ONLY a JSON array, no markdown, no explanation:\n[{"task":"task text","points":25,"kwh":"0.3 kWh","type":"shift"},{"task":"task text","points":15,"kwh":"0.1 kWh","type":"reduce"},{"task":"task text","points":20,"kwh":"0.2 kWh","type":"shift"}]` }] }],
            generationConfig: { maxOutputTokens: 300 },
          }),
        }
      );
      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setAiTasks(parsed);
    } catch (e) {
      const fallbackPool = [
        { task: "Run washing machine after 11pm (off-peak rate $0.189/kWh)", points: 30, kwh: "0.5 kWh", type: "shift" },
        { task: "Pre-cool flat to 25°C before 7pm, raise to 27°C at peak", points: 25, kwh: "0.4 kWh", type: "shift" },
        { task: "Delay dishwasher until after 11pm to avoid peak charges", points: 20, kwh: "0.3 kWh", type: "shift" },
        { task: "Turn off all standby appliances at the wall — TVs, chargers, routers", points: 15, kwh: "0.15 kWh", type: "reduce" },
        { task: "Switch off water heater when not in use — only heat before shower", points: 25, kwh: "0.3 kWh", type: "reduce" },
        { task: "Set AC to 26°C instead of 23°C — each degree saves ~10% cooling energy", points: 30, kwh: "0.5 kWh", type: "reduce" },
        { task: "Use natural ventilation instead of AC between 6–7pm", points: 20, kwh: "0.35 kWh", type: "reduce" },
        { task: "Dry clothes on rack overnight instead of tumble dryer", points: 30, kwh: "0.6 kWh", type: "reduce" },
        { task: "Use microwave instead of oven for reheating — 5× more efficient", points: 20, kwh: "0.25 kWh", type: "reduce" },
        { task: "Charge devices and laptop before 7pm, unplug when full", points: 15, kwh: "0.1 kWh", type: "shift" },
        { task: "Replace remaining incandescent bulbs with LEDs — 75% less energy", points: 20, kwh: "0.2 kWh", type: "reduce" },
        { task: "Batch-cook dinner before 6:30pm to avoid oven overlap at peak", points: 25, kwh: "0.3 kWh", type: "shift" },
      ];
      const shuffled = fallbackPool.sort(() => Math.random() - 0.5).slice(0, 3);
      setAiTasks(shuffled);
    }
    setAiTasksLoading(false);
  };

  const triggerMystery = () => {
    const prizes = [
      { label: "Jackpot! $5.00 rebate", value: 5 },
      { label: "$0.30 bill credit", value: 0.3 },
      { label: "$0.80 rebate", value: 0.8 },
      { label: "$0.15 bonus", value: 0.15 },
      { label: "$0.15 bonus", value: 0.15 },
      { label: "$1.20 rebate", value: 1.2 },
      { label: "$0.20 bonus", value: 0.2 },
    ];
    const prize = prizes[Math.floor(Math.random() * prizes.length)];
    setMysteryDrop(prize);
    setGridStrainClaimed(true);
    setTotalSaved(prev => +(prev + prize.value).toFixed(2));
    setTimeout(() => setMysteryDrop(null), 3500);
  };

  const maxBar = Math.max(...halfHourlyData);

  const tabs = [
    { id: "usage", label: "Energy" },
    { id: "actions", label: "Actions" },
    { id: "impact", label: "Impact" },
    { id: "community", label: "Community" },
    { id: "rewards", label: "Rewards" },
  ];

  // Derived points from gridStrainDay (streak) for rewards tab
  const currentStreak = streakBroken ? 0 : gridStrainDay;
  const streakMultiplier = currentStreak >= 7 ? 2.0 : currentStreak >= 5 ? 1.5 : currentStreak >= 3 ? 1.2 : 1.0;
  const todayTaskPts = aiTasks.filter(t => aiTasksDone[t.task]).reduce((s, t) => s + t.points, 0);
  const peakShiftPts = Math.round(187 * (gridStrainDay / 7));
  const streakBonusPts = Math.round(currentStreak * 50);
  const gridStrainBonusPts = gridStrainDay === 7 && gridStrainClaimed ? 200 : 0;
  const totalPts = Math.max(0, 420 + peakShiftPts + streakBonusPts + todayTaskPts + gridStrainBonusPts - spentPts);

  const VOUCHERS = [
    {
      id: "fp10",
      brand: "FairPrice",
      value: "$10",
      pts: 500,
      color: "#e8203a",
      bg: "#fff1f2",
      border: "#e8203a55",
      desc: "FairPrice supermarket voucher",
      logo: FAIRPRICE_LOGO,
    },
    {
      id: "fp20",
      brand: "FairPrice",
      value: "$20",
      pts: 950,
      color: "#e8203a",
      bg: "#fff1f2",
      border: "#e8203a55",
      desc: "FairPrice supermarket voucher",
      logo: FAIRPRICE_LOGO,
    },
    {
      id: "sp5",
      brand: "SP Utility",
      value: "$5 Bill Rebate",
      pts: 300,
      color: COLORS.accent,
      bg: "#f0fdf4",
      border: COLORS.accent + "55",
      desc: "Credited to your SP account",
      logo: SP_LOGO,
    },
    {
      id: "sp15",
      brand: "SP Utility",
      value: "$15 Bill Rebate",
      pts: 800,
      color: COLORS.accent,
      bg: "#f0fdf4",
      border: COLORS.accent + "55",
      desc: "Credited to your SP account",
      logo: SP_LOGO,
    },
    {
      id: "grab5",
      brand: "GrabFood",
      value: "$5",
      pts: 400,
      color: "#00B14F",
      bg: "#f0fdf4",
      border: "#00B14F55",
      desc: "GrabFood delivery voucher",
      logo: GRABFOOD_LOGO,
    },
    {
      id: "ntuc5",
      brand: "Kopitiam",
      value: "$5",
      pts: 350,
      color: "#f59e0b",
      bg: "#fffbeb",
      border: "#f59e0b55",
      desc: "Kopitiam food court credits",
      logo: KOPITIAM_LOGO,
    },
  ];

  return (
    <div style={{
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      background: COLORS.bg,
      minHeight: "100vh",
      color: COLORS.text,
      maxWidth: 430,
      margin: "0 auto",
      position: "relative",
      overflowX: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 20px 0",
        background: "#ffffff",
        borderBottom: `1px solid ${COLORS.cardBorder}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src={SP_LOGO}
              alt="SP Group"
              style={{ height: 36, width: "auto", objectFit: "contain" }}
            />
            <div style={{ borderLeft: `1px solid ${COLORS.cardBorder}`, paddingLeft: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1 }}>
                SP<span style={{ color: COLORS.accent }}>Smart</span>
              </div>
              <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 0.3, marginTop: 1 }}>2 Nasim Road HDB</div>
            </div>
          </div>
          <div style={{
            background: COLORS.greenSoft,
            border: `1.5px solid ${COLORS.green}`,
            borderRadius: 20,
            padding: "6px 14px",
            textAlign: "center"
          }}>
            <div style={{ fontSize: 10, color: COLORS.green, fontWeight: 600 }}>SAVED TODAY</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.green }}>${totalSaved.toFixed(2)}</div>
          </div>
        </div>

        {/* Streak Badge */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: 10 }}>
          <div style={{
            background: "#fbbf2422",
            border: "1.5px solid #fbbf24",
            borderRadius: 20,
            padding: "4px 12px",
            fontSize: 12,
            color: COLORS.gold,
            fontWeight: 700,
          }}>
            {streak}-day streak
          </div>
          <div style={{
            background: COLORS.accentSoft,
            border: `1.5px solid ${COLORS.accent}`,
            borderRadius: 20,
            padding: "4px 12px",
            fontSize: 12,
            color: COLORS.accent,
            fontWeight: 700,
          }}>
            {treeCount} trees planted
          </div>
        </div>

        {/* Tab Nav */}
        <div style={{
          display: "flex",
          gap: 2,
          background: "#eef2f7",
          borderRadius: 12,
          padding: 4,
          marginBottom: 0,
        }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "8px 4px",
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: tab === t.id ? 700 : 500,
                background: tab === t.id ? COLORS.accent : "transparent",
                color: tab === t.id ? "#0f172a" : COLORS.textMuted,
                transition: "all 0.2s",
              }}
            >
              <div style={{ marginTop: 1 }}>{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 100px" }}>

        {/* ===== USAGE TAB ===== */}
        {tab === "usage" && (
          <div>
            <div style={{ fontSize: 13, color: COLORS.textSub, marginBottom: 12 }}>Half-hourly usage · Today</div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              {[
                { color: COLORS.normal, label: "Normal", type: "bar" },
                { color: COLORS.peak, label: "Peak Hours", type: "bar" },
                { color: COLORS.spike, label: "Spike", type: "bar" },
                { color: "#facc15", label: "SG Avg HDB", type: "line" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                  {l.type === "line" ? (
                    <div style={{ width: 16, height: 2, background: l.color, borderRadius: 2, boxShadow: `0 0 4px ${l.color}` }} />
                  ) : (
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
                  )}
                  <span style={{ color: COLORS.textSub }}>{l.label}</span>
                </div>
              ))}
            </div>

            {/* Bar Chart */}
            <div style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 16,
              padding: "12px 10px 8px 4px",
              marginBottom: 12,
            }}>
              {/* Chart area: Y-axis + bars */}
              <div style={{ display: "flex", gap: 0 }}>

                {/* Y-axis labels */}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-end", paddingRight: 4, height: 140, flexShrink: 0 }}>
                  {[maxBar, maxBar * 0.75, maxBar * 0.5, maxBar * 0.25, 0].map((v, i) => (
                    <div key={i} style={{ fontSize: 8, color: COLORS.textMuted, lineHeight: 1 }}>
                      {v === 0 ? "0" : v.toFixed(2)}
                    </div>
                  ))}
                </div>

                {/* Bars + overlay */}
                <div style={{ flex: 1, position: "relative" }}>
                  {/* Y-axis grid lines */}
                  {[0, 25, 50, 75, 100].map(pct => (
                    <div key={pct} style={{
                      position: "absolute",
                      left: 0, right: 0,
                      bottom: `${pct * 1.3}px`,
                      height: 1,
                      background: COLORS.cardBorder,
                      opacity: 0.5,
                      zIndex: 0,
                    }} />
                  ))}

                  <div style={{ position: "relative", height: 140 }}>
                    {/* Bars */}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: "100%", position: "relative", zIndex: 1 }}>
                      {halfHourlyData.map((val, i) => {
                        const barH = Math.max((val / maxBar) * 130, val > 0 ? 3 : 0);
                        const color = getBarColor(i);
                        const isHovered = hoveredBar?.index === i;
                        return (
                          <div key={i} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", position: "relative" }}
                            onMouseEnter={() => setHoveredBar({ index: i, val })}
                            onMouseLeave={() => setHoveredBar(null)}
                          >
                            {isHovered && (
                              <div style={{
                                position: "absolute",
                                bottom: barH + 6,
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "#f1f5f9",
                                border: `1px solid ${color}`,
                                borderRadius: 6,
                                padding: "3px 6px",
                                fontSize: 9,
                                fontWeight: 700,
                                color: color,
                                whiteSpace: "nowrap",
                                zIndex: 10,
                                pointerEvents: "none",
                                boxShadow: `0 2px 8px #0008`,
                              }}>
                                {val.toFixed(2)} kWh
                              </div>
                            )}
                            <div style={{
                              width: "100%",
                              height: animBar ? barH : 0,
                              background: color,
                              borderRadius: "3px 3px 0 0",
                              transition: `height 0.6s cubic-bezier(0.34,1.56,0.64,1) ${i * 10}ms`,
                              boxShadow: SPIKE_INDICES.includes(i) ? `0 0 8px ${COLORS.spike}88` : "none",
                              opacity: isHovered ? 1 : 0.85,
                              cursor: "crosshair",
                            }} />
                          </div>
                        );
                      })}
                    </div>

                    {/* SG Average SVG line overlay */}
                    <svg
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "none", overflow: "visible" }}
                      preserveAspectRatio="none"
                      viewBox={`0 0 ${sgAvgData.length} 130`}
                    >
                      <defs>
                        <linearGradient id="sgGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#facc15" stopOpacity="0.18" />
                          <stop offset="100%" stopColor="#facc15" stopOpacity="0.01" />
                        </linearGradient>
                      </defs>
                      <polygon
                        points={[`0,130`, ...sgAvgData.map((v, i) => `${i + 0.5},${130 - (v / maxBar) * 130}`), `${sgAvgData.length},130`].join(" ")}
                        fill="url(#sgGrad)"
                      />
                      <polyline
                        points={sgAvgData.map((v, i) => `${i + 0.5},${130 - (v / maxBar) * 130}`).join(" ")}
                        fill="none" stroke="#facc15" strokeWidth="0.6"
                        strokeLinejoin="round" strokeLinecap="round" opacity="0.9"
                      />
                      {[20, 24].map(i => (
                        <circle key={i} cx={i + 0.5} cy={130 - (sgAvgData[i] / maxBar) * 130} r="1.2" fill="#facc15" />
                      ))}
                    </svg>

                    {/* SG Avg label */}
                    <div style={{
                      position: "absolute",
                      top: 130 - (sgAvgData[24] / maxBar) * 130 - 18,
                      right: 4,
                      background: "#facc1533", border: "1px solid #facc1566",
                      borderRadius: 6, padding: "2px 6px",
                      fontSize: 9, color: "#facc15", fontWeight: 700, zIndex: 3, whiteSpace: "nowrap",
                    }}>SG avg HDB</div>
                  </div>

                  {/* X-axis ticks — every 2 hours = every 4 slots */}
                  <div style={{ position: "relative", marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.cardBorder}` }}>
                    <div style={{ display: "flex" }}>
                      {Array.from({ length: 13 }, (_, i) => {
                        const hour = i * 2;
                        const label = hour === 0 ? "12am" : hour === 24 ? "12am" : hour === 12 ? "12pm" : hour < 12 ? `${hour}am` : `${hour - 12}pm`;
                        return (
                          <div key={i} style={{ flex: 1, fontSize: 8, color: COLORS.textMuted, textAlign: i === 0 ? "left" : i === 12 ? "right" : "center" }}>
                            {label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Y-axis unit label */}
              <div style={{ fontSize: 8, color: COLORS.textMuted, marginTop: 2, marginLeft: 4 }}>kWh</div>

              {/* Quick comparison stat */}
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                {(() => {
                  const yourTotal = halfHourlyData.reduce((a,b) => a+b, 0).toFixed(1);
                  const sgTotal = sgAvgData.reduce((a,b) => a+b, 0).toFixed(1);
                  const diff = ((halfHourlyData.reduce((a,b)=>a+b,0) / sgAvgData.reduce((a,b)=>a+b,0) - 1) * 100).toFixed(0);
                  const over = diff > 0;
                  return (
                    <>
                      <div style={{ flex: 1, background: COLORS.normalSoft, border: `1px solid ${COLORS.normal}44`, borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: COLORS.textMuted }}>Your usage</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.text }}>{yourTotal} kWh</div>
                      </div>
                      <div style={{ flex: 1, background: "#facc1511", border: "1px solid #facc1544", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: COLORS.textMuted }}>SG avg HDB</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#facc15" }}>{sgTotal} kWh</div>
                      </div>
                      <div style={{ flex: 1, background: over ? COLORS.spikeSoft : COLORS.greenSoft, border: `1px solid ${over ? COLORS.spike : COLORS.green}44`, borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: COLORS.textMuted }}>vs avg</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: over ? COLORS.spike : COLORS.green }}>{over ? "+" : ""}{diff}%</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Data source footnote */}
            </div>

            {/* Pricing Model Toggle */}
            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 14, padding: 14, marginBottom: 12,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSub, marginBottom: 10, letterSpacing: 1, textTransform: "uppercase" }}>Electricity Pricing Model</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {["flat", "tou"].map(m => (
                  <button key={m} onClick={() => setPricingModel(m)} style={{
                    flex: 1, padding: "8px 0", borderRadius: 10, fontWeight: 700, fontSize: 12,
                    border: `1.5px solid ${pricingModel === m ? COLORS.accent : COLORS.cardBorder}`,
                    background: pricingModel === m ? COLORS.accentSoft : "transparent",
                    color: pricingModel === m ? COLORS.accent : COLORS.textMuted,
                    cursor: "pointer",
                  }}>
                    {m === "flat" ? "Flat Rate" : "Time-of-Use"}
                  </button>
                ))}
              </div>

              {pricingModel === "flat" ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: COLORS.textSub }}>Rate (all day)</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>${PRICING.flat.rate.toFixed(4)}<span style={{ fontSize: 10, color: COLORS.textMuted }}> /kWh</span></span>
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>{PRICING.flat.desc}</div>
                  <div style={{ background: "#f1f5f9", border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, padding: 10, display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: COLORS.textMuted }}>Today's cost</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.green }}>${(halfHourlyData.reduce((a, b) => a + b, 0) * PRICING.flat.rate).toFixed(3)}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: COLORS.textMuted }}>Est. monthly</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.green }}>${(halfHourlyData.reduce((a, b) => a + b, 0) * 30 * PRICING.flat.rate).toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: COLORS.textMuted }}>Total kWh</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>{halfHourlyData.reduce((a, b) => a + b, 0).toFixed(1)}</div>
                    </div>
                  </div>

                  {/* Flat rate: peak demand shift tips */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSub, marginBottom: 8, letterSpacing: 0.8, textTransform: "uppercase" }}>Ways to Shift Peak Demand</div>
                  {[
                    { tip: "Run washing machine before 7am or after 10pm", saving: "~0.5 kWh shifted", color: COLORS.accent },
                    { tip: "Pre-cool flat to 25°C before 6pm, raise thermostat at 7pm", saving: "~0.6 kWh shifted", color: COLORS.accent },
                    { tip: "Use oven or hob before 6:30pm — avoid simultaneous peak appliances", saving: "~0.4 kWh shifted", color: COLORS.accent },
                    { tip: "Delay dishwasher and EV charging until after 10pm", saving: "~0.3 kWh shifted", color: COLORS.accent },
                  ].map((item, i) => (
                    <div key={i} style={{
                      background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
                      borderRadius: 10, padding: "10px 12px", marginBottom: 8,
                      borderLeft: `3px solid ${COLORS.accent}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                    }}>
                      <span style={{ fontSize: 12, color: COLORS.text, flex: 1, lineHeight: 1.5 }}>{item.tip}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.accent, flexShrink: 0 }}>{item.saving}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.5 }}>
                    On a flat rate, shifting usage doesn't change your price per kWh — but it reduces grid strain and earns you streak points.
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1, background: COLORS.peak + "18", border: `1px solid ${COLORS.peak}44`, borderRadius: 10, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: COLORS.peak, fontWeight: 700, marginBottom: 2 }}>PEAK</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.text }}>${PRICING.tou.peak.toFixed(4)}</div>
                      <div style={{ fontSize: 9, color: COLORS.textMuted }}>/kWh · 7am–11pm</div>
                    </div>
                    <div style={{ flex: 1, background: COLORS.normal + "18", border: `1px solid ${COLORS.normal}44`, borderRadius: 10, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: COLORS.normal, fontWeight: 700, marginBottom: 2 }}>OFF-PEAK</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.text }}>${PRICING.tou.offPeak.toFixed(4)}</div>
                      <div style={{ fontSize: 9, color: COLORS.textMuted }}>/kWh · 11pm–7am</div>
                    </div>
                  </div>
                  {(() => {
                    const peakKwh = halfHourlyData.reduce((sum, v, i) => sum + (isTouPeak(i) ? v : 0), 0);
                    const offKwh = halfHourlyData.reduce((sum, v, i) => sum + (!isTouPeak(i) ? v : 0), 0);
                    const peakCost = peakKwh * PRICING.tou.peak;
                    const offCost = offKwh * PRICING.tou.offPeak;
                    const totalTou = peakCost + offCost;
                    const flatCost = halfHourlyData.reduce((a, b) => a + b, 0) * PRICING.flat.rate;
                    const saving = flatCost - totalTou;
                    // Potential saving: if ALL peak kWh were shifted to off-peak
                    const potentialSaving = peakKwh * (PRICING.tou.peak - PRICING.tou.offPeak);
                    const savingPct = ((potentialSaving / totalTou) * 100).toFixed(0);
                    return (
                      <div>
                        {/* Potential savings highlight */}
                        <div style={{
                          background: "linear-gradient(135deg, #e0f2fe, #dbeafe)",
                          border: `1.5px solid ${COLORS.green}55`,
                          borderRadius: 12, padding: 14, marginBottom: 10,
                        }}>
                          <div style={{ fontSize: 11, color: COLORS.green, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>If You Avoided Peak Hours Entirely</div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontSize: 12, color: COLORS.textSub }}>Peak kWh that could shift</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{peakKwh.toFixed(2)} kWh</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontSize: 12, color: COLORS.textSub }}>Cost if shifted to off-peak</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.normal }}>${(peakKwh * PRICING.tou.offPeak).toFixed(3)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <span style={{ fontSize: 12, color: COLORS.textSub }}>Currently paying at peak</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.peak }}>${peakCost.toFixed(3)}</span>
                          </div>
                          <div style={{ background: COLORS.green + "22", border: `1px solid ${COLORS.green}44`, borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 10, color: COLORS.green, fontWeight: 700 }}>MAX DAILY SAVING</div>
                              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Shift all peak → off-peak</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.green }}>${potentialSaving.toFixed(3)}</div>
                              <div style={{ fontSize: 10, color: COLORS.green }}>~{savingPct}% less today</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 8 }}>
                            Est. monthly saving if you shift peak usage daily: <span style={{ color: COLORS.green, fontWeight: 700 }}>${(potentialSaving * 30).toFixed(2)}/month</span>
                          </div>
                        </div>

                        {/* Actual breakdown */}
                        <div style={{ background: "#f1f5f9", border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: COLORS.textMuted }}>Peak cost ({peakKwh.toFixed(2)} kWh)</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.peak }}>${peakCost.toFixed(3)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                            <span style={{ fontSize: 11, color: COLORS.textMuted }}>Off-peak cost ({offKwh.toFixed(2)} kWh)</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.normal }}>${offCost.toFixed(3)}</span>
                          </div>
                          <div style={{ borderTop: `1px solid ${COLORS.cardBorder}`, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.text }}>Total today</span>
                            <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.green }}>${totalTou.toFixed(3)}</span>
                          </div>
                          <div style={{ marginTop: 6, background: saving > 0 ? COLORS.green + "18" : COLORS.spike + "18", borderRadius: 8, padding: "6px 10px", display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, color: saving > 0 ? COLORS.green : COLORS.spike }}>vs flat rate</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: saving > 0 ? COLORS.green : COLORS.spike }}>{saving > 0 ? "save " : "pay more "} ${Math.abs(saving).toFixed(3)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* AI Usage Explainer */}
            {(() => {
              // ── Algorithmic detection ──────────────────────────────────────
              const baseline = halfHourlyData.slice(0, 14).reduce((a, b) => a + b, 0) / 14; // overnight baseline (midnight–7am)
              const spikeThreshold = baseline * 3.5;
              const detectedSpikes = halfHourlyData.map((v, i) => ({ v, i })).filter(({ v, i }) => v > spikeThreshold && i >= 14);
              const peakWindowData = halfHourlyData.slice(PEAK_START, PEAK_END + 1);
              const peakMax = Math.max(...peakWindowData);
              const peakMaxSlot = PEAK_START + peakWindowData.indexOf(peakMax);
              const peakStartSlot = halfHourlyData.findIndex((v, i) => i >= 14 && v > baseline * 2);
              const peakStartTime = peakStartSlot >= 0 ? `${Math.floor(peakStartSlot / 2)}:${peakStartSlot % 2 === 0 ? "00" : "30"}pm`.replace("pm", peakStartSlot < 24 ? "am" : "pm") : "7:00pm";
              const peakMaxTime = `${Math.floor(peakMaxSlot / 2)}:${peakMaxSlot % 2 === 0 ? "00" : "30"}`;
              const formatSlotTime = (i) => { const h = Math.floor(i / 2); const m = i % 2 === 0 ? "00" : "30"; return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m}${h >= 12 ? "pm" : "am"}`; };
              const overnightAvg = (halfHourlyData.slice(0, 14).reduce((a, b) => a + b, 0) / 14).toFixed(3);
              const eveningAvg = (peakWindowData.reduce((a, b) => a + b, 0) / peakWindowData.length).toFixed(2);
              const ratio = (parseFloat(eveningAvg) / parseFloat(overnightAvg)).toFixed(0);

              // Algorithmically generated summary text
              const algoSummary = `Your usage is low and stable overnight (12am–7am), averaging ${overnightAvg} kWh per slot. Usage begins rising around ${formatSlotTime(peakStartSlot > 0 ? peakStartSlot : 26)} and peaks between 7pm–9pm, reaching ${peakMax.toFixed(2)} kWh at ${formatSlotTime(peakMaxSlot)} — ${ratio}× your overnight baseline. ${detectedSpikes.length} unusual spike${detectedSpikes.length !== 1 ? "s" : ""} detected above ${spikeThreshold.toFixed(2)} kWh threshold${detectedSpikes.length > 0 ? ` at ${detectedSpikes.slice(0, 2).map(s => formatSlotTime(s.i)).join(", ")}` : ""}.`;

              return (
                <div>
                  {/* AI Summary Box */}
                  <div style={{
                    background: "#dbeafe", border: `1px solid ${COLORS.accent}44`,
                    borderRadius: 14, padding: 14, marginBottom: 12,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.accent, boxShadow: `0 0 6px ${COLORS.accent}` }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent }}>AI Usage Explainer</span>
                      </div>
                      {!showAI && (
                        <button onClick={typeAI} style={{
                          background: COLORS.accent, color: "#0f172a", border: "none",
                          borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        }}>Analyse with AI →</button>
                      )}
                    </div>

                    {/* Always-visible algorithmic summary */}
                    <div style={{ background: "#e0f2fe", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Pattern Detection</div>
                      <p style={{ fontSize: 12.5, color: COLORS.textSub, lineHeight: 1.7, margin: 0 }}>{algoSummary}</p>
                    </div>

                    {/* Detected spike chips */}
                    {detectedSpikes.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {detectedSpikes.slice(0, 4).map(({ v, i }) => (
                          <div key={i} style={{
                            background: COLORS.spike + "22", border: `1px solid ${COLORS.spike}55`,
                            borderRadius: 8, padding: "3px 8px", fontSize: 10, color: COLORS.spike, fontWeight: 700,
                          }}>
                            {formatSlotTime(i)} · {v.toFixed(2)} kWh
                          </div>
                        ))}
                        <div style={{
                          background: COLORS.peak + "22", border: `1px solid ${COLORS.peak}55`,
                          borderRadius: 8, padding: "3px 8px", fontSize: 10, color: COLORS.peak, fontWeight: 700,
                        }}>
                          Peak window: 7pm–9pm
                        </div>
                      </div>
                    )}

                    {/* AI-generated deeper analysis */}
                    {showAI && (
                      <div style={{ borderTop: `1px solid ${COLORS.accent}22`, paddingTop: 10 }}>
                        <div style={{ fontSize: 10, color: COLORS.accent, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>AI Analysis</div>
                        {aiLoading ? (
                          <p style={{ fontSize: 12, color: COLORS.textMuted, margin: 0, fontStyle: "italic" }}>Analysing your usage pattern...</p>
                        ) : (
                          <p style={{ fontSize: 12.5, color: COLORS.textSub, lineHeight: 1.7, margin: 0 }}>{aiText}<span style={{ opacity: 0.5 }}>|</span></p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Driver Insights — always visible */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSub, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Driver Insights</div>
                    {[
                      {
                        title: "Air Conditioning",
                        problem: "Your 7–9pm spike strongly suggests AC running at full capacity immediately after returning home. At 23°C, a typical HDB unit draws 1.2–1.5 kWh per hour.",
                        reduce: "Set AC to 26°C — each degree saves ~10% energy. Use a fan alongside to feel cooler at a higher setpoint.",
                        shift: "Pre-cool your flat to 25°C before 6pm, then raise it to 27°C at 7pm when grid demand peaks.",
                        severity: "high",
                        color: COLORS.spike,
                      },
                      {
                        title: "Simultaneous Cooking Appliances",
                        problem: "Hob, oven, and microwave appear to run at the same time between 7–8pm, stacking load. Running all three together can add 2–3 kWh in a single hour.",
                        reduce: "Use only one high-draw appliance at a time. Microwave is 5× more efficient than oven for reheating.",
                        shift: "Batch-cook before 6:30pm or after 9pm. Even shifting dinner prep 30 minutes earlier cuts peak load significantly.",
                        severity: "medium",
                        color: COLORS.peak,
                      },
                      {
                        title: "Standby & Idle Appliances",
                        problem: "A consistent baseline of ~0.05 kWh through the day suggests TVs, routers, and chargers left on standby. This adds up to ~36 kWh/month.",
                        reduce: "Switch off devices at the wall when not in use. Smart power strips can eliminate phantom load automatically.",
                        shift: "Not applicable — standby power is constant. Reduction is the only fix here.",
                        severity: "low",
                        color: COLORS.accent,
                      },
                      {
                        title: "Water Heater",
                        problem: "If your water heater is on a timer or always-on, it likely contributes 0.2–0.4 kWh during the evening peak window.",
                        reduce: "Turn the water heater off except for 30 minutes before your shower. Instant heaters are more efficient than storage tanks.",
                        shift: "Schedule your water heater to heat water before 6pm or after 10pm to avoid peak window entirely.",
                        severity: "low",
                        color: COLORS.normal,
                      },
                    ].map((d, idx) => {
                      const open = openInsights[idx] || false;
                      const setOpen = (val) => setOpenInsights(prev => ({ ...prev, [idx]: typeof val === 'function' ? val(prev[idx] || false) : val }));
                      return (
                        <div key={d.title} style={{
                          background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
                          borderRadius: 12, marginBottom: 8, overflow: "hidden",
                          borderLeft: `3px solid ${d.color}`,
                        }}>
                          <div onClick={() => setOpen(o => !o)} style={{
                            padding: "12px 14px", cursor: "pointer",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: d.color }}>{d.title}</div>
                              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                                {d.severity === "high" ? "High impact" : d.severity === "medium" ? "Medium impact" : "Low impact"} · Tap for solutions
                              </div>
                            </div>
                            <div style={{ fontSize: 14, color: COLORS.textMuted }}>{open ? "▲" : "▼"}</div>
                          </div>
                          {open && (
                            <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${COLORS.cardBorder}` }}>
                              <p style={{ fontSize: 12, color: COLORS.textSub, lineHeight: 1.6, margin: "10px 0 10px" }}>{d.problem}</p>
                              <div style={{ background: COLORS.spike + "11", border: `1px solid ${COLORS.spike}33`, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                                <div style={{ fontSize: 10, color: COLORS.spike, fontWeight: 700, marginBottom: 3 }}>REDUCE OVERALL</div>
                                <div style={{ fontSize: 12, color: COLORS.textSub, lineHeight: 1.5 }}>{d.reduce}</div>
                              </div>
                              <div style={{ background: COLORS.accent + "11", border: `1px solid ${COLORS.accent}33`, borderRadius: 8, padding: "8px 10px" }}>
                                <div style={{ fontSize: 10, color: COLORS.accent, fontWeight: 700, marginBottom: 3 }}>SHIFT PEAK</div>
                                <div style={{ fontSize: 12, color: COLORS.textSub, lineHeight: 1.5 }}>{d.shift}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ===== ACTIONS TAB ===== */}
        {tab === "actions" && (
          <div>
            {/* Mystery Drop overlay */}
            {mysteryDrop && (
              <div style={{
                position: "fixed", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                background: "linear-gradient(135deg, #f3e8ff, #ede9fe)",
                border: `2px solid ${COLORS.purple}`, borderRadius: 20,
                padding: "28px 36px", zIndex: 999, textAlign: "center",
                boxShadow: `0 0 60px ${COLORS.purple}66`, animation: "fadeIn 0.3s ease",
              }}>
                
                <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.purple, marginTop: 8 }}>{mysteryDrop.label}</div>
                <div style={{ fontSize: 13, color: COLORS.textSub, marginTop: 6 }}>Added to your bill credit!</div>
              </div>
            )}

            {/* ── Demo Toggles ── */}
            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 12, padding: "10px 14px", marginBottom: 14,
            }}>
              <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Demo Controls</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>Streak state</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => { setStreakBroken(false); setStreakProtectionAccepted(false); setReminderSet(false); }} style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${!streakBroken ? COLORS.gold : COLORS.cardBorder}`,
                      background: !streakBroken ? COLORS.gold + "22" : "transparent",
                      color: !streakBroken ? COLORS.gold : COLORS.textMuted, cursor: "pointer",
                    }}>Active</button>
                    <button onClick={() => { setStreakBroken(true); setStreakProtectionAccepted(false); setReminderSet(false); }} style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${streakBroken ? COLORS.spike : COLORS.cardBorder}`,
                      background: streakBroken ? COLORS.spike + "22" : "transparent",
                      color: streakBroken ? COLORS.spike : COLORS.textMuted, cursor: "pointer",
                    }}>Broken</button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>Grid strain event</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => { setGridStrainVisible(true); setGridStrainClaimed(false); }} style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${gridStrainVisible && !gridStrainClaimed ? COLORS.purple : COLORS.cardBorder}`,
                      background: gridStrainVisible && !gridStrainClaimed ? COLORS.purple + "22" : "transparent",
                      color: gridStrainVisible && !gridStrainClaimed ? COLORS.purple : COLORS.textMuted, cursor: "pointer",
                    }}>Show</button>
                    <button onClick={() => setGridStrainVisible(false)} style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${!gridStrainVisible ? COLORS.spike : COLORS.cardBorder}`,
                      background: !gridStrainVisible ? COLORS.spike + "11" : "transparent",
                      color: !gridStrainVisible ? COLORS.spike : COLORS.textMuted, cursor: "pointer",
                    }}>✕ Hide</button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>Streak protection</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setStreakProtectionAccepted(false)} style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${!streakProtectionAccepted ? COLORS.gold : COLORS.cardBorder}`,
                      background: !streakProtectionAccepted ? COLORS.gold + "22" : "transparent",
                      color: !streakProtectionAccepted ? COLORS.gold : COLORS.textMuted, cursor: "pointer",
                    }}>Show</button>
                    <button onClick={() => setStreakProtectionAccepted(true)} style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${streakProtectionAccepted ? COLORS.green : COLORS.cardBorder}`,
                      background: streakProtectionAccepted ? COLORS.green + "22" : "transparent",
                      color: streakProtectionAccepted ? COLORS.green : COLORS.textMuted, cursor: "pointer",
                    }}>Accepted</button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>Simulate day</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[3, 5, 7].map(d => (
                      <button key={d} onClick={() => {
                        setGridStrainDay(d);
                        setGridStrainClaimed(false);
                        setGridStrainVisible(true);
                        setStreak(d);
                        setStreakBroken(false);
                        setStreakProtectionAccepted(false);
                      }} style={{
                        padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                        border: `1px solid ${gridStrainDay === d ? COLORS.purple : COLORS.cardBorder}`,
                        background: gridStrainDay === d ? COLORS.purple + "22" : "transparent",
                        color: gridStrainDay === d ? COLORS.purple : COLORS.textMuted, cursor: "pointer",
                      }}>Day {d}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── STREAK BROKEN STATE ── */}
            {streakBroken ? (
              <div>
                {/* Broken banner */}
                <div style={{
                  background: "linear-gradient(135deg, #fff1f2, #ffe4e6)",
                  border: `1.5px solid ${COLORS.spike}66`,
                  borderRadius: 18, padding: 16, marginBottom: 14,
                }}>
                  <div style={{ textAlign: "center", marginBottom: 14 }}>
                    
                    <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.spike, marginTop: 6 }}>Streak Lost</div>
                    <div style={{ fontSize: 12, color: COLORS.textSub, marginTop: 4, lineHeight: 1.5 }}>
                      Your 5-day streak ended yesterday. That's okay — everyone slips up. Here's what you had going:
                    </div>
                  </div>

                  {/* What they lost — guilt-free recap */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {[
                      { val: "5", unit: "days", label: "Best streak", color: COLORS.spike },
                      { val: "0.5", unit: "kWh", label: "Reduced/day", color: COLORS.textSub },
                      { val: "0.8", unit: "kWh", label: "Shifted/day", color: COLORS.textSub },
                      { val: "$1.25", unit: "", label: "Total saved", color: COLORS.green },
                    ].map(s => (
                      <div key={s.label} style={{
                        flex: 1, background: "#fff1f2",
                        border: `1px solid ${COLORS.cardBorder}`,
                        borderRadius: 10, padding: "8px 4px", textAlign: "center",
                      }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: s.color, lineHeight: 1 }}>
                          {s.val}<span style={{ fontSize: 10 }}>{s.unit}</span>
                        </div>
                        <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 3 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* 7-day trail showing the break */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 6 }}>This week</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[
                        { d: "M", done: true }, { d: "T", done: true }, { d: "W", done: true },
                        { d: "T", done: true }, { d: "F", done: true }, { d: "S", done: false, broken: true },
                        { d: "S", done: false },
                      ].map((day, i) => (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <div style={{
                            width: "100%", aspectRatio: "1", borderRadius: "50%",
                            background: day.broken ? COLORS.spike + "33" : day.done ? COLORS.gold : COLORS.cardBorder,
                            border: day.broken ? `1.5px solid ${COLORS.spike}` : "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: day.broken ? COLORS.spike : day.done ? "#0f172a" : COLORS.textMuted,
                            fontWeight: 700,
                          }}>{day.broken ? "✕" : day.done ? "✓" : ""}</div>
                          <div style={{ fontSize: 8, color: day.broken ? COLORS.spike : day.done ? COLORS.gold : COLORS.textMuted }}>{day.d}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: COLORS.textSub, lineHeight: 1.5, marginBottom: 12, textAlign: "center" }}>
                    You still saved <span style={{ color: COLORS.green, fontWeight: 700 }}>$1.25</span> — that money is yours to keep regardless of the streak.
                  </div>

                  {/* Restart CTA */}
                  <button style={{
                    width: "100%", background: `linear-gradient(135deg, ${COLORS.spike}, #b91c1c)`,
                    border: "none", borderRadius: 12, color: "#fff",
                    padding: "14px 0", fontWeight: 900, fontSize: 15, cursor: "pointer",
                    letterSpacing: 0.3,
                  }} onClick={() => setStreakBroken(false)}>
                    Start a new streak today
                  </button>
                </div>

                {/* AI suggests an easier starter goal */}
                <div style={{
                  background: "#e0f2fe", border: `1px solid ${COLORS.accent}44`,
                  borderRadius: 14, padding: 14, marginBottom: 14,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent, marginBottom: 8 }}>AI Habit Coach</div>
                  <div style={{ fontSize: 12, color: COLORS.textSub, lineHeight: 1.6, marginBottom: 10 }}>
                    Streaks breaking often means the goal is too hard for busy days. Let's start with something much simpler so you can rebuild momentum:
                  </div>
                  {/* Easier starter goals */}
                  {[
                    { icon: "", title: "Turn off 1 standby light at 10pm", pts: 10, kwh: "0.05 kWh" },
                    { icon: "", title: "Set AC to 26°C just for tonight", pts: 15, kwh: "0.2 kWh" },
                    { icon: "", title: "Switch off TV at the wall before bed", pts: 10, kwh: "0.03 kWh" },
                  ].map((g, i) => (
                    <div key={i} style={{
                      background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
                      borderRadius: 10, padding: "10px 12px", marginBottom: 6,
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <div style={{ fontSize: 20 }}>{g.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{g.title}</div>
                        <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Saves ~{g.kwh} · Easy win</div>
                      </div>
                      <div style={{
                        background: COLORS.accentSoft, border: `1px solid ${COLORS.accent}`,
                        borderRadius: 7, padding: "3px 8px",
                        fontSize: 10, fontWeight: 700, color: COLORS.accent, flexShrink: 0,
                      }}>+{g.pts}</div>
                    </div>
                  ))}
                  <button style={{
                    marginTop: 6, width: "100%", background: COLORS.accentSoft,
                    border: `1.5px solid ${COLORS.accent}`, borderRadius: 10,
                    color: COLORS.accent, padding: "10px 0",
                    fontWeight: 800, fontSize: 13, cursor: "pointer",
                  }}>Pick a starter goal &amp; restart</button>
                </div>
              </div>

            ) : (
              /* ── STREAK ACTIVE STATE ── */
              <div>
                {/* ── AI Habit Coach (top of screen) ── */}
                <div style={{
                  background: "linear-gradient(135deg, #e0f2fe, #dbeafe)",
                  border: `1.5px solid ${COLORS.accent}44`,
                  borderRadius: 14, padding: 14, marginBottom: 14,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: COLORS.accent + "22", border: `1.5px solid ${COLORS.accent}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, flexShrink: 0,
                    }}>AI</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.accent }}>Habit Coach</div>
                    {habitCoachLoading && (
                      <div style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: "italic", marginLeft: "auto" }}>thinking...</div>
                    )}
                  </div>
                  <p style={{ fontSize: 12.5, color: COLORS.textSub, lineHeight: 1.6, margin: "0 0 10px" }}>
                    {habitCoachLoading
                      ? "Personalising your coaching..."
                      : (habitCoachText || `Amazing — ${streak} days in a row! You've cut 0.5 kWh of overall usage and shifted 0.8 kWh out of peak daily, saving ~$${(streak * 0.25).toFixed(2)} so far. ${streak >= 7 ? "2× multiplier is now active — keep it going!" : `${7 - streak} more day${7 - streak !== 1 ? "s" : ""} to unlock your 2× streak multiplier!`}`)}
                  </p>
                  <button onClick={() => setReminderSet(true)} style={{
                    background: reminderSet ? COLORS.green + "22" : COLORS.accentSoft,
                    border: `1px solid ${reminderSet ? COLORS.green : COLORS.accent}`,
                    borderRadius: 8, color: reminderSet ? COLORS.green : COLORS.accent,
                    padding: "8px 16px", fontWeight: 700, fontSize: 12,
                    cursor: reminderSet ? "default" : "pointer", width: "100%", fontFamily: "inherit",
                  }}>{reminderSet ? "✓ Reminder set for 5:30pm" : "Yes, set a 5:30pm reminder"}</button>
                </div>

                {/* Streak Hero Card */}
                <div style={{
                  background: "linear-gradient(135deg, #fefce8, #fef9c3)",
                  border: `1.5px solid ${COLORS.gold}66`,
                  borderRadius: 18, padding: 16, marginBottom: 14,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.gold, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Active Streak</div>
                      <div style={{ fontSize: 32, fontWeight: 900, color: COLORS.gold, lineHeight: 1.1, marginTop: 4 }}>{streak} days</div>
                      <div style={{ fontSize: 12, color: COLORS.textSub, marginTop: 4 }}>
                        {streak >= 7 ? "2× multiplier unlocked!" : `${7 - streak} more day${7 - streak !== 1 ? "s" : ""} unlocks your 2× bonus!`}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>This week</div>
                      <div style={{ display: "flex", gap: 5 }}>
                        {["M","T","W","T","F","S","S"].map((d, i) => (
                          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: "50%",
                              background: i < streak ? COLORS.gold : COLORS.cardBorder,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, color: i < streak ? "#0f172a" : COLORS.textMuted,
                              boxShadow: i < streak ? `0 0 8px ${COLORS.gold}88` : "none",
                              fontWeight: 700,
                            }}>{i < streak ? "✓" : ""}</div>
                            <div style={{ fontSize: 7, color: i < streak ? COLORS.gold : COLORS.textMuted }}>{d}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Feedback loop */}
                  <div style={{
                    marginTop: 14, background: "#fefce8",
                    border: "1px solid #3a2800", borderRadius: 12, padding: 12,
                  }}>
                    <div style={{ fontSize: 10, color: COLORS.gold, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                      What your streak achieved
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[
                        { val: `${streak}`, unit: "days", label: "Streak", color: COLORS.gold },
                        { val: "0.5", unit: "kWh", label: "Reduced/day", color: COLORS.spike },
                        { val: "0.8", unit: "kWh", label: "Shifted/day", color: COLORS.accent },
                        { val: `$${(streak * 0.25).toFixed(2)}`, unit: "", label: "Total saved", color: COLORS.green },
                      ].map(s => (
                        <div key={s.label} style={{
                          flex: 1, background: s.color + "11",
                          border: `1.5px solid ${s.color}44`,
                          borderRadius: 10, padding: "8px 4px", textAlign: "center",
                        }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: s.color, lineHeight: 1, textShadow: `0 0 12px ${s.color}88` }}>
                            {s.val}<span style={{ fontSize: 9, fontWeight: 600 }}>{s.unit}</span>
                          </div>
                          <div style={{ fontSize: 8, color: COLORS.textMuted, marginTop: 4 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{
                      marginTop: 10, background: COLORS.greenSoft,
                      border: `1px solid ${COLORS.green}44`,
                      borderRadius: 8, padding: "8px 12px",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ fontSize: 11, color: COLORS.textSub }}>Total saved this streak</span>
                      <span style={{ fontSize: 16, fontWeight: 900, color: COLORS.green }}>$1.25 <span style={{ fontSize: 10, fontWeight: 500, color: COLORS.textMuted }}>(5.0 kWh total)</span></span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 5 }}>Daily kWh — reduced (red) + shifted (teal)</div>
                      <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 48 }}>
                        {[[0.5, 0.6],[0.4, 0.9],[0.6, 0.7],[0.5, 1.0],[0.5, 0.8]].map(([r, s], i) => (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 1 }}>
                              <div style={{
                                width: "100%", height: `${(r / 1.5) * 22}px`,
                                background: `linear-gradient(180deg, ${COLORS.spike}, ${COLORS.spike}88)`,
                                borderRadius: "3px 3px 0 0",
                              }} />
                              <div style={{
                                width: "100%", height: `${(s / 1.5) * 22}px`,
                                background: `linear-gradient(180deg, ${COLORS.accent}, ${COLORS.accent}88)`,
                                borderRadius: "0 0 3px 3px",
                                boxShadow: i === 4 ? `0 0 8px ${COLORS.accent}88` : "none",
                              }} />
                            </div>
                            <div style={{ fontSize: 8, color: COLORS.textMuted }}>{"MTWTF"[i]}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS.spike }} />
                          <span style={{ fontSize: 9, color: COLORS.textMuted }}>Reduced</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS.accent }} />
                          <span style={{ fontSize: 9, color: COLORS.textMuted }}>Shifted</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Streak Protection — hidden once accepted */}
                {!streakProtectionAccepted && (
                <div style={{
                  background: "linear-gradient(135deg, #fff1f2, #ffe4e6)",
                  border: `1.5px solid ${COLORS.spike}55`,
                  borderRadius: 16, padding: 14, marginBottom: 14,
                }}>
                  <div style={{ fontSize: 10, color: COLORS.spike, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Streak Protection</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Busy tonight? Try an easier win</div>
                  <div style={{ fontSize: 12, color: COLORS.textSub, lineHeight: 1.5, marginBottom: 12 }}>
                    Your pre-cooling goal might be tough today. Here's a simpler goal to keep your streak alive:
                  </div>
                  <div style={{
                    background: "#fefce8", border: `1px solid ${COLORS.gold}44`,
                    borderRadius: 12, padding: 12, marginBottom: 10,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.gold }}>Turn off 1 standby light after 10pm</div>
                          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Takes 10 seconds. Saves ~0.05 kWh.</div>
                        </div>
                      </div>
                      <div style={{
                        background: COLORS.gold + "22", border: `1px solid ${COLORS.gold}66`,
                        borderRadius: 8, padding: "4px 10px",
                        fontSize: 11, fontWeight: 700, color: COLORS.gold, flexShrink: 0, marginLeft: 8,
                      }}>+15 pts</div>
                    </div>
                  </div>
                  <button onClick={() => {
                    setStreakProtectionAccepted(true);
                    setTimeout(() => {
                      const el = document.getElementById("ai-tasks-section");
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 100);
                  }} style={{
                    width: "100%", background: COLORS.gold + "22",
                    border: `1.5px solid ${COLORS.gold}`, borderRadius: 10,
                    color: COLORS.gold, padding: "10px 0",
                    fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  }}>Accept easier goal · Keep streak</button>
                </div>
                )}
              </div>
            )}

            {/* ── Grid Strain Event ── */}
            {gridStrainVisible && !gridStrainClaimed && (
              <div style={{
                background: "linear-gradient(135deg, #f3e8ff, #ede9fe)",
                border: `1.5px solid ${COLORS.purple}66`,
                borderRadius: 16, padding: 16, marginBottom: 14,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 10, color: COLORS.purple, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Grid Strain Event · Now</div>
                    <div style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>Reduce usage 7–9pm tonight</div>
                  </div>
                  <div style={{ background: COLORS.spike + "22", border: `1px solid ${COLORS.spike}55`, borderRadius: 8, padding: "4px 8px", flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: COLORS.spike, fontWeight: 700 }}>LIVE</div>
                  </div>
                </div>

                {/* Qualification */}
                <div style={{
                  marginTop: 10, background: "#f3e8ff", border: `1px solid ${COLORS.purple}33`,
                  borderRadius: 10, padding: 10,
                }}>
                  <div style={{ fontSize: 10, color: COLORS.purple, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>HOW TO QUALIFY</div>
                  <div style={{ fontSize: 11, color: COLORS.textSub, lineHeight: 1.6 }}>
                    Stay <span style={{ color: COLORS.text, fontWeight: 700 }}>below 0.3 kWh per 30-min slot</span> during peak hours (7–9pm) for an <span style={{ color: COLORS.text, fontWeight: 700 }}>entire week</span> — Mon to Sun. Miss even one slot and you won't qualify.
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                    {["M","T","W","T","F","S","S"].map((d, i) => {
                      const dayNum = i + 1;
                      const passed = dayNum < gridStrainDay;
                      const isToday = dayNum === gridStrainDay;
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div style={{
                            width: "100%", aspectRatio: "1", borderRadius: "50%",
                            background: isToday ? COLORS.purple + "33" : passed ? COLORS.green + "33" : COLORS.cardBorder,
                            border: `1.5px solid ${isToday ? COLORS.purple : passed ? COLORS.green : COLORS.cardBorder}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9, fontWeight: 700,
                            color: isToday ? COLORS.purple : passed ? COLORS.green : COLORS.textMuted,
                          }}>{passed ? "✓" : isToday ? "?" : ""}</div>
                          <div style={{ fontSize: 8, color: isToday ? COLORS.purple : passed ? COLORS.green : COLORS.textMuted }}>{d}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6 }}>
                    {gridStrainDay === 7
                      ? "All 7 days completed — reward unlocked!"
                      : `${gridStrainDay - 1} of 7 days passed · ${7 - gridStrainDay + 1} day${7 - gridStrainDay + 1 !== 1 ? "s" : ""} remaining`}
                  </div>
                </div>

                {gridStrainDay === 7 ? (
                  <button onClick={triggerMystery} style={{
                    marginTop: 12, width: "100%",
                    background: `linear-gradient(135deg, ${COLORS.purple}, #7c3aed)`,
                    border: "none", borderRadius: 10, color: "#fff",
                    padding: "12px 0", fontWeight: 800, fontSize: 14, cursor: "pointer",
                  }}>Claim Mystery Drop — Day 7 Unlocked!</button>
                ) : (
                  <div style={{
                    marginTop: 12, width: "100%", boxSizing: "border-box",
                    background: COLORS.cardBorder, borderRadius: 10, color: COLORS.textMuted,
                    padding: "12px 0", fontWeight: 700, fontSize: 13, textAlign: "center",
                    cursor: "not-allowed",
                  }}>Reward unlocks on Day 7</div>
                )}
              </div>
            )}


            {/* ── AI Suggested Tasks ── */}
            <div id="ai-tasks-section" style={{
              background: "#dbeafe", border: `1px solid ${COLORS.accent}33`,
              borderRadius: 14, padding: 14, marginBottom: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: aiTasks.length > 0 ? 12 : 0 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent }}>AI Suggested Tasks</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Fresh tasks for today · 2 Nasim Road</div>
                </div>
              </div>

              {aiTasksLoading && (
                <p style={{ fontSize: 12, color: COLORS.textMuted, margin: 0, fontStyle: "italic" }}>Generating personalised tasks...</p>
              )}

              {!aiTasksLoading && aiTasks.length > 0 && aiTasks.map((t, i) => (
                <div key={i} onClick={() => setAiTasksDone(prev => ({ ...prev, [i]: !prev[i] }))} style={{
                  background: aiTasksDone[i] ? COLORS.green + "11" : COLORS.card,
                  border: `1px solid ${aiTasksDone[i] ? COLORS.green + "55" : COLORS.cardBorder}`,
                  borderRadius: 12, padding: 12, marginBottom: i < aiTasks.length - 1 ? 8 : 0,
                  cursor: "pointer", transition: "all 0.2s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                        background: aiTasksDone[i] ? COLORS.green : "transparent",
                        border: `2px solid ${aiTasksDone[i] ? COLORS.green : COLORS.textMuted}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 800, color: "#0f172a", transition: "all 0.2s",
                      }}>{aiTasksDone[i] ? "✓" : ""}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: aiTasksDone[i] ? 500 : 700, color: aiTasksDone[i] ? COLORS.textMuted : COLORS.text, textDecoration: aiTasksDone[i] ? "line-through" : "none" }}>{t.task}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: COLORS.textMuted }}>Saves ~{t.kwh}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "1px 6px",
                            background: t.type === "reduce" ? COLORS.spike + "22" : COLORS.accent + "22",
                            color: t.type === "reduce" ? COLORS.spike : COLORS.accent,
                            border: `1px solid ${t.type === "reduce" ? COLORS.spike + "44" : COLORS.accent + "44"}`,
                          }}>{t.type === "reduce" ? "REDUCE" : "SHIFT"}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{
                      background: aiTasksDone[i] ? COLORS.greenSoft : COLORS.accentSoft,
                      border: `1px solid ${aiTasksDone[i] ? COLORS.green : COLORS.accent}`,
                      borderRadius: 8, padding: "4px 10px",
                      fontSize: 11, fontWeight: 700,
                      color: aiTasksDone[i] ? COLORS.green : COLORS.accent,
                      flexShrink: 0, marginLeft: 8,
                    }}>+{t.points} pts</div>
                  </div>
                </div>
              ))}
            </div>

            </div>
        )}

        {/* ===== IMPACT TAB ===== */}
        {tab === "impact" && (
          <div>
            <div style={{ fontSize: 13, color: COLORS.textSub, marginBottom: 12 }}>Your cumulative impact</div>

            {/* Period toggle */}
            <div style={{
              display: "flex", gap: 3, background: "#eef2f7",
              borderRadius: 12, padding: 4, marginBottom: 14,
            }}>
              {[["week","Week"],["month","Month"],["year","Year"]].map(([key, lbl]) => (
                <button key={key} onClick={() => setImpactPeriod(key)} style={{
                  flex: 1, padding: "8px 4px", borderRadius: 9, border: "none",
                  cursor: "pointer", fontSize: 12, fontWeight: impactPeriod === key ? 800 : 500,
                  background: impactPeriod === key ? COLORS.green : "transparent",
                  color: impactPeriod === key ? "#0f172a" : COLORS.textMuted,
                  transition: "all 0.2s",
                }}>{lbl}</button>
              ))}
            </div>

            {/* Big Savings Number */}
            {(() => {
              const periods = {
                week:  { label: "This Week",  dollar: "8.75",  kwh: "9.8",  shifted: "4.2",  peakHrs: "3",  car: "14km car ride", trees: "0.5 trees", mrt: "1 MRT trip" },
                month: { label: "This Month", dollar: totalSaved.toFixed(2), kwh: "42.3", shifted: "18.7", peakHrs: "12", car: "60km car ride", trees: "3 trees", mrt: "2 MRT trips" },
                year:  { label: "This Year",  dollar: "149.20", kwh: "504",  shifted: "224",  peakHrs: "144", car: "720km car ride", trees: "36 trees", mrt: "24 MRT trips" },
              };
              const p = periods[impactPeriod];
              return (
                <>
                  <div style={{
                    background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
                    border: `1.5px solid ${COLORS.green}55`,
                    borderRadius: 18, padding: 20, marginBottom: 12, textAlign: "center",
                  }}>
                    <div style={{ fontSize: 11, color: COLORS.green, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
                      Total Saved · {p.label}
                    </div>
                    <div style={{ fontSize: 56, fontWeight: 900, color: COLORS.green, lineHeight: 1.1, marginTop: 4 }}>
                      ${p.dollar}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSub, marginTop: 6 }}>vs. your baseline usage pattern</div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 14 }}>
                      {[["kWh saved", p.kwh], ["kWh shifted", p.shifted], ["Peak hrs reduced", p.peakHrs]].map(([k, v]) => (
                        <div key={k} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>{v}</div>
                          <div style={{ fontSize: 10, color: COLORS.textMuted }}>{k}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Milestones — dynamic per period */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSub, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Milestones · {p.label}</div>
                  {[
                    { icon: "→", label: `Offset equivalent of a ${p.car}!`, color: COLORS.green },
                    { icon: "→", label: `Carbon saved = planting ${p.trees}!`, color: COLORS.accent },
                    { icon: "→", label: `Powered equivalent of ${p.mrt} with your savings!`, color: COLORS.normal },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: COLORS.card, border: `1px solid ${m.color}44`,
                      borderLeft: `3px solid ${m.color}`, borderRadius: 12,
                      padding: "12px 14px", marginBottom: 8,
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <div style={{ fontSize: 24 }}>{m.icon}</div>
                      <div style={{ fontSize: 12.5, color: COLORS.text, fontWeight: 600, lineHeight: 1.4 }}>{m.label}</div>
                    </div>
                  ))}
                </>
              );
            })()}

            {/* Weekly Bar Chart */}
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSub, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Daily Progress This Week</div>
            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 14, padding: "14px 14px 8px", marginBottom: 12,
            }}>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 80 }}>
                {weeklyProgress.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 2, height: 70, justifyContent: "flex-end" }}>
                      <div style={{ background: COLORS.accent, borderRadius: "3px 3px 0 0", height: `${(d.shifted / 1.1) * 50}%`, minHeight: 3 }} />
                      <div style={{ background: COLORS.green + "99", borderRadius: "3px 3px 0 0", height: `${(d.saved / 1.6) * 50}%`, minHeight: 3 }} />
                    </div>
                    <div style={{ fontSize: 9, color: COLORS.textMuted }}>{d.day}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                {[{ color: COLORS.green + "99", label: "$ Saved" }, { color: COLORS.accent, label: "kWh Shifted" }].map(l => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                    <span style={{ color: COLORS.textMuted }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ===== COMMUNITY TAB ===== */}
        {tab === "community" && (
          <div>
            <div style={{ fontSize: 13, color: COLORS.textSub, marginBottom: 14 }}>Your block vs the neighbourhood</div>

            {/* Neighbourhood Impact */}
            <div style={{
              background: "linear-gradient(135deg, #e0f2fe, #dbeafe)",
              border: `1.5px solid ${COLORS.normal}44`,
              borderRadius: 18,
              padding: 16,
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, color: COLORS.normal, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>If Everyone Did What You Did This Week</div>
              {[
                { icon: "→", label: "Enough to power a plane for 3.2 km", sub: "Your 42.3 kWh × 50,000 households" },
                { icon: "→", label: "26 MRT train round-trips powered", sub: "Peak demand saved across the grid" },
                { icon: "→", label: "150,000 trees' worth of carbon offset", sub: "Neighbourhood-wide extrapolation" },
              ].map(c => (
                <div key={c.label} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 26, width: 36, textAlign: "center" }}>{c.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>{c.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* 2030 Goals Progress */}
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSub, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Singapore Green Plan 2030</div>
            <div style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 14,
              padding: 14,
              marginBottom: 12,
            }}>
              <p style={{ fontSize: 12, color: COLORS.textSub, margin: "0 0 12px", lineHeight: 1.6 }}>
                Your neighbourhood's collective savings are pushing Singapore closer to its 2030 goals. Each action contributes to the national target.
              </p>
              {[
                { label: "Solar Deployment (2 GWp by 2030)", pct: 64, color: COLORS.gold },
                { label: "Peak Demand Reduction (20% by 2030)", pct: 47, color: COLORS.accent },
                { label: "Carbon Neutral Buildings Goal", pct: 31, color: COLORS.green },
              ].map(g => (
                <div key={g.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11.5, color: COLORS.textSub }}>{g.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: g.color }}>{g.pct}%</span>
                  </div>
                  <div style={{ background: COLORS.cardBorder, borderRadius: 99, height: 6, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${g.pct}%`,
                      background: g.color,
                      borderRadius: 99,
                      transition: "width 1s ease",
                      boxShadow: `0 0 8px ${g.color}88`,
                    }} />
                  </div>
                </div>
              ))}

              {/* 2030 Forest Plot Visualisation */}
              <ForestPlot />
            </div>

            {/* Leaderboard */}
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSub, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Block Leaderboard · Toa Payoh</div>
            {leaderboard.map((b, i) => (
              <div key={b.block} style={{
                background: i === 0 ? "linear-gradient(135deg, #fefce8, #fef9c3)" : COLORS.card,
                border: `1px solid ${i === 0 ? COLORS.gold + "88" : COLORS.cardBorder}`,
                borderRadius: 12,
                padding: "12px 14px",
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: i === 0 ? COLORS.gold : i === 1 ? "#94a3b8" : i === 2 ? "#b45309" : COLORS.cardBorder,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 13, color: i < 3 ? "#0f172a" : COLORS.textMuted,
                  flexShrink: 0,
                }}>{b.rank}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: i === 0 ? COLORS.gold : COLORS.text }}>{b.block}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>{b.saved} kWh saved this month</div>
                </div>
                <div style={{ fontSize: 16 }}>
                  {b.trend === "up" ? "↑" : b.trend === "down" ? "↓" : "→"}
                </div>
              </div>
            ))}

            {/* Drop of Water analogy */}
            <div style={{
              marginTop: 8,
              background: "#e0f2fe",
              border: `1px solid ${COLORS.normal}33`,
              borderRadius: 14,
              padding: 14,
              textAlign: "center"
            }}>
              
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>Every drop fills the bucket</div>
              <div style={{ fontSize: 12, color: COLORS.textSub, marginTop: 4, lineHeight: 1.6 }}>
                Your 42.3 kWh saved is one drop. Toa Payoh combined: 8,460 kWh — enough to power 1,200 HDB flats for a day.
              </div>
              
            </div>
          </div>
        )}

        {/* ===== REWARDS TAB ===== */}
        {tab === "rewards" && (
          <div>
            <div style={{ fontSize: 13, color: COLORS.textSub, marginBottom: 14 }}>Your points &amp; redemptions</div>

            {/* Points Hero */}
            <div style={{
              background: "linear-gradient(135deg, #fefce8, #fef9c3)",
              border: `1.5px solid ${COLORS.gold}66`,
              borderRadius: 18, padding: 20, marginBottom: 14, textAlign: "center",
            }}>
              <div style={{ fontSize: 10, color: COLORS.gold, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Total SP Points</div>
              <div style={{ fontSize: 60, fontWeight: 900, color: COLORS.gold, lineHeight: 1.1, marginTop: 4 }}>{totalPts.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: COLORS.textSub, marginTop: 4 }}>
                {streakMultiplier > 1 ? `${streakMultiplier}× streak multiplier active` : "Build a streak to earn multipliers"}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 14 }}>
                {[
                  { label: "Day Streak", val: `${streak}d`, color: COLORS.gold },
                  { label: "Multiplier", val: `${streakMultiplier}×`, color: streak >= 7 ? COLORS.green : COLORS.gold },
                  { label: "Tasks Done", val: `${Object.keys(aiTasksDone).length}`, color: COLORS.accent },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: COLORS.textMuted }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Today's Score Breakdown */}
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSub, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Today's Score Breakdown</div>
            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 14, padding: 14, marginBottom: 14,
            }}>
              {[
                { label: "Money saved this month", pts: 420, color: COLORS.green },
                { label: `Peak hours shifted (${gridStrainDay}/7 days)`, pts: peakShiftPts, color: COLORS.accent },
                { label: `Streak bonus (${streak} days × 50 pts)`, pts: streakBonusPts, color: COLORS.gold },
                { label: "Tasks completed today", pts: todayTaskPts || 0, color: COLORS.normal },
                ...(gridStrainBonusPts > 0 ? [{ label: "Grid strain event bonus", pts: gridStrainBonusPts, color: COLORS.purple }] : []),
              ].map((s, idx, arr) => (
                <div key={s.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  paddingBottom: 10, marginBottom: 10,
                  borderBottom: `1px solid ${COLORS.cardBorder}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 3, height: 28, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: COLORS.text, lineHeight: 1.3 }}>{s.label}</span>
                  </div>
                  <span style={{ fontWeight: 800, color: s.color, fontSize: 14, flexShrink: 0, marginLeft: 8 }}>+{s.pts}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 2 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>Total Points</span>
                <span style={{ fontWeight: 900, fontSize: 22, color: COLORS.gold }}>{totalPts.toLocaleString()} pts</span>
              </div>
            </div>

            {/* Multiplier Tiers */}
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSub, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Streak Multiplier Tiers</div>
            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 14, padding: 14, marginBottom: 14,
            }}>
              {[
                { days: 3, mult: "1.2×", desc: "+20% bonus on all points", unlocked: streak >= 3 },
                { days: 5, mult: "1.5×", desc: "+50% bonus on all points", unlocked: streak >= 5 },
                { days: 7, mult: "2.0×", desc: "Double all points earned", unlocked: streak >= 7 },
              ].map(tier => (
                <div key={tier.days} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 10, marginBottom: 6,
                  background: tier.unlocked ? COLORS.gold + "11" : "#ffffff05",
                  border: `1px solid ${tier.unlocked ? COLORS.gold + "44" : COLORS.cardBorder}`,
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    background: tier.unlocked ? COLORS.gold : COLORS.cardBorder,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 900,
                    color: tier.unlocked ? "#0f172a" : COLORS.textMuted,
                  }}>{tier.unlocked ? "✓" : `D${tier.days}`}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tier.unlocked ? COLORS.gold : COLORS.textMuted }}>
                      Day {tier.days} — {tier.mult} Multiplier
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 1 }}>{tier.desc}</div>
                  </div>
                  {tier.unlocked && (
                    <div style={{
                      background: COLORS.gold + "22", border: `1px solid ${COLORS.gold}55`,
                      borderRadius: 8, padding: "3px 8px",
                      fontSize: 10, fontWeight: 700, color: COLORS.gold,
                    }}>Active</div>
                  )}
                </div>
              ))}
            </div>

            {/* Voucher Redemption */}
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSub, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>Redeem Vouchers</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              Delivered digitally to your SP app. Points are deducted on redemption.
            </div>
            {VOUCHERS.map(v => {
              const canAfford = totalPts >= v.pts;
              const redeemed = !!redeemedVouchers[v.id];
              return (
                <div key={v.id} style={{
                  background: v.bg, border: `1px solid ${redeemed ? COLORS.green + "66" : canAfford ? v.border : COLORS.cardBorder}`,
                  borderRadius: 14, padding: "14px 16px", marginBottom: 10,
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    flexShrink: 0,
                    background: v.color + "22",
                    border: `1.5px solid ${v.color}44`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    padding: 6,
                  }}
                >
                  <img
                    src={v.logo}
                    alt={v.brand}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: redeemed ? COLORS.green : v.color }}>
                      {v.brand} {v.value}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{v.desc}</div>
                    <div style={{ fontSize: 10, color: canAfford ? COLORS.gold : COLORS.textMuted, marginTop: 4, fontWeight: 700 }}>
                      {v.pts.toLocaleString()} pts{canAfford && !redeemed ? " — you can afford this!" : ""}
                    </div>
                  </div>
                  <button
                    disabled={!canAfford || redeemed}
                    onClick={() => {
                        setRedeemedVouchers(prev => ({ ...prev, [v.id]: true }));
                        setSpentPts(prev => prev + v.pts);
                      }}
                    style={{
                      padding: "8px 12px", borderRadius: 10, border: "none",
                      background: redeemed ? COLORS.green + "33" : canAfford ? v.color : COLORS.cardBorder,
                      color: redeemed ? COLORS.green : canAfford ? "#fff" : COLORS.textMuted,
                      fontWeight: 800, fontSize: 11, cursor: canAfford && !redeemed ? "pointer" : "default",
                      flexShrink: 0, lineHeight: 1.3, fontFamily: "inherit",
                      border: redeemed ? `1px solid ${COLORS.green}` : "none",
                    }}
                  >
                    {redeemed ? "Redeemed" : canAfford ? "Redeem" : "Locked"}
                  </button>
                </div>
              );
            })}

            <div style={{
              background: "#e0f2fe", border: `1px solid ${COLORS.normal}33`,
              borderRadius: 14, padding: 14, marginTop: 4, textAlign: "center",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.normal, marginBottom: 4 }}>More rewards coming</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6 }}>
                Watsons, Starbucks, Kopitiam &amp; CDC vouchers — more partnerships in the pipeline.
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Bottom Nav Glow */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 430,
        height: 60,
        background: "linear-gradient(0deg, #0f172a 60%, transparent)",
        pointerEvents: "none",
      }} />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, -46%) scale(0.9); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        * { box-sizing: border-box; }
        button { font-family: inherit; }
      `}</style>
    </div>
  );
}