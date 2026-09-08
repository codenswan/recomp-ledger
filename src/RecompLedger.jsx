import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  Flame, TrendingUp, MessageCircle,
  Settings as SettingsIcon, ClipboardList, BarChart3,
  Save, Trash2, Check, X, Loader2, Send, Activity
} from "lucide-react";

/* ---------- theme ---------- */
const THEME = {
  bg: "#171310",
  panel: "#221D17",
  panelAlt: "#1C1712",
  border: "#3A3226",
  borderSoft: "#2C2620",
  text: "#EDE3D3",
  textMuted: "#9C9080",
  accent: "#C97A2E",
  accentSoft: "#8C5A22",
  accent2: "#5B7A96",
  bad: "#A8432E",
  good: "#748A54",
};
const FONT_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO = "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace";

/* ---------- data helpers ---------- */
const DEFAULT_SETTINGS = {
  targetCalories: 2200,
  targetProtein: 192,
  targetCarb: 55,
  targetFat: 134,
  targetSteps: 10000,
  targetSleepHours: 8,
  targetBedtime: "22:30",
  startWeightKg: 140,
  phase1GoalWeightKg: 90,
};

const emptyEntry = (date) => ({
  date, weightKg: "", steps: "", calories: "", proteinG: "", carbG: "", fatG: "",
  sessionType: "rest", trainingNotes: "", bedtime: "", sleepHours: "", sleepScore: "",
  wake5: false, weights7: false, walk8: false, cutoff2: false, mindsetNote: "",
});

