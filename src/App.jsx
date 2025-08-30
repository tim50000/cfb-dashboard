import React, { useEffect, useRef, useState } from "react";

// ============================
// CFB Passing Yards – Draft Dashboard (8/30/25)
// - Uses ESPN's public CFB JSON (no API key)
// - Locked scoreboard to 2025-08-30
// - Displays Dude ↔ Team mapping, ranks by Passing Yards (desc)
// - For pregame teams, sorts by game start time
// - Auto-refreshes every 15s
// ============================

const MATCHUPS = [
  ["Blake", "Washington"],
  ["Chris", "Boston College"],
  ["David", "Washington State"],
  ["Higgins", "Eastern Michigan"],
  ["Nic", "Florida State"],
  ["Q", "Alabama"],
  ["Sam", "Nicholls"],
  ["Shyam", "Middle Tennessee"],
  ["Steven", "Oklahoma"],
  ["Tommy", "Florida"],
  ["Vandy", "Northern Arizona"],
  ["Will", "Albany"],
];

const DATE = "20250830"; // locked date

// ESPN endpoints
const scoreboardUrl = (yyyymmdd) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${yyyymmdd}`;
const espnSummaryUrl = (eventId) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${eventId}`;

function useInterval(callback, delay) {
  const savedRef = useRef(() => {});
  useEffect(() => {
    savedRef.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay == null) return;
    const id = setInterval(() => savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function normalizeName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function bestTeamString(t) {
  return t?.displayName || t?.shortDisplayName || t?.location || t?.name || "";
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed ${res.status}: ${url}`);
  return res.json();
}

function findPassingYardsFromBoxscoreTeam(boxTeam) {
  if (!boxTeam?.statistics) return null;
  const stat = boxTeam.statistics.find((s) => {
    const n = (s?.name || "").toLowerCase();
    return n.includes("pass") && (n.includes("yd") || n.includes("yard"));
  });
  if (!stat) return null;
  const raw = String(stat.displayValue ?? stat.value ?? "").replace(/[^0-9-]/g, "");
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

async function getPassingYardsForMatchups(matchups, yyyymmdd) {
  const scoreboard = await fetchJSON(scoreboardUrl(yyyymmdd));
  const events = scoreboard?.events ?? [];

  function findEventForTeam(teamName) {
    const target = normalizeName(teamName);
    for (const ev of events) {
      const comp = ev?.competitions?.[0];
      const competitors = comp?.competitors ?? [];
      for (const c of competitors) {
        const nm = normalizeName(bestTeamString(c.team));
        if (nm.includes(target) || target.includes(nm)) {
          return { eventId: ev.id, comp };
        }
      }
    }
    return null;
  }

  const results = [];
  for (const [dude, teamName] of matchups) {
    const match = findEventForTeam(teamName);
    if (!match) {
      results.push({ dude, team: teamName, status: "No game found", yards: null, eventId: null, gameState: "unknown", start: null, teamScore: null, oppScore: null, leadMargin: null });
      continue;
    }
    try {
      const summary = await fetchJSON(espnSummaryUrl(match.eventId));
      const comp = summary?.header?.competitions?.[0];
      const boxTeams = summary?.boxscore?.teams ?? [];
      const found =
        boxTeams.find((bt) => {
          const nm = normalizeName(bestTeamString(bt.team));
          const target = normalizeName(teamName);
          return nm.includes(target) || target.includes(nm);
        }) || null;

      const yards = findPassingYardsFromBoxscoreTeam(found);

      // Scores & timing
      const competitors = comp?.competitors ?? [];
      const me = competitors.find((c) => {
        const nm = normalizeName(bestTeamString(c.team));
        const target = normalizeName(teamName);
        return nm.includes(target) || target.includes(nm);
      });
      const other = competitors.find((c) => c !== me);
      const myScore = me?.score != null ? Number(me.score) : null;
      const oppScore = other?.score != null ? Number(other.score) : null;
      const leadMargin = Number.isFinite(myScore) && Number.isFinite(oppScore) ? myScore - oppScore : null;
      const gameState = comp?.status?.type?.state || "unknown"; // pre, in, post
      const start = comp?.date || null;
      const statusText = comp?.status?.type?.description || "";

      results.push({
        dude,
        team: teamName,
        status: statusText,
        yards,
        eventId: match.eventId,
        gameState,
        start,
        teamScore: myScore,
        oppScore,
        leadMargin,
      });
    } catch (e) {
      results.push({ dude, team: teamName, status: "Fetch error", yards: null, eventId: match.eventId, gameState: "unknown", start: match?.comp?.date || null, teamScore: null, oppScore: null, leadMargin: null });
    }
  }
  return results;
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [prevMap, setPrevMap] = useState(new Map());

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getPassingYardsForMatchups(MATCHUPS, DATE);
      // sort: by passing yards desc; if pregame, by start time asc
      data.sort((a, b) => {
        const av = Number.isFinite(a.yards) ? a.yards : -Infinity;
        const bv = Number.isFinite(b.yards) ? b.yards : -Infinity;
        if (bv !== av) return bv - av;
        if (a.gameState === "pre" && b.gameState === "pre") {
          const at = a.start ? new Date(a.start).getTime() : Infinity;
          const bt = b.start ? new Date(b.start).getTime() : Infinity;
          return at - bt;
        }
        return 0;
      });
      setRows(data);
      setLastUpdated(new Date());
      const m = new Map();
      data.forEach((r) => m.set(normalizeName(r.team), r.yards));
      setPrevMap(m);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useInterval(() => {
    fetchAll();
  }, 15000); // fixed refresh every 15s

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">CFB Passing Yards – Aug 30, 2025</h1>
          <div className="text-sm opacity-70">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ""}
          </div>
        </header>

        <div className="rounded-2xl shadow bg-white p-4 space-y-3">
          <h2 className="font-semibold">Status</h2>
          {loading ? (
            <div className="text-sm">Loading…</div>
          ) : (
            <div className="text-sm text-green-700">Idle</div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <p className="text-xs text-gray-500">Data source: ESPN college‑football public JSON.</p>
        </div>

        <div className="rounded-2xl shadow bg-white p-4">
          <h2 className="font-semibold mb-3">Passing Yards (Ranked)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Dude</th>
                  <th className="py-2 pr-4">Team</th>
                  <th className="py-2 pr-4">Passing Yards</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2">Game Status / Start</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const key = normalizeName(r.team);
                  const prev = prevMap.get(key);
                  const increased =
                    Number.isFinite(r.yards) && Number.isFinite(prev)
                      ? r.yards > prev
                      : false;
                  const scoreText = Number.isFinite(r.teamScore) && Number.isFinite(r.oppScore)
                    ? `${r.teamScore}–${r.oppScore}`
                    : "—";
                  const statusText = r.gameState === "pre" && r.start
                    ? new Date(r.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : (r.status || "—");
                  return (
                    <tr key={`${r.dude}-${r.team}`} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 w-8">{Number.isFinite(r.yards) ? idx + 1 : "—"}</td>
                      <td className="py-2 pr-4 font-medium">{r.dude}</td>
                      <td className="py-2 pr-4">{r.team}</td>
                      <td
                        className={classNames(
                          "py-2 pr-4 font-mono",
                          increased && "animate-pulse"
                        )}
                        title={
                          Number.isFinite(prev) && Number.isFinite(r.yards)
                            ? `Prev: ${prev}`
                            : ""
                        }
                      >
                        {Number.isFinite(r.yards) ? r.yards : "—"}
                      </td>
                      <td className="py-2 pr-4">{scoreText}</td>
                      <td className="py-2 text-gray-600">{statusText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="text-xs text-gray-500">
          Draft‑order dashboard for 8/30/25. Auto‑refreshes every 15s.
        </footer>
      </div>
    </div>
  );
}
