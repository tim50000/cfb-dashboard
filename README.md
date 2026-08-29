# College Football Draw and Trackers

Separate college-football team draws and passing-yard trackers for Fantasy Fellas and Listen Labs.

## Pages

- `/fantasy-fellas-2026` — Fantasy Fellas passing-yards tracker
- `/fantasy-fellas-2026/draw` — Fantasy Fellas team draw
- `/listen-2026` — Listen Labs passing-yards tracker
- `/listen-2026/draw` — Listen Labs team draw
- `/listen-2026/teams` — Listen Labs 24-player team assignment
- `/fantasy-fellas-2025` — archived 2025 dashboard

The root route opens the 2026 leaderboard. ESPN's public college football scoreboard and summary feeds provide schedules, scores, game states, logos, and team passing yards.

## Team draw

Run a cryptographically random draw from every college team scheduled on a date:

```bash
npm run assign:ff -- 2026-09-05
npm run assign:listen -- 2026-09-05
```

The scripts require at least 12 scheduled teams, assign one unique team to each person, and write separate official assignment files for Fantasy Fellas and Listen Labs.

Each draw page can also run practice draws in the browser and copy or download its results. Browser draws do not overwrite either official repository file.

The Listen Labs team-assignment page randomly pairs 24 players into 12 teams of two with an animated one-second placement for each player.

## Local development

```bash
npm ci
npm run dev
```

Create a production build with `npm run build`. The post-build step adds a GitHub Pages fallback so direct visits to each client-side route work.