function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
function num(v, fallback = 0) { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; }
function avg(arr) {
  const nums = arr.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function bedtimeToMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h < 12 ? h + 24 : h) * 60 + m;
}
function minutesToClock(mins) {
  if (mins == null) return "--:--";
  let total = Math.round(mins) % 1440; if (total < 0) total += 1440;
  const h = Math.floor(total / 60) % 24, m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function computeStreak(datesDesc, entries) {
  let streak = 0, cursor = null;
  for (const d of datesDesc) {
    const e = entries[d];
    const hit = e && e.wake5 && e.weights7 && e.walk8 && e.cutoff2;
    if (cursor === null) cursor = new Date(d + "T00:00:00");
    else {
      const expected = new Date(cursor); expected.setDate(expected.getDate() - 1);
      if (expected.toISOString().slice(0, 10) !== d) break;
      cursor = expected;
    }
    if (hit) streak += 1; else break;
  }
  return streak;
}
function statColor(actual, target, type) {
  if (actual == null || !target) return THEME.textMuted;
  const tol = target * 0.05;
  if (type === "ceiling") return actual <= target + tol ? THEME.good : THEME.bad;
  return actual >= target - tol ? THEME.good : THEME.bad;
}

const SYSTEM_PROMPT = `You are Dan's personal recomposition coach, built into his own tracking app. Voice: professional, grounded, direct, no fluff, no hand-holding, no unearned affirmation. Dan uses AU/NZ vernacular; match the energy where it's natural, don't force it.

DAN: 45yo disability support worker, Inverell NSW. Ex-NSW Police records management, ex-dairy/broadacre farmer, Bachelor of Theology, ~10yrs ministry. Has a documented pattern of underselling himself in professional contexts -- counter that where relevant, but never soften honest feedback on adherence or data.

GOAL ORDER: 1) reach ~10% body fat (~89-90kg) 2) add 10kg skeletal muscle over 2-3yrs 3) return to rugby league at 45 4) build neck/explosive power 5) train for healthy ageing into his 70s-80s. This is body RECOMPOSITION (fat loss + muscle), not a race to lose weight fastest -- never default to "fastest" as the tradeoff to optimise for.

CURRENT TARGETS: calorie ceiling and macro targets are supplied each message (they get adjusted weekly against real results). Protein basis is Lean Body Mass, never total bodyweight. On non-training days calories and protein are the daily must-hits; carb/fat naturally drift lower-carb/higher-fat and that's expected, not a miss.

DAILY STRUCTURE BASELINE: 5am wake / 7am weights / 8am walk / 9am work / 2pm eating cutoff. Lift always before cardio/walks.

MEDICAL CONTEXT -- treat as serious, not a footnote: history of diverticulitis and a bowel perforation from severe constipation (hospitalised ~June 2026), linked to a prior strict low-fibre/near-zero-carb protocol. No GP in Inverell, nobody with medical training currently oversees this program -- never suggest he "check with his GP", that access doesn't exist for him. A colonoscopy in Oct 2026 is the real medical checkpoint. Default conservative yourself on anything genuinely risky (extended fasting, very low-residue eating) rather than waiting on medical sign-off that isn't coming. No scheduled fasting -- 48 hours is the cap if/when Dan opts in himself, never coach-initiated.

Sleep target is 8 hours / 10:30pm bedtime -- currently running short most nights. That's a live gap to flag plainly, not a solved problem.

Former severe nocturnal binge eater (high volume/high carb) -- the 5am wake and 2pm cutoff are structural fixes for that, not arbitrary rules.

When given logged data: give specific, evidence-grounded feedback tied to the actual numbers, never generic encouragement. Call out misses plainly. Where adherence is genuinely solid, say so plainly too, without inflating it.`;

async function askClaude(userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error("bad response");
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

/* ---------- small ui atoms ---------- */
function Panel({ children, style }) {
  return (
    <div style={{ backgroundColor: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: 16, ...style }}>
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: THEME.textMuted, display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
const inputStyle = {
  backgroundColor: THEME.panelAlt, border: `1px solid ${THEME.border}`, color: THEME.text,
  borderRadius: 4, padding: "7px 9px", fontSize: 14, width: "100%", boxSizing: "border-box",
  fontFamily: FONT_SANS,
};
const numInputStyle = { ...inputStyle, fontFamily: FONT_MONO };
function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600,
      backgroundColor: active ? THEME.panel : "transparent", color: active ? THEME.accent : THEME.textMuted,
      border: "none", borderBottom: active ? `2px solid ${THEME.accent}` : "2px solid transparent",
      cursor: "pointer", fontFamily: FONT_SANS,
    }}>
      <Icon size={14} /> {label}
    </button>
  );
}
function StatTile({ label, value, sub, color }) {
  return (
    <div style={{ backgroundColor: THEME.panelAlt, border: `1px solid ${THEME.borderSoft}`, borderRadius: 6, padding: 12, flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, color: THEME.textMuted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: FONT_MONO, color: color || THEME.text, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: THEME.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function AdherenceDot({ ok, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: THEME.textMuted }}>
      {ok ? <Check size={12} color={THEME.good} /> : <X size={12} color={THEME.bad} />}
      {label}
    </div>
  );
}

/* ---------- main component ---------- */
export default function RecompLedger() {
  const [loaded, setLoaded] = useState(false);
  const [entries, setEntries] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_SETTINGS);
  const [tab, setTab] = useState("log");
  const [form, setForm] = useState(emptyEntry(todayStr()));
  const [refOpen, setRefOpen] = useState(false);

  const [checkIn, setCheckIn] = useState("");
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInError, setCheckInError] = useState("");

  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    (async () => {
      let e = {}, s = DEFAULT_SETTINGS;
      try {
        const r = await window.storage.get("recomp:entries", false);
        if (r && r.value) e = JSON.parse(r.value);
      } catch (err) { /* nothing saved yet */ }
      try {
        const r = await window.storage.get("recomp:settings", false);
        if (r && r.value) s = { ...DEFAULT_SETTINGS, ...JSON.parse(r.value) };
      } catch (err) { /* nothing saved yet */ }
      setEntries(e); setSettings(s); setSettingsDraft(s);
      if (e[todayStr()]) setForm(e[todayStr()]);
      setLoaded(true);
    })();
  }, []);

  async function persistEntries(next) {
    setEntries(next);
    try { await window.storage.set("recomp:entries", JSON.stringify(next), false); }
    catch (err) { console.error("storage set failed", err); }
  }
  async function persistSettings(next) {
    setSettings(next);
    try { await window.storage.set("recomp:settings", JSON.stringify(next), false); }
    catch (err) { console.error("storage set failed", err); }
  }

  function updateForm(field, value) { setForm((f) => ({ ...f, [field]: value })); }
  function loadEntryForDate(date) { setForm(entries[date] || emptyEntry(date)); }
  async function saveEntry() { if (!form.date) return; await persistEntries({ ...entries, [form.date]: form }); }
  async function deleteEntry(date) {
    const next = { ...entries }; delete next[date];
    await persistEntries(next);
    if (form.date === date) setForm(emptyEntry(todayStr()));
  }

  const datesAsc = useMemo(() => Object.keys(entries).sort(), [entries]);
  const datesDesc = useMemo(() => [...datesAsc].reverse(), [datesAsc]);
  const last7 = datesDesc.slice(0, 7).map((d) => entries[d]);

  const avgCalories = avg(last7.map((e) => num(e.calories, NaN)));
  const avgProtein = avg(last7.map((e) => num(e.proteinG, NaN)));
  const avgCarb = avg(last7.map((e) => num(e.carbG, NaN)));
  const avgFat = avg(last7.map((e) => num(e.fatG, NaN)));
  const avgSteps = avg(last7.map((e) => num(e.steps, NaN)));
  const avgSleepHours = avg(last7.map((e) => num(e.sleepHours, NaN)));
  const avgBedtimeMin = avg(last7.map((e) => bedtimeToMinutes(e.bedtime)).filter((v) => v != null));

  const latestWeight = datesDesc.length ? num(entries[datesDesc[0]].weightKg, null) : null;
  const streak = computeStreak(datesDesc, entries);

  const weightSeries = datesAsc.filter((d) => entries[d].weightKg !== "")
    .map((d) => ({ date: fmtDate(d), weight: num(entries[d].weightKg) }));
  const stepsSeries = datesAsc.slice(-14).map((d) => ({ date: fmtDate(d), steps: num(entries[d].steps, 0) }));

  const progressPct = latestWeight != null
    ? Math.min(100, Math.max(0, ((settings.startWeightKg - latestWeight) / (settings.startWeightKg - settings.phase1GoalWeightKg)) * 100))
    : 0;

  async function generateCheckIn() {
    setCheckInLoading(true); setCheckInError("");
    try {
      const days = datesDesc.slice(0, 7);
      if (!days.length) { setCheckIn("No entries logged yet -- log a few days first."); setCheckInLoading(false); return; }
      const table = days.map((d) => {
        const e = entries[d];
        return `${d}: weight=${e.weightKg || "-"}kg steps=${e.steps || "-"} kcal=${e.calories || "-"} protein=${e.proteinG || "-"}g carb=${e.carbG || "-"}g fat=${e.fatG || "-"}g sleep=${e.sleepHours || "-"}h bedtime=${e.bedtime || "-"} training=${e.sessionType}${e.trainingNotes ? ` (${e.trainingNotes})` : ""} structure=[wake5:${e.wake5 ? "Y" : "N"} weights7:${e.weights7 ? "Y" : "N"} walk8:${e.walk8 ? "Y" : "N"} cutoff2:${e.cutoff2 ? "Y" : "N"}]${e.mindsetNote ? ` note:"${e.mindsetNote}"` : ""}`;
      }).join("\n");
      const summary = `Targets: ${settings.targetCalories}kcal / ${settings.targetProtein}g protein / ${settings.targetCarb}g carb / ${settings.targetFat}g fat. Steps target ${settings.targetSteps}. Sleep target ${settings.targetSleepHours}h, bedtime ${settings.targetBedtime}.\n7-day avg: kcal=${avgCalories ? avgCalories.toFixed(0) : "-"} protein=${avgProtein ? avgProtein.toFixed(0) : "-"}g carb=${avgCarb ? avgCarb.toFixed(0) : "-"}g fat=${avgFat ? avgFat.toFixed(0) : "-"}g steps=${avgSteps ? avgSteps.toFixed(0) : "-"} sleep=${avgSleepHours ? avgSleepHours.toFixed(1) : "-"}h. Structure streak: ${streak} days. Latest weight ${latestWeight ?? "-"}kg.`;
      const msg = `Here's this week's logged data:\n\n${table}\n\n${summary}\n\nGive me this week's check-in: adherence call-out, calorie/macro trend vs target and whether next week's target should shift, a training progress note, a sleep-gap flag, and a straight word on mindset/commitment based on any notes I left. Keep it tight, no filler.`;
      const text = await askClaude(msg);
      setCheckIn(text || "No response came back -- try again.");
    } catch (err) {
      setCheckInError("Couldn't reach the coach. Check your connection and try again.");
    }
    setCheckInLoading(false);
  }

  async function sendChat() {
    const q = chatInput.trim();
    if (!q) return;
    setChat((c) => [...c, { role: "user", text: q }]);
    setChatInput(""); setChatLoading(true);
    try {
      const days = datesDesc.slice(0, 3);
      const context = days.map((d) => {
        const e = entries[d];
        return `${d}: kcal=${e.calories || "-"} protein=${e.proteinG || "-"}g weight=${e.weightKg || "-"}kg sleep=${e.sleepHours || "-"}h structure=[${e.wake5 ? "Y" : "N"}${e.weights7 ? "Y" : "N"}${e.walk8 ? "Y" : "N"}${e.cutoff2 ? "Y" : "N"}]${e.mindsetNote ? ` note:"${e.mindsetNote}"` : ""}`;
      }).join("\n");
      const msg = `Recent context:\n${context || "(no entries logged yet)"}\n\nDan asks: "${q}"`;
      const text = await askClaude(msg);
      setChat((c) => [...c, { role: "coach", text: text || "No response -- try again." }]);
    } catch (err) {
      setChat((c) => [...c, { role: "coach", text: "Couldn't reach the coach just then. Try again." }]);
    }
    setChatLoading(false);
  }

  if (!loaded) {
    return (
      <div style={{ backgroundColor: THEME.bg, color: THEME.textMuted, minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_SANS }}>
        <Loader2 size={20} style={{ marginRight: 8, animation: "spin 1s linear infinite" }} />
        Loading ledger...
        <style>{"@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: THEME.bg, color: THEME.text, fontFamily: FONT_SANS, padding: 20, borderRadius: 8, minHeight: 400 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 18, borderBottom: `1px solid ${THEME.border}`, paddingBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1, color: THEME.textMuted }}>PHASE 1 -- RECOMPOSITION</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "2px 0 0", letterSpacing: -0.5 }}>Recomp Ledger</h1>
        </div>
        <div style={{ minWidth: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: THEME.textMuted, marginBottom: 4 }}>
            <span style={{ fontFamily: FONT_MONO, color: THEME.text }}>{latestWeight ?? "--"}kg</span>
            <span>{settings.phase1GoalWeightKg}kg target</span>
          </div>
          <div style={{ height: 6, backgroundColor: THEME.panelAlt, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${progressPct}%`, height: "100%", backgroundColor: THEME.accent }} />
          </div>
          <div style={{ fontSize: 11, color: THEME.textMuted, marginTop: 4 }}>{streak}-day structure streak</div>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, flexWrap: "wrap" }}>
        <TabButton active={tab === "log"} onClick={() => setTab("log")} icon={ClipboardList} label="Log" />
        <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={BarChart3} label="Dashboard" />
        <TabButton active={tab === "coach"} onClick={() => setTab("coach")} icon={MessageCircle} label="Coach" />
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={SettingsIcon} label="Settings" />
      </div>

      {/* LOG TAB */}
      {tab === "log" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <div style={{ width: 160 }}>
                <Field label="Date">
                  <input type="date" style={inputStyle} value={form.date}
                    onChange={(e) => loadEntryForDate(e.target.value)} />
                </Field>
              </div>
            </div>

            <div style={{ fontSize: 12, color: THEME.accent, fontWeight: 700, marginBottom: 8 }}>BODY &amp; INTAKE</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 16 }}>
              <Field label="Weight (kg)"><input style={numInputStyle} type="number" step="0.1" value={form.weightKg} onChange={(e) => updateForm("weightKg", e.target.value)} /></Field>
              <Field label="Steps"><input style={numInputStyle} type="number" value={form.steps} onChange={(e) => updateForm("steps", e.target.value)} /></Field>
              <Field label="Calories"><input style={numInputStyle} type="number" value={form.calories} onChange={(e) => updateForm("calories", e.target.value)} /></Field>
              <Field label="Protein (g)"><input style={numInputStyle} type="number" value={form.proteinG} onChange={(e) => updateForm("proteinG", e.target.value)} /></Field>
              <Field label="Carb (g)"><input style={numInputStyle} type="number" value={form.carbG} onChange={(e) => updateForm("carbG", e.target.value)} /></Field>
              <Field label="Fat (g)"><input style={numInputStyle} type="number" value={form.fatG} onChange={(e) => updateForm("fatG", e.target.value)} /></Field>
            </div>

            <div style={{ fontSize: 12, color: THEME.accent, fontWeight: 700, marginBottom: 8 }}>TRAINING &amp; SLEEP</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 10 }}>
              <Field label="Session">
                <select style={inputStyle} value={form.sessionType} onChange={(e) => updateForm("sessionType", e.target.value)}>
                  <option value="lower">Lower</option>
                  <option value="upper">Upper</option>
                  <option value="neck">Neck circuit</option>
                  <option value="rest">Rest</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Bedtime"><input style={numInputStyle} type="time" value={form.bedtime} onChange={(e) => updateForm("bedtime", e.target.value)} /></Field>
              <Field label="Sleep (hrs)"><input style={numInputStyle} type="number" step="0.1" value={form.sleepHours} onChange={(e) => updateForm("sleepHours", e.target.value)} /></Field>
              <Field label="Sleep score"><input style={numInputStyle} type="number" value={form.sleepScore} onChange={(e) => updateForm("sleepScore", e.target.value)} /></Field>
            </div>
            <div style={{ marginBottom: 16 }}>
              <Field label="Training notes (lifts, weights, reps)">
                <input style={inputStyle} value={form.trainingNotes} placeholder="e.g. RDL 50kg x6, top of range"
                  onChange={(e) => updateForm("trainingNotes", e.target.value)} />
              </Field>
            </div>

            <div style={{ fontSize: 12, color: THEME.accent, fontWeight: 700, marginBottom: 8 }}>DAILY STRUCTURE</div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
              {[["wake5", "5am wake"], ["weights7", "7am weights"], ["walk8", "8am walk"], ["cutoff2", "2pm cutoff"]].map(([k, label]) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form[k]} onChange={(e) => updateForm(k, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>

            <div style={{ fontSize: 12, color: THEME.accent, fontWeight: 700, marginBottom: 8 }}>MINDSET NOTE</div>
            <textarea style={{ ...inputStyle, minHeight: 60, marginBottom: 16, fontFamily: FONT_SANS }}
              placeholder="Cravings, urges, wins, how the head's at today..."
              value={form.mindsetNote} onChange={(e) => updateForm("mindsetNote", e.target.value)} />

            <button onClick={saveEntry} style={{
              display: "flex", alignItems: "center", gap: 6, backgroundColor: THEME.accent, color: "#1A1410",
              border: "none", borderRadius: 4, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              <Save size={14} /> Save entry
            </button>
          </Panel>

          <Panel>
            <div style={{ fontSize: 12, color: THEME.textMuted, fontWeight: 700, marginBottom: 10 }}>RECENT ENTRIES</div>
            {datesDesc.length === 0 && <div style={{ color: THEME.textMuted, fontSize: 13 }}>Nothing logged yet -- fill in today's entry above to start the ledger.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {datesDesc.slice(0, 14).map((d) => {
                const e = entries[d];
                return (
                  <div key={d} style={{
                    display: "flex", alignItems: "center", gap: 14, fontSize: 12, fontFamily: FONT_MONO,
                    padding: "6px 8px", backgroundColor: THEME.panelAlt, borderRadius: 4, flexWrap: "wrap",
                  }}>
                    <span style={{ width: 70, fontWeight: 700 }}>{fmtDate(d)}</span>
                    <span style={{ color: THEME.textMuted }}>{e.weightKg || "-"}kg</span>
                    <span style={{ color: THEME.textMuted }}>{e.calories || "-"}kcal</span>
                    <span style={{ color: THEME.textMuted }}>{e.proteinG || "-"}g pro</span>
                    <span style={{ color: THEME.textMuted }}>{e.steps || "-"} steps</span>
                    <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                      <AdherenceDot ok={e.wake5} label="5a" />
                      <AdherenceDot ok={e.weights7} label="7a" />
                      <AdherenceDot ok={e.walk8} label="8a" />
                      <AdherenceDot ok={e.cutoff2} label="2p" />
                    </div>
                    <button onClick={() => loadEntryForDate(d)} style={{ background: "none", border: "none", color: THEME.accent2, cursor: "pointer", fontSize: 11, fontFamily: FONT_SANS }}>edit</button>
                    <button onClick={() => deleteEntry(d)} style={{ background: "none", border: "none", color: THEME.bad, cursor: "pointer" }}><Trash2 size={13} /></button>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}

      {/* DASHBOARD TAB */}
      {tab === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {datesDesc.length === 0 ? (
            <Panel><div style={{ color: THEME.textMuted, fontSize: 13 }}>No data yet -- log a few days on the Log tab and this fills in.</div></Panel>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <StatTile label="7d avg kcal" value={avgCalories ? avgCalories.toFixed(0) : "--"} sub={`target ${settings.targetCalories}`} color={statColor(avgCalories, settings.targetCalories, "ceiling")} />
                <StatTile label="7d avg protein" value={avgProtein ? avgProtein.toFixed(0) + "g" : "--"} sub={`target ${settings.targetProtein}g`} color={statColor(avgProtein, settings.targetProtein, "floor")} />
                <StatTile label="7d avg steps" value={avgSteps ? avgSteps.toFixed(0) : "--"} sub={`target ${settings.targetSteps}`} color={statColor(avgSteps, settings.targetSteps, "floor")} />
                <StatTile label="7d avg sleep" value={avgSleepHours ? avgSleepHours.toFixed(1) + "h" : "--"} sub={`target ${settings.targetSleepHours}h, bed ${minutesToClock(avgBedtimeMin)}`} color={statColor(avgSleepHours, settings.targetSleepHours, "floor")} />
                <StatTile label="Structure streak" value={streak} sub="consecutive days, all 4 hit" color={streak > 0 ? THEME.good : THEME.bad} />
              </div>

              <Panel>
                <div style={{ fontSize: 12, color: THEME.textMuted, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <TrendingUp size={14} /> WEIGHT TREND
                </div>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={weightSeries}>
                      <CartesianGrid stroke={THEME.borderSoft} strokeDasharray="3 3" />
                      <XAxis dataKey="date" stroke={THEME.textMuted} fontSize={11} />
                      <YAxis stroke={THEME.textMuted} fontSize={11} domain={["dataMin - 2", "dataMax + 2"]} />
                      <Tooltip contentStyle={{ backgroundColor: THEME.panelAlt, border: `1px solid ${THEME.border}`, fontSize: 12 }} />
                      <ReferenceLine y={settings.phase1GoalWeightKg} stroke={THEME.accent} strokeDasharray="4 4" label={{ value: "goal", fill: THEME.accent, fontSize: 11 }} />
                      <Line type="monotone" dataKey="weight" stroke={THEME.accent2} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel>
                <div style={{ fontSize: 12, color: THEME.textMuted, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <Activity size={14} /> STEPS (LAST 14 DAYS)
                </div>
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer>
                    <BarChart data={stepsSeries}>
                      <CartesianGrid stroke={THEME.borderSoft} strokeDasharray="3 3" />
                      <XAxis dataKey="date" stroke={THEME.textMuted} fontSize={11} />
                      <YAxis stroke={THEME.textMuted} fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: THEME.panelAlt, border: `1px solid ${THEME.border}`, fontSize: 12 }} />
                      <ReferenceLine y={settings.targetSteps} stroke={THEME.accent} strokeDasharray="4 4" />
                      <Bar dataKey="steps" fill={THEME.accentSoft} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <StatTile label="7d avg carb" value={avgCarb ? avgCarb.toFixed(0) + "g" : "--"} sub={`target ${settings.targetCarb}g`} color={statColor(avgCarb, settings.targetCarb, "ceiling")} />
                <StatTile label="7d avg fat" value={avgFat ? avgFat.toFixed(0) + "g" : "--"} sub={`target ${settings.targetFat}g`} color={statColor(avgFat, settings.targetFat, "ceiling")} />
              </div>
            </>
          )}
        </div>
      )}

      {/* COACH TAB */}
      {tab === "coach" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: THEME.textMuted, fontWeight: 700 }}>WEEKLY CHECK-IN</div>
              <button onClick={generateCheckIn} disabled={checkInLoading} style={{
                display: "flex", alignItems: "center", gap: 6, backgroundColor: THEME.accent, color: "#1A1410",
                border: "none", borderRadius: 4, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
                opacity: checkInLoading ? 0.6 : 1,
              }}>
                {checkInLoading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Flame size={13} />}
                {checkInLoading ? "Generating..." : "Generate check-in"}
              </button>
            </div>
            {checkInError && <div style={{ color: THEME.bad, fontSize: 13, marginBottom: 8 }}>{checkInError}</div>}
            {checkIn ? (
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55, color: THEME.text }}>{checkIn}</div>
            ) : (
              <div style={{ color: THEME.textMuted, fontSize: 13 }}>Generates a review of the last 7 logged days against your current targets -- adherence, macros, training, sleep, mindset.</div>
            )}
          </Panel>

          <Panel>
            <div style={{ fontSize: 12, color: THEME.textMuted, fontWeight: 700, marginBottom: 12 }}>ASK YOUR COACH</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, maxHeight: 320, overflowY: "auto" }}>
              {chat.length === 0 && <div style={{ color: THEME.textMuted, fontSize: 13 }}>Cravings hitting? Head not in it today? Ask straight -- it answers from your last few days of logged data.</div>}
              {chat.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  backgroundColor: m.role === "user" ? THEME.accentSoft : THEME.panelAlt,
                  color: THEME.text, padding: "8px 12px", borderRadius: 6, maxWidth: "85%",
                  fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5,
                }}>
                  {m.text}
                </div>
              ))}
              {chatLoading && <div style={{ color: THEME.textMuted, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> thinking...</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={chatInput} placeholder="Type here..."
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} />
              <button onClick={sendChat} disabled={chatLoading} style={{
                backgroundColor: THEME.accent, color: "#1A1410", border: "none", borderRadius: 4,
                padding: "0 14px", cursor: "pointer", display: "flex", alignItems: "center",
              }}>
                <Send size={14} />
              </button>
            </div>
          </Panel>
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel>
            <div style={{ fontSize: 12, color: THEME.accent, fontWeight: 700, marginBottom: 12 }}>ACTIVE TARGETS</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
              <Field label="Calories"><input style={numInputStyle} type="number" value={settingsDraft.targetCalories} onChange={(e) => setSettingsDraft((s) => ({ ...s, targetCalories: e.target.value }))} /></Field>
              <Field label="Protein (g)"><input style={numInputStyle} type="number" value={settingsDraft.targetProtein} onChange={(e) => setSettingsDraft((s) => ({ ...s, targetProtein: e.target.value }))} /></Field>
              <Field label="Carb (g)"><input style={numInputStyle} type="number" value={settingsDraft.targetCarb} onChange={(e) => setSettingsDraft((s) => ({ ...s, targetCarb: e.target.value }))} /></Field>
              <Field label="Fat (g)"><input style={numInputStyle} type="number" value={settingsDraft.targetFat} onChange={(e) => setSettingsDraft((s) => ({ ...s, targetFat: e.target.value }))} /></Field>
              <Field label="Steps"><input style={numInputStyle} type="number" value={settingsDraft.targetSteps} onChange={(e) => setSettingsDraft((s) => ({ ...s, targetSteps: e.target.value }))} /></Field>
              <Field label="Sleep hrs"><input style={numInputStyle} type="number" step="0.1" value={settingsDraft.targetSleepHours} onChange={(e) => setSettingsDraft((s) => ({ ...s, targetSleepHours: e.target.value }))} /></Field>
              <Field label="Bedtime"><input style={numInputStyle} type="time" value={settingsDraft.targetBedtime} onChange={(e) => setSettingsDraft((s) => ({ ...s, targetBedtime: e.target.value }))} /></Field>
              <Field label="Start weight (kg)"><input style={numInputStyle} type="number" value={settingsDraft.startWeightKg} onChange={(e) => setSettingsDraft((s) => ({ ...s, startWeightKg: e.target.value }))} /></Field>
              <Field label="Phase 1 goal (kg)"><input style={numInputStyle} type="number" value={settingsDraft.phase1GoalWeightKg} onChange={(e) => setSettingsDraft((s) => ({ ...s, phase1GoalWeightKg: e.target.value }))} /></Field>
            </div>
            <button onClick={() => persistSettings({
              targetCalories: num(settingsDraft.targetCalories, DEFAULT_SETTINGS.targetCalories),
              targetProtein: num(settingsDraft.targetProtein, DEFAULT_SETTINGS.targetProtein),
              targetCarb: num(settingsDraft.targetCarb, DEFAULT_SETTINGS.targetCarb),
              targetFat: num(settingsDraft.targetFat, DEFAULT_SETTINGS.targetFat),
              targetSteps: num(settingsDraft.targetSteps, DEFAULT_SETTINGS.targetSteps),
              targetSleepHours: num(settingsDraft.targetSleepHours, DEFAULT_SETTINGS.targetSleepHours),
              targetBedtime: settingsDraft.targetBedtime,
              startWeightKg: num(settingsDraft.startWeightKg, DEFAULT_SETTINGS.startWeightKg),
              phase1GoalWeightKg: num(settingsDraft.phase1GoalWeightKg, DEFAULT_SETTINGS.phase1GoalWeightKg),
            })} style={{
              display: "flex", alignItems: "center", gap: 6, backgroundColor: THEME.accent, color: "#1A1410",
              border: "none", borderRadius: 4, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              <Save size={14} /> Save targets
            </button>
          </Panel>

          <Panel>
            <button onClick={() => setRefOpen((v) => !v)} style={{ background: "none", border: "none", color: THEME.accent2, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0 }}>
              {refOpen ? "hide" : "show"} protocol reference
            </button>
            {refOpen && (
              <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7, color: THEME.textMuted, fontFamily: FONT_MONO }}>
                Rump steak, cooked: 30.0g protein / 7.0g fat / 184kcal per 100g<br />
                Lean mince (~90/10), cooked: 26.8g protein / 10.3g fat / 205kcal per 100g<br />
                Egg (large, home-produced): ~6.35g protein / 5.15g fat / 0.7g carb / 69.5kcal each<br />
                Lamb, cooked: 27.0g protein / 16.0g fat / 255kcal per 100g<br />
                <br />
                Standard meal (250g rump + 4 eggs): ~100g protein / 38g fat / ~3g carb / ~740kcal<br />
                Standard meal (300g mince + 4 eggs): ~106g protein / 52g fat / ~3g carb / ~893kcal<br />
                <br />
                Protein basis: Lean Body Mass (~80.4kg), 2.3-3.1g/kg LBM per ISSN natural bodybuilding position stand -- Dan's profile (~35% BF, moderate deficit) sits low-mid range.
              </div>
            )}
          </Panel>

          <Panel>
            <div style={{ fontSize: 12, color: THEME.bad, fontWeight: 700, marginBottom: 10 }}>DANGER ZONE</div>
            <button onClick={async () => {
              if (window.confirm("Clear every logged entry? This can't be undone.")) {
                await persistEntries({});
              }
            }} style={{
              display: "flex", alignItems: "center", gap: 6, backgroundColor: "transparent", color: THEME.bad,
              border: `1px solid ${THEME.bad}`, borderRadius: 4, padding: "8px 14px", fontSize: 12, cursor: "pointer",
            }}>
              <Trash2 size={13} /> Clear all logged entries
            </button>
          </Panel>
        </div>
      )}
    </div>
  );
}
