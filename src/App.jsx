import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import fantasyFellasData from './data/assignments-2026.json'
import listenData from './data/listen-assignments-2026.json'

const PEOPLE = ['Blake', 'Chris', 'David', 'Higgins', 'Nic', 'Q', 'Sam', 'Shyam', 'Steven', 'Tommy', 'Vandy', 'Will']
const API_ROOT = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football'
const BASE = import.meta.env.BASE_URL
const DRAW_START_DELAY_MS = 900
const DRAW_REVEAL_INTERVAL_MS = 700
const DRAW_FINISH_DELAY_MS = 700
const TEAM_COUNT = 12
const LISTEN_PLAYERS = Array.from({ length: 24 }, (_, index) => `Player ${index + 1}`)
const ASSIGNMENT_CARD_MS = 1000
const ASSIGNMENT_PAUSE_MS = 0

const FANTASY_FELLAS = {
  id: 'ff',
  name: 'Fantasy Fellas',
  trackerPath: '/fantasy-fellas-2026',
  drawPath: '/fantasy-fellas-2026/draw',
  downloadPrefix: 'fantasy-fellas',
  data: fantasyFellasData,
}

const LISTEN = {
  id: 'listen',
  name: 'Listen Labs',
  trackerPath: '/listen-2026',
  drawPath: '/listen-2026/draw',
  teamsPath: '/listen-2026/teams',
  downloadPrefix: 'listen-labs',
  data: listenData,
}

const ASSIGNMENTS_2025 = [
  { person: 'Blake', team: 'Washington' },
  { person: 'Chris', team: 'Boston College' },
  { person: 'David', team: 'Washington State' },
  { person: 'Higgins', team: 'Eastern Michigan' },
  { person: 'Nic', team: 'Florida State' },
  { person: 'Q', team: 'Alabama' },
  { person: 'Sam', team: 'Nicholls' },
  { person: 'Shyam', team: 'Middle Tennessee' },
  { person: 'Steven', team: 'Oklahoma' },
  { person: 'Tommy', team: 'Florida' },
  { person: 'Vandy', team: 'Northern Arizona' },
  { person: 'Will', team: 'UAlbany' },
]

function routeHref(route) {
  return `${BASE}${route.replace(/^\//, '')}`
}

function formatDate(date, options = {}) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', ...options,
  })
}

function usePageMetadata(title, description) {
  useEffect(() => {
    const oldTitle = document.title
    const meta = document.querySelector('meta[name="description"]')
    const oldDescription = meta?.content
    document.title = title
    if (meta) meta.content = description
    return () => {
      document.title = oldTitle
      if (meta && oldDescription) meta.content = oldDescription
    }
  }, [title, description])
}

function teamMatches(teamName, entry) {
  const team = entry?.team || entry
  return [team?.location, team?.shortDisplayName, team?.displayName, team?.name]
    .some((value) => value?.trim().toLowerCase() === teamName.trim().toLowerCase())
}

function extractPassingYards(statistics) {
  if (!Array.isArray(statistics)) return null
  const stat = statistics.find((item) => {
    const name = item.name?.toLowerCase() || ''
    return name.includes('pass') && (name.includes('yd') || name.includes('yard'))
  })
  const raw = stat?.displayValue ?? stat?.value
  if (raw === undefined || raw === null) return null
  const value = Number.parseInt(String(raw).replace(/[^0-9-]/g, ''), 10)
  return Number.isNaN(value) ? null : value
}

