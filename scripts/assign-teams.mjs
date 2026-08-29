#!/usr/bin/env node

import { randomInt } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PEOPLE = ['Blake', 'Chris', 'David', 'Higgins', 'Nic', 'Q', 'Sam', 'Shyam', 'Steven', 'Tommy', 'Vandy', 'Will']
const DEFAULT_DATE = '2026-08-29'
const API = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard'
const ORGANIZATIONS = {
  'fantasy-fellas': { label: 'FANTASY FELLAS', output: 'src/data/assignments-2026.json' },
  listen: { label: 'LISTEN LABS', output: 'src/data/listen-assignments-2026.json' },
}

function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()) }
function shuffle(items) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}
function scheduleTeams(events) {
  const teams = events.flatMap((event) => {
    const competitors = event.competitions?.[0]?.competitors || []
    return competitors.map((entry) => {
      const opponent = competitors.find((other) => other.id !== entry.id)
      return { team: entry.team?.location || entry.team?.shortDisplayName || entry.team?.displayName, logo: entry.team?.logo || '', opponent: opponent?.team?.shortDisplayName || opponent?.team?.location || 'TBD', event: event.shortName || event.name }
    })
  }).filter((entry) => entry.team)
  return [...new Map(teams.map((entry) => [entry.team, entry])).values()]
}

const requestedOrganization = process.argv[2]
const organization = ORGANIZATIONS[requestedOrganization] ? requestedOrganization : 'fantasy-fellas'
const date = (organization === requestedOrganization ? process.argv[3] : process.argv[2]) || DEFAULT_DATE
if (!validDate(date)) {
  console.error(`Invalid date "${date}". Use YYYY-MM-DD, for example 2026-09-05.`)
  process.exit(1)
}
const response = await fetch(`${API}?dates=${date.replaceAll('-', '')}&limit=400`)
if (!response.ok) throw new Error(`ESPN schedule request failed (${response.status}).`)
const schedule = await response.json()
const teams = scheduleTeams(schedule.events || [])
if (teams.length < PEOPLE.length) throw new Error(`Only ${teams.length} teams are scheduled on ${date}; ${PEOPLE.length} are required.`)
const selected = shuffle(teams).slice(0, PEOPLE.length)
const assignments = PEOPLE.map((person, index) => ({ person, team: selected[index].team }))
const teamDetails = Object.fromEntries(selected.map((entry) => [entry.team, { logo: entry.logo, opponent: entry.opponent, event: entry.event }]))
const now = new Date()
const output = {
  season: Number(date.slice(0, 4)),
  date,
  drawId: `${date.replaceAll('-', '')}-${now.getTime().toString(36)}`,
  generatedAt: now.toISOString(),
  poolSize: teams.length,
  eligibleTeams: teams.map(({ team }) => team),
  assignments,
  teams: teamDetails,
}
const outputPath = resolve(ORGANIZATIONS[organization].output)
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(`\n${ORGANIZATIONS[organization].label} · ${date} · ${teams.length} ELIGIBLE TEAMS\n`)
assignments.forEach(({ person, team }, index) => console.log(`${String(index + 1).padStart(2, '0')}  ${person.padEnd(9)}  ${team}`))
console.log(`\nOfficial assignment file written to ${outputPath}\n`)
