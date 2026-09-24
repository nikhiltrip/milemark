import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Activity,
  Footprints,
  Flag,
  LayoutDashboard,
  CalendarDays,
  Heart,
  Settings2,
  Plus,
  X,
  Check,
  Download,
  Upload,
  RefreshCw,
  Link,
  Moon,
  ExternalLink,
  Mountain,
  CircleHelp,
  Menu,
} from "lucide-react";
import {
  day,
  shift,
  generatePlan,
  history,
  recovery,
  prediction,
  trainingBase,
  pace,
  formatTime,
  exportCalendar,
  validate,
} from "./engine";
import {
  defaultSettings,
  demoSettings,
  demoSnapshot,
  today,
  readStored,
  saveStored,
  normalizeImport,
  download,
} from "./data";
import type { Snapshot, Settings, Run, Wellness } from "./types";
import "./styles.css";
import { upcomingRaces } from "./races";

const EMPTY: Snapshot = { runs: [], wellness: [] };
const dateLabel = (
  date: string,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) => day(date).toLocaleDateString("en-US", opts);
function App() {
  const [mode, setMode] = useState<"demo" | "personal">("demo");
  const [personal, setPersonal] = useState<Snapshot>(() => {
    try {
      return normalizeImport(readStored("milemark-data-v1", EMPTY));
    } catch {
      return EMPTY;
    }
  });
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = readStored("milemark-settings-v1", defaultSettings);
    return validate(saved).length ? defaultSettings : saved;
  });
  const [view, setView] = useState("Overview");
  const [modal, setModal] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(false);
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [weekIndex, setWeekIndex] = useState(0);
  const [chartRange, setChartRange] = useState(8);
  const [selectedDay, setSelectedDay] = useState(today);
  const [mobile, setMobile] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const snapshot = mode === "demo" ? demoSnapshot() : personal;
  const config = mode === "demo" ? demoSettings : settings;
  const plan = generatePlan(config);
  const week = plan.weeks[Math.min(weekIndex, plan.weeks.length - 1)];
  const wellness = [...snapshot.wellness].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const signals = recovery(wellness[0]);
  const pred = prediction(config, snapshot);
  const hist = history(snapshot);
  const currentRuns = snapshot.runs.filter(
    (r) => r.date >= week.start && r.date <= shift(week.start, 6),
  );
  const recentRuns = [...snapshot.runs].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const distance = currentRuns.reduce((sum, r) => sum + r.distanceKm, 0);
  const lastWeek = hist[6].km;
  const session =
    week.sessions.find((s) => s.date === selectedDay) ||
    week.sessions.find((s) => s.date === today) ||
    week.sessions[0];
  const adjust =
    session.date === today &&
    signals.factor < 1 &&
    session.kind !== "Race" &&
    session.km > 0;
  const todayKm = adjust
    ? Math.round(session.km * signals.factor * 10) / 10
    : session.km;
  const daysUntil = Math.ceil(
    (day(config.raceDate).getTime() - day(today).getTime()) / 86400000,
  );

  useEffect(() => {
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.local) {
          setLocal(true);
          setToken(data.token);
          setConnected(data.connected);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!saveStored("milemark-data-v1", personal))
      setError(
        "Browser storage is unavailable. Export your data before closing this page.",
      );
  }, [personal]);
  useEffect(() => {
    saveStored("milemark-settings-v1", settings);
  }, [settings]);
  useEffect(() => {
    if (modal) {
      opener.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      opener.current?.focus();
    }
    setError("");
  }, [modal]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function api(path: string, body?: unknown) {
    const response = await fetch(`/api/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Milemark-Token": token,
      },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Request failed.");
    return data;
  }
  async function sync() {
    setBusy(true);
    setError("");
    try {
      const data = normalizeImport(await api("garmin/sync"));
      setPersonal(data);
      setMode("personal");
      setConnected(true);
      setModal(null);
      setNotice(
        `Imported ${data.runs.length} runs. Recovery availability depends on your watch.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function personalMode() {
    setMode("personal");
    setWeekIndex(0);
    setSelectedDay(today);
    if (!personal.runs.length) setModal("setup");
  }
  function go(v: string) {
    setView(v);
    setMobile(false);
    if (v === "Overview") {
      setWeekIndex(0);
      setSelectedDay(today);
    }
  }
  function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const value: Settings = {
      raceName: String(f.get("raceName")).trim() || "My marathon",
      raceDate: String(f.get("raceDate")),
      goalMinutes: Number(f.get("hours")) * 60 + Number(f.get("minutes")),
      days: Number(f.get("days")),
      weeklyKm: Number(f.get("weeklyKm")),
      longestKm: Number(f.get("longestKm")),
      recentRaceKm: Number(f.get("recentRaceKm")),
      recentRaceMinutes: Number(f.get("recentRaceMinutes")),
    };
    const errors = validate(value);
    if (errors.length) {
      setError(errors.join(" "));
      return;
    }
    try {
      generatePlan(value);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setSettings(value);
    setMode("personal");
    setWeekIndex(0);
    setModal(null);
    setNotice("Your training plan is ready.");
  }
  function addRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const run: Run = {
      id: crypto.randomUUID(),
      date: String(f.get("date")),
      name: String(f.get("name")).trim() || "My run",
      distanceKm: Number(f.get("distance")),
      durationSec: Number(f.get("duration")) * 60,
      avgHr: f.get("heart") ? Number(f.get("heart")) : null,
      race: f.get("race") === "on",
    };
    if (run.date > today) {
      setError("Log completed runs on or before today.");
      return;
    }
    try {
      normalizeImport({ runs: [run], wellness: [] });
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setPersonal((p) => ({ ...p, runs: [run, ...p.runs] }));
    setMode("personal");
    setModal(null);
    setNotice("Run added to your journal.");
  }
  function checkin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const value = (key: string) =>
      f.get(key) === "" ? null : Number(f.get(key));
    const w: Wellness = {
      date: today,
      sleepHours: value("sleepHours"),
      sleepScore: value("sleepScore"),
      hrvMs: value("hrvMs"),
      hrvBaselineLow: value("hrvBaselineLow"),
      hrvBaselineHigh: value("hrvBaselineHigh"),
    };
    try {
      normalizeImport({ runs: [], wellness: [w] });
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (
      w.hrvBaselineHigh != null &&
      w.hrvBaselineLow != null &&
      w.hrvBaselineHigh < w.hrvBaselineLow
    ) {
      setError("HRV upper baseline must be above its lower baseline.");
      return;
    }
    setPersonal((p) => ({
      ...p,
      wellness: [w, ...p.wellness.filter((x) => x.date !== today)],
    }));
    setMode("personal");
    setModal(null);
    setNotice("Recovery check-in saved.");
  }
  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000)
        throw new Error("Choose a JSON export under 5 MB.");
      const value = normalizeImport(JSON.parse(await file.text()));
      setPersonal(value);
      setMode("personal");
      setModal(null);
      setNotice(
        `Imported ${value.runs.length} runs. Import replaces this browser’s journal.`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
    event.target.value = "";
  }
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    try {
      if (mfa) {
        await api("garmin/mfa", { code: f.get("code") });
        setMfa(false);
        setConnected(true);
        setNotice("Garmin connected. Sync to import your runs.");
      } else {
        const data = await api("garmin/login", {
          email: f.get("email"),
          password: f.get("password"),
        });
        (event.target as HTMLFormElement).reset();
        setMfa(data.needsMfa);
        if (!data.needsMfa) {
          setConnected(true);
          setNotice("Garmin connected. Sync to import your runs.");
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const runTable = (limit?: number) => (
    <div className="run-table">
      {recentRuns.length ? (
        <>
          <div className="table-label">
            <span>ACTIVITY</span>
            <span>DISTANCE</span>
            <span>PACE /KM</span>
            <span>TIME</span>
          </div>
          {recentRuns.slice(0, limit).map((r) => (
            <div className="run-row" key={r.id}>
              <div className="run-title">
                <span className="run-icon">
                  <Footprints size={18} />
                </span>
                <div>
                  <strong>
                    {r.name}
                    {r.race && <span className="race-badge">RACE</span>}
                  </strong>
                  <small>
                    {dateLabel(r.date, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {r.avgHr ? ` · ${Math.round(r.avgHr)} bpm` : ""}
                  </small>
                </div>
              </div>
              <b>
                {r.distanceKm.toFixed(1)} <small>km</small>
              </b>
              <b>{pace(r.durationSec / r.distanceKm)}</b>
              <b>
                {Math.floor(r.durationSec / 60)}
                <small>m</small>
              </b>
            </div>
          ))}
        </>
      ) : (
        <div className="empty">
          <Footprints />
          <h3>Your first mile starts here.</h3>
          <p>Connect Garmin or log a run to bring your journal to life.</p>
          <button className="btn primary" onClick={() => setModal("run")}>
            Log a run <Plus size={16} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("Overview");
          }}
        >
          <span className="brandmark">
            <i />
            <i />
            <i />
          </span>
          milemark<span className="brand-dot">®</span>
        </a>
        <div className="side-label">YOUR RUNNING JOURNAL</div>
        <nav aria-label="Main navigation">
          {[
            [LayoutDashboard, "Overview"],
            [CalendarDays, "Training plan"],
            [Footprints, "Run journal"],
            [Heart, "Recovery"],
          ].map(([Icon, label]) => (
            <button
              key={String(label)}
              className={view === label ? "active" : ""}
              onClick={() => go(String(label))}
            >
              {React.createElement(Icon as typeof Activity, {
                size: 19,
                strokeWidth: 1.6,
              })}
              <span>{String(label)}</span>
              {view === label && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="side-race">
          <Flag size={21} />
          <span>THE NEXT START LINE</span>
          <h3>{config.raceName}</h3>
          <p>
            {dateLabel(config.raceDate, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <div>
            <b>{daysUntil}</b>
            <span>days to go</span>
          </div>
          <button onClick={() => setModal("setup")}>
            Edit your goal <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="side-bottom">
          <button onClick={() => setModal("connect")}>
            <Link size={17} />
            Connections <ArrowUpRight size={14} />
          </button>
          <button onClick={() => setModal("about")}>
            <CircleHelp size={17} />
            How Milemark works
          </button>
          <div className="athlete">
            <span className="avatar">{mode === "demo" ? "M" : "Y"}</span>
            <div>
              <strong>
                {mode === "demo" ? "The sample runner" : "Your training"}
              </strong>
              <small>
                {mode === "demo"
                  ? "Explore at your pace"
                  : "Stored on this device"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="header-left">
            <button
              className="icon-btn mobile-menu"
              aria-label="Toggle menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={21} />
            </button>
            <span>
              Training / <b>{view}</b>
            </span>
          </div>
          <div className="header-actions">
            <span className="date-today">
              {dateLabel(today, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <button className="btn small" onClick={() => setModal("connect")}>
              <span className={`status-dot ${connected ? "online" : ""}`} />
              {connected ? "Garmin connected" : "Connect Garmin"}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </header>
        <div className="page-content">
          <div className="mode-bar">
            <span>
              <span className="status-dot" />
              {mode === "demo"
                ? "SAMPLE JOURNAL · All metrics are illustrative"
                : "PERSONAL JOURNAL · Your data stays on this device"}
            </span>
            <button
              onClick={() =>
                mode === "demo" ? personalMode() : setMode("demo")
              }
            >
              {mode === "demo" ? "Start my training" : "Explore demo"}{" "}
              <ArrowRight size={14} />
            </button>
          </div>
          <section className="page-heading">
            <div>
              <div className="eyebrow">ONE RUN AT A TIME.</div>
              <h1>
                {view === "Overview"
                  ? "The long game."
                  : view === "Training plan"
                    ? "A little more, over time."
                    : view === "Run journal"
                      ? "Every mile counts."
                      : "Listen. Then run."}
              </h1>
              <p>
                {view === "Overview"
                  ? "A clear view of where you are. A thoughtful plan for where you’re going."
                  : view === "Training plan"
                    ? "Build the base. Make room for recovery. Arrive ready."
                    : view === "Run journal"
                      ? "The early starts, the easy days, the miles you showed up for."
                      : "Sleep, HRV, and how you feel — with room for the whole picture."}
              </p>
            </div>
            <button
              className="btn primary"
              onClick={() => setModal(view === "Recovery" ? "checkin" : "run")}
            >
              {view === "Recovery" ? "Add check-in" : "Log a run"}
              <Plus size={17} />
            </button>
          </section>
          {mode === "personal" && snapshot.warnings?.length ? (
            <details className="callout">
              <summary>
                Some imported recovery data is unavailable (
                {snapshot.warnings.length} notices)
              </summary>
              {snapshot.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </details>
          ) : null}
          {notice && (
            <div className="toast" role="status">
              <Check size={16} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {error && !modal && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {view === "Overview" && (
            <>
              <div className="hero-grid">
                <section className="hero">
                  <div className="hero-top">
                    <span className="eyebrow">YOUR NEXT CHAPTER</span>
                    <span className="outline-pill">42.195 KM</span>
                  </div>
                  <div className="hero-inner">
                    <div>
                      <h2>
                        A start line.
                        <br />A thousand
                        <br />
                        <em>small steps.</em>
                      </h2>
                      <p>{config.raceName}</p>
                      <button
                        onClick={() => {
                          go("Training plan");
                          setWeekIndex(0);
                        }}
                      >
                        See your training plan <ArrowUpRight size={18} />
                      </button>
                    </div>
                    <div className="track-art" aria-hidden="true">
                      <svg viewBox="0 0 280 300">
                        <path d="M140 30 C260 30 270 260 140 260 C10 260 20 30 140 30Z" />
                        <path d="M140 51 C234 51 247 239 140 239 C33 239 46 51 140 51Z" />
                        <path d="M140 72 C210 72 224 218 140 218 C56 218 70 72 140 72Z" />
                        <path d="M140 93 C188 93 201 197 140 197 C79 197 92 93 140 93Z" />
                        <path
                          className="track-highlight"
                          d="M140 51 C234 51 247 239 140 239 C89 239 65 200 62 159"
                        />
                        <circle cx="62" cy="159" r="6" fill="#ff6b2b" />
                        <text x="140" y="151" textAnchor="middle">
                          {daysUntil}
                        </text>
                        <text
                          className="track-caption"
                          x="140"
                          y="173"
                          textAnchor="middle"
                        >
                          DAYS TO RACE
                        </text>
                      </svg>
                      <span>THE FINISH IS IN THE EVERYDAY.</span>
                    </div>
                  </div>
                  <div className="hero-bottom">
                    <span>
                      <i /> {week.phase.toUpperCase()} PHASE
                    </span>
                    <span>
                      GOAL <b>{formatTime(config.goalMinutes)}</b>
                    </span>
                  </div>
                </section>
                <section className="workout-card">
                  <div className="section-top">
                    <span className="eyebrow">
                      {session.date === today
                        ? "TODAY’S PLAN"
                        : dateLabel(session.date).toUpperCase()}
                    </span>
                    <span className="circle-arrow">
                      <ArrowUpRight size={18} />
                    </span>
                  </div>
                  <div className="workout-symbol">
                    <Footprints size={29} strokeWidth={1.3} />
                  </div>
                  <h2>
                    {adjust
                      ? "Easy effort"
                      : session.kind === "Rest"
                        ? "A little room to recover."
                        : session.kind}
                  </h2>
                  <p>
                    {session.kind === "Rest"
                      ? "Rest is part of the work. Let the miles settle."
                      : adjust
                        ? "Recovery signals suggest keeping today lighter."
                        : session.note}
                  </p>
                  <div className="workout-stats">
                    <div>
                      <b>{todayKm ? todayKm.toFixed(1) : "—"}</b>
                      <span>kilometers</span>
                    </div>
                    <div>
                      <b>
                        {session.kind === "Race"
                          ? pace((config.goalMinutes * 60) / 42.195)
                          : "Easy"}
                      </b>
                      <span>
                        {session.kind === "Race" ? "goal pace /km" : "by feel"}
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn full"
                    onClick={() => go("Training plan")}
                  >
                    View the week <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              <section className="metrics-grid" aria-label="Training summary">
                <article>
                  <span className="metric-label">
                    THIS WEEK <Activity size={15} />
                  </span>
                  <div className="metric-value">
                    {distance.toFixed(1)}
                    <span>km</span>
                  </div>
                  <small>
                    {currentRuns.length} runs logged · {week.km.toFixed(1)} km
                    planned
                  </small>
                </article>
                <article>
                  <span className="metric-label">
                    LAST WEEK <Footprints size={15} />
                  </span>
                  <div className="metric-value">
                    {lastWeek.toFixed(1)}
                    <span>km</span>
                  </div>
                  <small>From your recorded activities</small>
                </article>
                <article>
                  <span className="metric-label">
                    MARATHON ESTIMATE <Flag size={15} />
                  </span>
                  <div className="metric-value">
                    {pred ? formatTime(pred.minutes) : "—"}
                    <span>{pred ? "hr:min" : "no race yet"}</span>
                  </div>
                  <small>
                    {pred
                      ? `From ${pred.source.toLowerCase()}`
                      : "Add a recent race in your goal settings"}
                  </small>
                </article>
                <article>
                  <span className="metric-label">
                    RECOVERY SIGNALS <Heart size={15} />
                  </span>
                  <div className={`recovery-value ${signals.tone}`}>
                    {signals.label}
                  </div>
                  <small>
                    {wellness[0]
                      ? dateLabel(wellness[0].date)
                      : "No check-in yet"}{" "}
                    ·{" "}
                    <button
                      className="inline-link"
                      onClick={() => go("Recovery")}
                    >
                      See why ↗
                    </button>
                  </small>
                </article>
              </section>
              <div className="lower-grid">
                <section className="panel mileage">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">
                        CONSISTENCY OVER EVERYTHING
                      </span>
                      <h2>The miles add up.</h2>
                    </div>
                    <div className="segmented" aria-label="Chart time range">
                      {[4, 8].map((n) => (
                        <button
                          key={n}
                          className={chartRange === n ? "selected" : ""}
                          onClick={() => setChartRange(n)}
                        >
                          {n}W
                        </button>
                      ))}
                    </div>
                  </div>
                  <MileageChart values={hist.slice(-chartRange)} />
                  <div className="chart-footer">
                    <span>
                      <i /> Weekly distance
                    </span>
                    <span>Recorded runs · kilometers</span>
                  </div>
                </section>
                <section className="panel recovery-preview">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">
                        THE OTHER HALF OF TRAINING
                      </span>
                      <h2>Recovery, in view.</h2>
                    </div>
                    <Moon size={19} />
                  </div>
                  <RecoveryRow
                    label="Sleep"
                    value={
                      wellness[0]?.sleepHours != null
                        ? `${wellness[0].sleepHours.toFixed(1)} h`
                        : "—"
                    }
                    detail={
                      wellness[0]?.sleepScore != null
                        ? `Score ${wellness[0].sleepScore} / 100`
                        : "No sleep data"
                    }
                    bars={wellness
                      .slice(0, 12)
                      .reverse()
                      .map((w) => w.sleepHours ?? 0)}
                  />
                  <RecoveryRow
                    label="Overnight HRV"
                    value={
                      wellness[0]?.hrvMs != null
                        ? `${wellness[0].hrvMs} ms`
                        : "—"
                    }
                    detail={
                      wellness[0]?.hrvBaselineLow != null
                        ? `Personal range ${wellness[0].hrvBaselineLow}–${wellness[0].hrvBaselineHigh ?? "…"} ms`
                        : "Personal baseline unavailable"
                    }
                    bars={wellness
                      .slice(0, 12)
                      .reverse()
                      .map((w) => (w.hrvMs ?? 0) / 8)}
                  />
                  <button className="text-arrow" onClick={() => go("Recovery")}>
                    Understand your signals <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              <section className="panel journal-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">FEET ON THE GROUND</span>
                    <h2>Recent runs</h2>
                  </div>
                  <button
                    className="text-arrow"
                    onClick={() => go("Run journal")}
                  >
                    All activities <ArrowUpRight size={16} />
                  </button>
                </div>
                {runTable(4)}
              </section>
            </>
          )}

          {view === "Training plan" && (
            <>
              <section className="plan-summary">
                <div>
                  <span className="eyebrow">
                    {config.raceName.toUpperCase()}
                  </span>
                  <h2>{plan.weeks.length} weeks. One finish line.</h2>
                  <p>
                    {config.days} running days · starting at {config.weeklyKm}{" "}
                    km/week · {formatTime(config.goalMinutes)} goal
                  </p>
                </div>
                <div className="actions">
                  <button className="btn" onClick={() => setModal("setup")}>
                    <Settings2 size={16} />
                    Edit goal
                  </button>
                  <button
                    className="btn primary"
                    onClick={() =>
                      download(
                        "milemark-training.ics",
                        exportCalendar(plan.weeks),
                        "text/calendar",
                      )
                    }
                  >
                    Export calendar <Download size={16} />
                  </button>
                </div>
              </section>
              {plan.warnings.map((w) => (
                <p className="callout" key={w}>
                  {w}
                </p>
              ))}
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">{week.phase.toUpperCase()}</span>
                    <h2>
                      Week {weekIndex + 1}{" "}
                      <small>
                        · {dateLabel(week.start)} –{" "}
                        {dateLabel(shift(week.start, 6))}
                      </small>
                    </h2>
                  </div>
                  <div className="actions">
                    <button
                      aria-label="Previous week"
                      className="icon-btn"
                      disabled={weekIndex === 0}
                      onClick={() => setWeekIndex((i) => i - 1)}
                    >
                      <ChevronLeft />
                    </button>
                    <button
                      aria-label="Next week"
                      className="icon-btn"
                      disabled={weekIndex >= plan.weeks.length - 1}
                      onClick={() => setWeekIndex((i) => i + 1)}
                    >
                      <ChevronRight />
                    </button>
                  </div>
                </div>
                <div className="week-grid">
                  {week.sessions.map((s) => (
                    <button
                      key={s.date}
                      onClick={() => setSelectedDay(s.date)}
                      className={`day-card ${selectedDay === s.date ? "chosen" : ""} ${s.kind === "Long run" ? "long" : ""}`}
                    >
                      <span>
                        {dateLabel(s.date, { weekday: "short" })}{" "}
                        <b>{day(s.date).getDate()}</b>
                      </span>
                      {s.kind === "Rest" ? (
                        <Moon size={22} />
                      ) : s.kind === "Race" ? (
                        <Flag size={22} />
                      ) : (
                        <Footprints size={22} />
                      )}
                      <strong>{s.kind}</strong>
                      <em>{s.km ? s.km.toFixed(1) + " km" : "Rest & reset"}</em>
                    </button>
                  ))}
                </div>
                <div className="session-detail">
                  <div>
                    <span className="eyebrow">
                      {dateLabel(session.date, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      }).toUpperCase()}
                    </span>
                    <h3>
                      {adjust ? "Lighter option" : session.kind}
                      {todayKm > 0 ? ` · ${todayKm.toFixed(1)} km` : ""}
                    </h3>
                    <p>
                      {adjust
                        ? signals.reasons.join(". ") +
                          ". Keep today comfortable."
                        : session.note}
                    </p>
                  </div>
                  <span>{week.km.toFixed(1)} km scheduled this week</span>
                </div>
              </section>
              <section className="panel plan-blocks">
                <div className="panel-heading">
                  <h2>The bigger picture</h2>
                  <small>Select a week to explore it</small>
                </div>
                <div className="block-grid">
                  {plan.weeks.map((w, i) => (
                    <button
                      className={i === weekIndex ? "current" : ""}
                      key={w.start}
                      onClick={() => {
                        setWeekIndex(i);
                        setSelectedDay(w.start);
                      }}
                    >
                      <span>W{i + 1}</span>
                      <div
                        className="block-bar"
                        style={{
                          height: Math.max(
                            8,
                            Math.min(
                              90,
                              (w.km /
                                Math.max(...plan.weeks.map((x) => x.km))) *
                                90,
                            ),
                          ),
                        }}
                      />
                      <b>{Math.round(w.km)}</b>
                      <small>{w.phase}</small>
                    </button>
                  ))}
                </div>
              </section>
              <p className="fineprint">
                This is an adjustable training template, not a validated
                coaching model. Recovery flags adjust today’s suggestion only;
                calendar exports contain the base schedule. Goal pace is a
                target, not an assessment of fitness.
              </p>
            </>
          )}

          {view === "Run journal" && (
            <>
              <section className="journal-toolbar">
                <span>
                  {recentRuns.length} activities ·{" "}
                  {recentRuns.reduce((s, r) => s + r.distanceKm, 0).toFixed(1)}{" "}
                  km recorded
                </span>
                <div className="actions">
                  <button className="btn" onClick={() => setModal("data")}>
                    <Upload size={16} />
                    Import / export
                  </button>
                  {local && connected && (
                    <button className="btn" disabled={busy} onClick={sync}>
                      <RefreshCw size={16} className={busy ? "spin" : ""} />
                      {busy ? "Syncing…" : "Sync Garmin"}
                    </button>
                  )}
                </div>
              </section>
              <section className="panel journal-panel">{runTable()}</section>
            </>
          )}

          {view === "Recovery" && (
            <>
              <section className="recovery-hero">
                <div>
                  <span className="eyebrow">
                    {wellness[0]
                      ? dateLabel(wellness[0].date).toUpperCase()
                      : "YOUR DAILY CHECK-IN"}
                  </span>
                  <h2>{signals.label}.</h2>
                  <p>
                    {signals.reasons.join(". ")}
                    {signals.factor < 1
                      ? " Today’s suggestion is 20% shorter and easy effort."
                      : ""}
                  </p>
                </div>
                <Heart size={62} strokeWidth={1} />
              </section>
              <div className="recovery-grid">
                <section className="panel">
                  <span className="eyebrow">SLEEP</span>
                  <div className="large-number">
                    {wellness[0]?.sleepHours?.toFixed(1) ?? "—"}{" "}
                    <span>hours</span>
                  </div>
                  <p>
                    {wellness[0]?.sleepScore != null
                      ? `Sleep score: ${wellness[0].sleepScore} / 100`
                      : "No sleep score available."}
                  </p>
                  <SignalChart
                    values={wellness
                      .slice(0, 14)
                      .reverse()
                      .map((w) => ({ date: w.date, value: w.sleepHours }))}
                    unit="hours"
                  />
                </section>
                <section className="panel">
                  <span className="eyebrow">
                    OVERNIGHT HEART RATE VARIABILITY
                  </span>
                  <div className="large-number">
                    {wellness[0]?.hrvMs ?? "—"} <span>ms</span>
                  </div>
                  <p>
                    {wellness[0]?.hrvBaselineLow != null
                      ? `Your personal baseline: ${wellness[0].hrvBaselineLow}–${wellness[0].hrvBaselineHigh ?? "…"} ms`
                      : "Sync or add your own baseline to put HRV in context."}
                  </p>
                  <SignalChart
                    values={wellness
                      .slice(0, 14)
                      .reverse()
                      .map((w) => ({ date: w.date, value: w.hrvMs }))}
                    unit="ms"
                  />
                </section>
              </div>
              <section className="panel explanation">
                <h2>A signal, not a verdict.</h2>
                <p>
                  Milemark flags sleep under 6 hours, sleep scores under 60, or
                  HRV outside your own baseline. These are simple app rules, not
                  Garmin’s Training Readiness score. Missing values stay
                  missing. Data older than two days doesn’t change your run.
                </p>
                <p>
                  HRV is personal. Garmin needs around three weeks of overnight
                  readings to establish a baseline. Don’t compare your number
                  with another runner’s, and don’t let one number override how
                  you feel.
                </p>
                <a
                  href="https://www.garmin.com/en-US/garmin-technology/health-science/hrv-status/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read Garmin’s HRV guide <ExternalLink size={14} />
                </a>
              </section>
            </>
          )}
          <footer>
            <span className="footer-mark">milemark</span>
            <span>Built for the days between start lines.</span>
            <button onClick={() => setModal("about")}>
              Method & data <ArrowUpRight size={13} />
            </button>
          </footer>
        </div>
      </main>

      <dialog
        aria-label="Milemark settings"
        ref={dialog}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setModal(null);
        }}
      >
        <div className="modal-inner">
          <button
            className="modal-close icon-btn"
            aria-label="Close dialog"
            disabled={busy}
            onClick={() => setModal(null)}
          >
            <X />
          </button>
          {modal === "setup" && (
            <>
              <span className="eyebrow">YOUR NEXT START LINE</span>
              <h2>Make it yours.</h2>
              <p>
                Start with what you’re running now. You can change your goal as
                training unfolds.
              </p>
              <form onSubmit={saveGoal}>
                {personal.runs.length > 0 && (
                  <button
                    className="btn full"
                    type="button"
                    onClick={(e) => {
                      const form = e.currentTarget.form!;
                      const base = trainingBase(personal);
                      (
                        form.elements.namedItem("weeklyKm") as HTMLInputElement
                      ).value = String(base.weeklyKm);
                      (
                        form.elements.namedItem("longestKm") as HTMLInputElement
                      ).value = String(base.longestKm);
                    }}
                  >
                    Use my last 4 complete weeks <Activity size={16} />
                  </button>
                )}
                <RacePicker settings={settings} />
                <div className="form-row">
                  <label>
                    Goal hours
                    <input
                      name="hours"
                      type="number"
                      min={2}
                      max={10}
                      defaultValue={Math.floor(settings.goalMinutes / 60)}
                      required
                    />
                  </label>
                  <label>
                    Minutes
                    <input
                      name="minutes"
                      type="number"
                      min={0}
                      max={59}
                      defaultValue={settings.goalMinutes % 60}
                      required
                    />
                  </label>
                  <label>
                    Days / week
                    <select name="days" defaultValue={settings.days}>
                      {[3, 4, 5, 6].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Current km / week
                    <input
                      name="weeklyKm"
                      type="number"
                      min={10}
                      max={160}
                      step="0.1"
                      defaultValue={settings.weeklyKm}
                      required
                    />
                  </label>
                  <label>
                    Longest recent run (km)
                    <input
                      name="longestKm"
                      type="number"
                      min={1}
                      max={160}
                      step="0.1"
                      defaultValue={settings.longestKm}
                      required
                    />
                  </label>
                </div>
                <details>
                  <summary>
                    Recent race for an estimated finish time (optional)
                  </summary>
                  <div className="form-row">
                    <label>
                      Race distance (km)
                      <input
                        name="recentRaceKm"
                        type="number"
                        min={0}
                        max={50}
                        step="any"
                        defaultValue={settings.recentRaceKm}
                      />
                    </label>
                    <label>
                      Race time (minutes)
                      <input
                        name="recentRaceMinutes"
                        type="number"
                        min={0}
                        max={900}
                        step="any"
                        defaultValue={settings.recentRaceMinutes}
                      />
                    </label>
                  </div>
                  <small>
                    Use an actual race effort. Leave both at 0 if you don’t have
                    one.
                  </small>
                </details>
                <button className="btn primary full">
                  Build my plan <ArrowRight size={16} />
                </button>
              </form>
            </>
          )}
          {modal === "run" && (
            <>
              <span className="eyebrow">SHOWING UP COUNTS</span>
              <h2>Another one in the books.</h2>
              <form onSubmit={addRun}>
                <label>
                  Run name
                  <input
                    name="name"
                    placeholder="Morning miles"
                    maxLength={160}
                    required
                  />
                </label>
                <label>
                  Date
                  <input
                    name="date"
                    type="date"
                    max={today}
                    defaultValue={today}
                    required
                  />
                </label>
                <div className="form-row">
                  <label>
                    Distance (km)
                    <input
                      name="distance"
                      type="number"
                      min="0.01"
                      max="300"
                      step="0.01"
                      required
                    />
                  </label>
                  <label>
                    Time (minutes)
                    <input
                      name="duration"
                      type="number"
                      min="1"
                      max="10080"
                      step="0.1"
                      required
                    />
                  </label>
                </div>
                <label>
                  Average heart rate (optional)
                  <input
                    name="heart"
                    type="number"
                    min="20"
                    max="250"
                    placeholder="bpm"
                  />
                </label>
                <label className="checkbox">
                  <input name="race" type="checkbox" />
                  This was a race effort (use for finish-time estimates)
                </label>
                <button className="btn primary full">
                  Save run <Check size={16} />
                </button>
              </form>
            </>
          )}
          {modal === "checkin" && (
            <>
              <span className="eyebrow">CHECK IN WITH YOURSELF</span>
              <h2>How’s the recovery?</h2>
              <p>
                Leave unknown fields empty. Use your own Garmin baseline, not a
                population average.
              </p>
              <form onSubmit={checkin}>
                <div className="form-row">
                  <label>
                    Sleep (hours)
                    <input
                      name="sleepHours"
                      type="number"
                      min="0"
                      max="24"
                      step="0.1"
                    />
                  </label>
                  <label>
                    Sleep score / 100
                    <input name="sleepScore" type="number" min="0" max="100" />
                  </label>
                </div>
                <label>
                  Overnight HRV (ms)
                  <input name="hrvMs" type="number" min="0" max="500" />
                </label>
                <div className="form-row">
                  <label>
                    HRV baseline low (ms)
                    <input
                      name="hrvBaselineLow"
                      type="number"
                      min="0"
                      max="500"
                    />
                  </label>
                  <label>
                    HRV baseline high (ms)
                    <input
                      name="hrvBaselineHigh"
                      type="number"
                      min="0"
                      max="500"
                    />
                  </label>
                </div>
                <button className="btn primary full">
                  Save check-in <Check size={16} />
                </button>
              </form>
            </>
          )}
          {modal === "connect" && (
            <>
              <span className="eyebrow">YOUR WATCH. YOUR JOURNAL.</span>
              <h2>Bring your miles with you.</h2>
              <p>
                Connect Garmin from the local app. Runs, sleep, and HRV are
                imported read-only; availability depends on your device.
              </p>
              {!local ? (
                <div className="callout">
                  <strong>Garmin sign-in runs on your laptop.</strong>
                  <p>
                    This hosted dashboard never collects your Garmin password.
                    Open your local copy to connect, or use manual logging here.
                  </p>
                  <a
                    href="https://github.com/nikhiltrip/milemark#run-locally"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Local setup guide <ArrowUpRight size={15} />
                  </a>
                </div>
              ) : connected ? (
                <div className="connected-box">
                  <span>
                    <Check size={18} />
                    Garmin session saved locally
                  </span>
                  <button
                    className="btn primary full"
                    onClick={sync}
                    disabled={busy}
                  >
                    <RefreshCw size={16} className={busy ? "spin" : ""} />
                    {busy ? "Importing runs & recovery…" : "Sync my Garmin"}
                  </button>
                  <button
                    className="btn full"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("garmin/disconnect");
                        setConnected(false);
                        setPersonal(EMPTY);
                        setMode("personal");
                        setNotice(
                          "Garmin disconnected and local import removed.",
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Disconnect & remove local import
                  </button>
                </div>
              ) : (
                <form onSubmit={login}>
                  {mfa ? (
                    <label>
                      Garmin verification code
                      <input
                        name="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{4,10}"
                        required
                      />
                    </label>
                  ) : (
                    <>
                      <label>
                        Garmin email
                        <input
                          name="email"
                          type="email"
                          autoComplete="username"
                          required
                        />
                      </label>
                      <label>
                        Garmin password
                        <input
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          required
                        />
                      </label>
                    </>
                  )}
                  <button className="btn primary full" disabled={busy}>
                    {busy
                      ? "Connecting…"
                      : mfa
                        ? "Verify code"
                        : "Connect Garmin"}
                    <ArrowRight size={16} />
                  </button>
                  {mfa && (
                    <button
                      type="button"
                      className="btn full"
                      disabled={busy}
                      onClick={() => setMfa(false)}
                    >
                      Restart sign-in
                    </button>
                  )}
                  <small>
                    Unofficial personal connector. Password is sent to Garmin
                    through this local service and is not saved. Session tokens
                    remain on this laptop.
                  </small>
                </form>
              )}
              <div className="connection-secondary">
                <strong>No Garmin? No problem.</strong>
                <p>
                  Log runs, add recovery check-ins, and build a plan without a
                  wearable.
                </p>
                <button
                  className="text-arrow"
                  onClick={() => {
                    setMode("personal");
                    setModal("setup");
                  }}
                >
                  Use manual mode <ArrowRight size={15} />
                </button>
                <button className="text-arrow" onClick={() => setModal("data")}>
                  Import or export a journal <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}
          {modal === "data" && (
            <>
              <span className="eyebrow">TAKE YOUR JOURNAL WITH YOU</span>
              <h2>Your data belongs to you.</h2>
              <p>
                Milemark JSON imports replace this browser’s personal journal.
                They never include Garmin credentials or GPS tracks.
              </p>
              <label className="upload-zone">
                <Upload />
                <strong>Import Milemark JSON</strong>
                <span>Choose a file · up to 5 MB</span>
                <input
                  aria-label="Import Milemark JSON"
                  type="file"
                  accept="application/json,.json"
                  onChange={importFile}
                />
              </label>
              <button
                className="btn full"
                onClick={() =>
                  download(
                    mode === "demo"
                      ? "milemark-sample.json"
                      : "milemark-journal.json",
                    JSON.stringify(snapshot, null, 2),
                    "application/json",
                  )
                }
              >
                Export {mode === "demo" ? "sample" : "my"} journal{" "}
                <Download size={16} />
              </button>
              <p className="fineprint">
                Export files contain run and recovery information. Share only
                what you intend others to see.
              </p>
            </>
          )}
          {modal === "about" && (
            <>
              <span className="eyebrow">BUILT FOR THE LONG GAME</span>
              <h2>Simple rules. Clear reasons.</h2>
              <p>
                Milemark brings marathon planning, run history, and recovery
                signals into one personal journal.
              </p>
              <h3>The training template</h3>
              <p>
                Current weekly volume anchors a gradual build, with a reduced
                week every fourth build week and a three-week taper. Long runs
                are capped at 30 km and 40% of weekly volume. Time beyond a
                20-week build stays in a base phase. These are app design
                choices, not a validated training prescription.
              </p>
              <h3>Estimates & recovery</h3>
              <p>
                Race estimates use the Riegel formula (exponent 1.06) on an
                explicitly marked race or your entered race time. They don’t
                guarantee an outcome. Sleep and HRV flags can reduce today’s
                suggestion; they are not Garmin’s readiness algorithm.
              </p>
              <h3>Private by design</h3>
              <p>
                Manual data stays in this browser. Live Garmin sync uses a local
                Python service and an unofficial community client. The public
                demo has synthetic data. No GPS routes or credentials are
                included in imports.
              </p>
              <div className="source-links">
                <a
                  target="_blank"
                  rel="noreferrer"
                  href="https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/"
                >
                  B.A.A. training reference <ExternalLink size={14} />
                </a>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href="https://www.garmin.com/en-US/garmin-technology/health-science/hrv-status/"
                >
                  Garmin HRV guide <ExternalLink size={14} />
                </a>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href="https://github.com/nikhiltrip/milemark"
                >
                  View the source <ExternalLink size={14} />
                </a>
              </div>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </dialog>
    </div>
  );
}
function RacePicker({ settings }: { settings: Settings }) {
  const events = upcomingRaces(today);
  const [choice, setChoice] = useState(
    events.find(
      (r) => r.name === settings.raceName && r.date === settings.raceDate,
    )?.id || "custom",
  );
  const [name, setName] = useState(settings.raceName),
    [date, setDate] = useState(settings.raceDate);
  const selected = events.find((r) => r.id === choice);
  return (
    <div className="race-picker">
      <label>
        Choose a marathon
        <select
          value={choice}
          onChange={(e) => {
            const id = e.target.value;
            setChoice(id);
            const race = events.find((r) => r.id === id);
            if (race) {
              setName(race.name);
              setDate(race.date);
            }
          }}
        >
          <option value="custom">Custom marathon & date</option>
          {events.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ·{" "}
              {dateLabel(r.date, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <div className="race-source">
          <span>{selected.location}</span>
          <a href={selected.url} target="_blank" rel="noreferrer">
            Official race details <ExternalLink size={12} />
          </a>
        </div>
      )}
      <div className="race-fields">
        <label>
          Race name
          <input
            name="raceName"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setChoice("custom");
            }}
            maxLength={100}
            required
          />
        </label>
        <label>
          Race date
          <input
            name="raceDate"
            type="date"
            min={shift(today, 1)}
            max={shift(today, 728)}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setChoice("custom");
            }}
            required
          />
        </label>
      </div>
      <small>
        Starter list verified October 15, 2026. Confirm dates and entry
        requirements with the organizer. Choosing a race does not register you.
      </small>
    </div>
  );
}
function MileageChart({ values }: { values: { start: string; km: number }[] }) {
  const max = Math.max(20, ...values.map((x) => x.km)) * 1.2;
  const width = 640,
    height = 175;
  const gap = width / values.length;
  return (
    <div className="mileage-chart">
      <div className="chart-axis">
        {[1, 0.5, 0].map((n) => (
          <span key={n}>{Math.round(max * n)}</span>
        ))}
      </div>
      <div className="chart-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={values
            .map((x) => `${dateLabel(x.start)}: ${x.km} kilometers`)
            .join(", ")}
        >
          {[0, 0.5, 1].map((n) => (
            <line
              key={n}
              x1="0"
              x2={width}
              y1={n * (height - 15)}
              y2={n * (height - 15)}
              stroke="#e5e9ee"
              strokeDasharray="3 5"
            />
          ))}
          {values.map((x, i) => (
            <g key={x.start}>
              <rect
                x={i * gap + gap * 0.23}
                y={height - 15 - (x.km / max) * (height - 15)}
                width={gap * 0.54}
                height={(x.km / max) * (height - 15)}
                rx="3"
                fill={i === values.length - 1 ? "#ffbd9c" : "#fc4c02"}
              >
                <title>
                  {dateLabel(x.start)} · {x.km} km
                </title>
              </rect>
            </g>
          ))}
        </svg>
        <div className="chart-dates">
          {values.map((x) => (
            <span key={x.start}>{dateLabel(x.start)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
function RecoveryRow({
  label,
  value,
  detail,
  bars,
}: {
  label: string;
  value: string;
  detail: string;
  bars: number[];
}) {
  return (
    <div className="recovery-row">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <div className="spark" aria-hidden="true">
        {bars.map((n, i) => (
          <i
            key={i}
            style={{
              height: `${Math.min(38, n * 4)}px`,
              opacity: value === "—" ? 0.18 : 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}
function SignalChart({
  values,
  unit,
}: {
  values: { date: string; value?: number | null }[];
  unit: string;
}) {
  const max = Math.max(1, ...values.map((v) => v.value ?? 0)) * 1.15;
  return (
    <div
      className="signal-chart"
      role="img"
      aria-label={
        values
          .map((v) => `${v.date}: ${v.value ?? "missing"} ${unit}`)
          .join(", ") || "No recovery data yet"
      }
    >
      {values.length ? (
        values.map((v) => (
          <div key={v.date}>
            <div
              style={{
                height: v.value != null ? `${(v.value / max) * 90}px` : "2px",
                opacity: v.value == null ? 0.2 : 1,
              }}
              title={`${v.date}: ${v.value ?? "missing"} ${unit}`}
            />
            <small>{day(v.date).getDate()}</small>
          </div>
        ))
      ) : (
        <p>Your recovery history will appear here.</p>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