function gameStatus(competition) {
  const status = competition?.status?.type
  if (status?.state === 'pre') {
    return new Date(competition.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return status?.shortDetail || status?.description || 'Scheduled'
}

async function getSchedule(date) {
  const normalized = date.replaceAll('-', '')
  const response = await fetch(`${API_ROOT}/scoreboard?dates=${normalized}&limit=400`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Schedule unavailable')
  const data = await response.json()
  return data.events || []
}

async function getLeaderboard(assignments, date) {
  const events = await getSchedule(date)
  const eventMap = new Map()

  assignments.forEach(({ team }) => {
    const event = events.find((item) => item.competitions?.[0]?.competitors?.some((entry) => teamMatches(team, entry)))
    if (event) eventMap.set(event.id, event)
  })

  const summaries = new Map(await Promise.all([...eventMap.keys()].map(async (eventId) => {
    try {
      const response = await fetch(`${API_ROOT}/summary?event=${eventId}`, { cache: 'no-store' })
      return [eventId, response.ok ? await response.json() : null]
    } catch {
      return [eventId, null]
    }
  })))

  return assignments.map(({ person, team }, sourceIndex) => {
    const event = [...eventMap.values()].find((item) => item.competitions?.[0]?.competitors?.some((entry) => teamMatches(team, entry)))
    if (!event) return { person, team, sourceIndex, passingYards: null, status: 'No game found', score: '—', opponent: 'TBD', logo: null, startTime: null, gameState: 'pre' }

    const summary = summaries.get(event.id)
    const competition = summary?.header?.competitions?.[0] || event.competitions?.[0]
    const competitors = competition?.competitors || []
    const selected = competitors.find((entry) => teamMatches(team, entry))
    const opponent = competitors.find((entry) => !teamMatches(team, entry))
    const boxTeam = summary?.boxscore?.teams?.find((entry) => teamMatches(team, entry))

    return {
      person,
      team,
      sourceIndex,
      passingYards: extractPassingYards(boxTeam?.statistics),
      status: gameStatus(competition),
      score: selected?.score != null && opponent?.score != null ? `${selected.score}–${opponent.score}` : '0–0',
      opponent: opponent?.team?.shortDisplayName || opponent?.team?.location || 'TBD',
      logo: selected?.team?.logo || event.competitions?.[0]?.competitors?.find((entry) => teamMatches(team, entry))?.team?.logo,
      startTime: competition?.date ? new Date(competition.date) : null,
      gameState: competition?.status?.type?.state || 'pre',
    }
  })
}

function fallbackRows(assignments, teamDetails = {}) {
  return assignments.map(({ person, team }, sourceIndex) => ({
    person,
    team,
    sourceIndex,
    passingYards: null,
    status: 'Scheduled',
    score: '0–0',
    opponent: teamDetails[team]?.opponent || 'TBD',
    logo: teamDetails[team]?.logo || null,
    startTime: null,
    gameState: 'pre',
  }))
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.passingYards != null && b.passingYards != null) return b.passingYards - a.passingYards || a.sourceIndex - b.sourceIndex
    if (a.passingYards != null) return -1
    if (b.passingYards != null) return 1
    return (a.startTime?.getTime() || Infinity) - (b.startTime?.getTime() || Infinity) || a.sourceIndex - b.sourceIndex
  })
}

function useLeaderboard(assignments, date, teamDetails = {}) {
  const [rows, setRows] = useState(() => fallbackRows(assignments, teamDetails))
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setRows(await getLeaderboard(assignments, date))
      setUpdated(new Date())
      setError('')
    } catch {
      setError('Live data is temporarily unavailable. Showing saved assignments.')
    } finally {
      setRefreshing(false)
    }
  }, [assignments, date])

  useEffect(() => {
    refresh()
    const interval = window.setInterval(refresh, 15000)
    return () => window.clearInterval(interval)
  }, [refresh])

  return { rows: sortRows(rows), error, updated, refreshing, refresh }
}

function ProductHeader({ brand, active, archive = false }) {
  return (
    <header className="product-header">
      <a className="product-brand" href={routeHref(brand.trackerPath)}>
        {brand.id === 'listen'
          ? <img src={routeHref('/listen-labs-blue.png')} alt="Listen Labs" />
          : <><span className="ff-mark">FF</span><strong>Fantasy Fellas</strong></>}
      </a>
      <nav aria-label={`${brand.name} pages`}>
        <a className={active === 'tracker' ? 'active' : ''} href={routeHref(brand.trackerPath)}>Tracker</a>
        <a className={active === 'draw' ? 'active' : ''} href={routeHref(brand.drawPath)}>Draw</a>
        {brand.id === 'listen' && <a className={active === 'teams' ? 'active' : ''} href={routeHref(brand.teamsPath)}>Teams</a>}
        {archive && <a className={active === 'archive' ? 'active' : ''} href={routeHref('/fantasy-fellas-2025')}>2025</a>}
      </nav>
    </header>
  )
}

function TeamLogo({ row }) {
  return row.logo
    ? <img className="team-mark" src={row.logo} alt="" />
    : <span className="team-mark fallback">{row.team.slice(0, 2).toUpperCase()}</span>
}

