# Mergezy

A daily tile-merge puzzle for [bgameworld.com](https://bgameworld.com), alongside the Wordezy games, Sortezy and When & Where.

Place each tile on a 5×5 board. Join 3 or more tiles of the same colour and number and they merge into one tile a number higher, on the square you just played. The new tile can merge again straight away (a combo). A star tile copies the neighbour it would merge best with, and three 5s burst, clearing the squares around them. The game ends when the board is full.

- **Daily**: free. Everyone gets the same tiles in the same order (generated from the date, so nothing is fetched). Three tries a day; the best one counts. A reload mid-game keeps the board. The result shares as a spoiler-free summary.
- **Free play**: endless games with a fresh run of tiles each time. Behind a one-time $2 unlock, which is a stub until payments are set up (same as the other games).
- **Leaderboard and crowd stats**: same Supabase project and account system as the other games. Ranked by each player's best try; the daily screen shows "N players today · avg · best".
- **Achievements, streaks, best scores**: stored on the device.

Scoring: a merge scores the tile number × the tiles merged × 10, multiplied by the combo step (×2 for the second merge in a chain, and so on). A burst adds a bonus. Early tiles are all 1s; 2s and later 3s turn up more often the longer a game lasts.

## Run it locally

```bash
npm install
cp .env.example .env.local   # same Supabase URL and anon key as the other games
npm run dev
```

## Database

The leaderboard needs `supabase/migrations/20261011_mergezy.sql`. Run it once in the Supabase SQL editor for the shared project. It only creates new `mergezy_*` objects and is safe to run twice. Until it's run, the game still works and the leaderboard and crowd stats stay hidden.

## Deploy (Cloudflare)

Same setup as the other games:

1. Push this repo to GitHub.
2. In Cloudflare, create a Worker from the repo. Build command `npm run build`, deploy command `npx wrangler deploy` (see `wrangler.jsonc`).
3. Add the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` build variables.
4. Add the custom domain `mergezy.bgameworld.com`.
5. In Google Search Console, submit `https://mergezy.bgameworld.com/sitemap.xml`.

## SEO

`index.html` has the title and description, canonical URL, Open Graph and X/Twitter cards with `public/og-image.jpg`, `VideoGame` structured data, a `<noscript>` description, icons and a web manifest. `public/robots.txt` and `public/sitemap.xml` point at the subdomain.

## Tuning

`src/lib/merge.ts` holds the rules. `SIZE` and `COLORS` set the board, `tileAt` sets which tiles turn up when, `mergePoints` the scoring and `TOP_VALUE` the burst. Changing `tileAt` changes every daily puzzle, so avoid it mid-day once the game is live. `LAUNCH_DATE` is the day that counts as No. 1.