function YardsCell({ row, maxYards }) {
  const yards = row.passingYards ?? 0
  const progress = yards > 0 ? Math.max(3, (yards / maxYards) * 100) : 0
  return (
    <div className="tracker-yards">
      <div className="tracker-yard-value"><strong>{row.passingYards ?? '—'}</strong><span>YDS</span></div>
      <div
        className="yard-progress"
        role="progressbar"
        aria-label={`${row.team} passing yards`}
        aria-valuemin="0"
        aria-valuemax={maxYards}
        aria-valuenow={yards}
      >
        <i style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

function TrackingPage({ brand }) {
  const data = brand.data
  const assignments = useMemo(() => data.assignments, [data])
  const { rows, error, updated, refreshing, refresh } = useLeaderboard(assignments, data.date, data.teams)
  const maxYards = Math.max(1, ...rows.map((row) => row.passingYards ?? 0))
  usePageMetadata(`${brand.name} · Passing Yards Tracker`, `${brand.name} 2026 college football passing-yards tracker.`)

  return (
    <main className={`product-page brand-${brand.id}`}>
      <ProductHeader brand={brand} active="tracker" archive={brand.id === 'ff'} />
      <section className="product-workspace tracker-workspace">
        <div className="page-heading">
          <div><p>{brand.name} · 2026</p><h1>Passing yards tracker</h1></div>
          <div className="tracker-meta">
            <div><span>Game date</span><strong>{formatDate(data.date, { month: 'short' })}</strong></div>
            <div><span>Updated</span><strong>{updated ? updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Connecting'}</strong></div>
            <button onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </div>

        <div className={`feed-status ${error ? 'error' : ''}`}><span />{error || 'ESPN data · refreshes every 15 seconds'}</div>

        <div className="tracker-board">
          <div className="tracker-columns"><span>Rank</span><span>Participant</span><span>Team / matchup</span><span>Game</span><span>Passing yards</span></div>
          <div className="tracker-rows" aria-live="polite">
            {rows.map((row, index) => (
              <article className="tracker-row" key={row.person}>
                <div className="tracker-rank">{index + 1}</div>
                <div className="tracker-person"><strong>{row.person}</strong></div>
                <div className="tracker-team"><TeamLogo row={row} /><div><strong>{row.team}</strong><span>vs {row.opponent}</span></div></div>
                <div className="tracker-game"><strong>{row.score}</strong><span>{row.status}</span></div>
                <YardsCell row={row} maxYards={maxYards} />
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

function secureRandomInt(max) {
  const range = 2 ** 32
  const limit = Math.floor(range / max) * max
  const values = new Uint32Array(1)
  do window.crypto.getRandomValues(values)
  while (values[0] >= limit)
  return values[0] % max
}

function secureShuffle(items) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomInt(index + 1)
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function teamsFromEvents(events) {
  const teams = events.flatMap((event) => {
    const competitors = event.competitions?.[0]?.competitors || []
    return competitors.map((entry) => ({
      team: entry.team?.location || entry.team?.shortDisplayName || entry.team?.displayName,
      logo: entry.team?.logo || '',
      opponent: competitors.find((other) => other.id !== entry.id)?.team?.shortDisplayName || 'TBD',
    }))
  })
  return [...new Map(teams.filter((entry) => entry.team).map((entry) => [entry.team, entry])).values()]
}

function DrawPage({ brand }) {
  const data = brand.data
  const initial = useMemo(() => data.assignments.map((entry) => ({
    ...entry,
    logo: data.teams?.[entry.team]?.logo || '',
    opponent: data.teams?.[entry.team]?.opponent || '',
  })), [data])
  const [date, setDate] = useState(data.date)
  const [pool, setPool] = useState([])
  const [results, setResults] = useState(initial)
  const [drawing, setDrawing] = useState(false)
  const [revealed, setRevealed] = useState(PEOPLE.length)
  const [message, setMessage] = useState(`Saved ${formatDate(data.date, { month: 'short' })} test assignments`)
  const timers = useRef([])
  usePageMetadata(`${brand.name} · Team Draw`, `${brand.name} 2026 college football team draw.`)

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  const runDraw = async () => {
    if (drawing) return
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    setDrawing(true)
    setRevealed(0)
    setMessage('Loading every team scheduled for this date…')
    try {
      const teams = teamsFromEvents(await getSchedule(date))
      if (teams.length < PEOPLE.length) throw new Error(`Only ${teams.length} teams are scheduled. At least 12 are required.`)
      const selected = secureShuffle(teams).slice(0, PEOPLE.length)
      setPool(teams)
      setResults(PEOPLE.map((person, index) => ({ person, ...selected[index] })))
      setMessage(`${teams.length} scheduled teams included in the pool`)
      PEOPLE.forEach((_, index) => timers.current.push(window.setTimeout(
        () => setRevealed(index + 1),
        DRAW_START_DELAY_MS + (index * DRAW_REVEAL_INTERVAL_MS),
      )))
      timers.current.push(window.setTimeout(() => {
        setDrawing(false)
        setMessage('Assignments ready.')
      }, DRAW_START_DELAY_MS + (PEOPLE.length * DRAW_REVEAL_INTERVAL_MS) + DRAW_FINISH_DELAY_MS))
    } catch (error) {
      setDrawing(false)
      setRevealed(PEOPLE.length)
      setMessage(error.message || 'Unable to load the schedule.')
    }
  }

  const copyResults = async () => {
    const text = results.map((entry, index) => `${index + 1}. ${entry.person} — ${entry.team}`).join('\n')
    await navigator.clipboard.writeText(`${brand.name} · ${formatDate(date)}\n${text}`)
    setMessage('Assignments copied.')
  }

  const downloadResults = () => {
    const payload = JSON.stringify({ organization: brand.name, date, generatedAt: new Date().toISOString(), assignments: results.map(({ person, team }) => ({ person, team })) }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${brand.downloadPrefix}-${date}-assignments.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className={`product-page brand-${brand.id}`}>
      <ProductHeader brand={brand} active="draw" archive={brand.id === 'ff'} />
      <section className={`product-workspace draw-workspace ${drawing ? 'is-drawing' : ''}`}>
        <div className="page-heading draw-heading">
          <div><p>{brand.name} · 2026</p><h1>College football team draw</h1></div>
          <div className="draw-controls">
            <label><span>Game date</span><input type="date" value={date} disabled={drawing} onChange={(event) => setDate(event.target.value)} /></label>
            <div className="pool-count"><span>Teams playing</span><strong>{pool.length || data.poolSize || '—'}</strong></div>
            <button className="primary-button" onClick={runDraw} disabled={drawing}>{drawing ? 'Drawing…' : 'Run draw'}</button>
          </div>
        </div>

        <div className="feed-status"><span />{message}</div>

        <div className="draw-grid">
          {PEOPLE.map((person, index) => {
            const isRevealed = index < revealed
            const decoy = pool.length ? pool[(index * 3 + revealed) % pool.length] : null
            const shown = isRevealed ? results[index] : decoy
            return (
              <article className={`draw-card ${isRevealed ? 'revealed' : 'rolling'}`} key={person}>
                <div className="draw-card-number">{String(index + 1).padStart(2, '0')}</div>
                <div className="draw-card-content">
                  {shown?.logo ? <img src={shown.logo} alt="" /> : <span className="team-placeholder">?</span>}
                  <div><span>{person}</span><strong>{shown?.team || '—'}</strong><small>{shown?.opponent ? `vs ${shown.opponent}` : 'Assignment'}</small></div>
                </div>
              </article>
            )
          })}
        </div>

        <div className="draw-actions">
          <p>Every scheduled team is included in the pool. Twelve unique teams are assigned.</p>
          <div><button onClick={copyResults} disabled={drawing}>Copy results</button><button onClick={downloadResults} disabled={drawing}>Download JSON</button></div>
        </div>
      </section>
    </main>
  )
}

function emptyTeamAssignments() {
  return Array.from({ length: TEAM_COUNT }, () => [])
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function waitForPaint() {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
}

function ListenTeamAssignmentPage() {
  const [teams, setTeams] = useState(emptyTeamAssignments)
  const [assigning, setAssigning] = useState(false)
  const [activeCard, setActiveCard] = useState(null)
  const [message, setMessage] = useState('Ready to assign 24 players into 12 teams.')
  const playerRefs = useRef(new Map())
  const seatRefs = useRef(new Map())
  const flightRef = useRef(null)
  const runRef = useRef(0)
  const assignedPlayers = useMemo(() => new Set(teams.flat()), [teams])
  usePageMetadata('Listen Labs · Team Assignment', 'Randomly assign 24 Listen Labs players into 12 teams of two.')

  useEffect(() => () => { runRef.current += 1 }, [])

  const runAssignment = async () => {
    if (assigning) return
    const runId = runRef.current + 1
    runRef.current = runId
    setAssigning(true)
    setTeams(emptyTeamAssignments())
    setActiveCard(null)
    setMessage('Assigning players…')
    await wait(450)

    const order = secureShuffle(LISTEN_PLAYERS)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    for (let index = 0; index < order.length; index += 1) {
      if (runRef.current !== runId) return
      const player = order[index]
      const teamIndex = Math.floor(index / 2)
      const seatIndex = index % 2
      const source = playerRefs.current.get(player)?.getBoundingClientRect()
      const target = seatRefs.current.get(`${teamIndex}-${seatIndex}`)?.getBoundingClientRect()

      if (!reducedMotion && source && target) {
        const card = { player, source, target }
        setActiveCard(card)
        await waitForPaint()
        if (runRef.current !== runId) return
        const flight = flightRef.current
        if (flight) {
          const progress = .58
          const arcLift = Math.min(72, Math.max(24, Math.abs(target.top - source.top) * .09))
          const animation = flight.animate([
            {
              top: `${source.top}px`, left: `${source.left}px`,
              width: `${source.width}px`, height: `${source.height}px`,
              offset: 0,
            },
            {
              top: `${source.top + ((target.top - source.top) * progress) - arcLift}px`,
              left: `${source.left + ((target.left - source.left) * progress)}px`,
              width: `${source.width + ((target.width - source.width) * progress)}px`,
              height: `${source.height + ((target.height - source.height) * progress)}px`,
              offset: progress,
            },
            {
              top: `${target.top}px`, left: `${target.left}px`,
              width: `${target.width}px`, height: `${target.height}px`,
              offset: 1,
            },
          ], {
            duration: ASSIGNMENT_CARD_MS,
            easing: 'cubic-bezier(.22,.61,.36,1)',
            fill: 'forwards',
          })
          try {
            await animation.finished
          } catch {
            return
          }
        }
      }

      if (runRef.current !== runId) return
      setTeams((current) => current.map((team, currentIndex) => (
        currentIndex === teamIndex ? [...team, player] : team
      )))
      setActiveCard(null)
      setMessage(`${index + 1} of ${LISTEN_PLAYERS.length} players assigned`)
      if (!reducedMotion && ASSIGNMENT_PAUSE_MS) await wait(ASSIGNMENT_PAUSE_MS)
    }

    setAssigning(false)
    setMessage('12 teams assigned.')
  }

  const resetAssignment = () => {
    runRef.current += 1
    setAssigning(false)
    setActiveCard(null)
    setTeams(emptyTeamAssignments())
    setMessage('Ready to assign 24 players into 12 teams.')
  }

  const flightStyle = activeCard ? {
    top: activeCard.source.top,
    left: activeCard.source.left,
    width: activeCard.source.width,
    height: activeCard.source.height,
  } : undefined

  return (
    <main className="product-page brand-listen">
      <ProductHeader brand={LISTEN} active="teams" />
      <section className="product-workspace assignment-workspace">
        <div className="page-heading assignment-heading">
          <div><p>Listen Labs · 2026</p><h1>Team assignment</h1></div>
          <div className="assignment-controls">
            <div><span>Players</span><strong>24</strong></div>
            <div><span>Teams</span><strong>12 × 2</strong></div>
            <button className="primary-button" onClick={runAssignment} disabled={assigning}>{assigning ? 'Assigning…' : 'Assign teams'}</button>
          </div>
        </div>

        <div className="feed-status" aria-live="polite"><span />{message}</div>

        <div className="assignment-board">
          <div className="team-slots">
            {teams.map((players, teamIndex) => (
              <article className={`team-slot ${players.length === 2 ? 'complete' : ''}`} key={teamIndex}>
                <div className="team-slot-header"><span>Team</span><strong>{String(teamIndex + 1).padStart(2, '0')}</strong></div>
                <div className="team-seats">
                  {[0, 1].map((seatIndex) => (
                    <div
                      className={`team-seat ${players[seatIndex] ? 'filled' : ''}`}
                      key={seatIndex}
                      ref={(node) => node ? seatRefs.current.set(`${teamIndex}-${seatIndex}`, node) : seatRefs.current.delete(`${teamIndex}-${seatIndex}`)}
                    >
                      <span>{players[seatIndex] || 'Open'}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="player-bank">
            <div className="player-bank-label"><span>Players</span><button onClick={resetAssignment} disabled={assigning || assignedPlayers.size === 0}>Reset</button></div>
            <div className="player-bank-grid">
              {LISTEN_PLAYERS.map((player) => {
                const unavailable = assignedPlayers.has(player) || activeCard?.player === player
                return (
                  <div
                    className={`player-card ${unavailable ? 'dealt' : ''}`}
                    key={player}
                    ref={(node) => node ? playerRefs.current.set(player, node) : playerRefs.current.delete(player)}
                  >
                    <span>{player}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {activeCard && <div className="flight-card" ref={flightRef} style={flightStyle}>{activeCard.player}</div>}
    </main>
  )
}

function Archive2025() {
  const assignments = useMemo(() => ASSIGNMENTS_2025, [])
  const { rows, error, updated, refreshing, refresh } = useLeaderboard(assignments, '2025-08-30')
  const maxYards = Math.max(1, ...rows.map((row) => row.passingYards ?? 0))
  usePageMetadata('Fantasy Fellas · 2025 Tracker', 'Archived Fantasy Fellas 2025 passing-yards tracker.')
  return (
    <main className="product-page brand-ff">
      <ProductHeader brand={FANTASY_FELLAS} active="archive" archive />
      <section className="product-workspace tracker-workspace">
        <div className="page-heading"><div><p>Fantasy Fellas · Archive</p><h1>2025 passing yards tracker</h1></div><div className="tracker-meta"><div><span>Game date</span><strong>Aug 30, 2025</strong></div><div><span>Updated</span><strong>{updated ? updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Connecting'}</strong></div><button onClick={refresh} disabled={refreshing}>Refresh</button></div></div>
        <div className={`feed-status ${error ? 'error' : ''}`}><span />{error || 'ESPN data · archived results'}</div>
        <div className="tracker-board">
          <div className="tracker-columns"><span>Rank</span><span>Participant</span><span>Team / matchup</span><span>Game</span><span>Passing yards</span></div>
          <div className="tracker-rows">{rows.map((row, index) => <article className="tracker-row" key={row.person}><div className="tracker-rank">{index + 1}</div><div className="tracker-person"><strong>{row.person}</strong></div><div className="tracker-team"><TeamLogo row={row} /><div><strong>{row.team}</strong><span>vs {row.opponent}</span></div></div><div className="tracker-game"><strong>{row.score}</strong><span>{row.status}</span></div><YardsCell row={row} maxYards={maxYards} /></article>)}</div>
        </div>
      </section>
    </main>
  )
}

function NotFound() {
  return <main className="not-found"><h1>404</h1><p>Page not found.</p><a href={routeHref(FANTASY_FELLAS.trackerPath)}>Fantasy Fellas tracker</a><a href={routeHref(LISTEN.trackerPath)}>Listen Labs tracker</a></main>
}

function App() {
  const basePath = BASE.replace(/\/$/, '')
  const path = window.location.pathname.startsWith(basePath) ? window.location.pathname.slice(basePath.length) || '/' : window.location.pathname
  if (path === '/' || path === FANTASY_FELLAS.trackerPath) return <TrackingPage brand={FANTASY_FELLAS} />
  if (path === FANTASY_FELLAS.drawPath || path === '/fantasy-fellas-draw-2026') return <DrawPage brand={FANTASY_FELLAS} />
  if (path === LISTEN.trackerPath) return <TrackingPage brand={LISTEN} />
  if (path === LISTEN.drawPath || path === '/listen-draw-2026') return <DrawPage brand={LISTEN} />
  if (path === LISTEN.teamsPath) return <ListenTeamAssignmentPage />
  if (path === '/fantasy-fellas-2025') return <Archive2025 />
  return <NotFound />
}

export default App
