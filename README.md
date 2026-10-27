# StudyDuel

**Study smarter. Compete harder.** A study platform for the SAT, PSAT, and AP exams with a focused, exam-style practice interface, real progress tracking, and live quiz matches with friends.

> StudyDuel is an independent study tool. It is not affiliated with, endorsed by, or sponsored by College Board. All questions are original. The product name is set in one place (`PRODUCT` in `src/lib/config.ts`).

## Features

- **Course search** (`/courses`): every SAT Suite and AP course (43), searchable by name, nickname ("APUSH", "calc", "APES"), or subject. Each course hub lists StudyDuel practice tests, skill practice, and links to College Board's own free materials: the official practice tests in Bluebook and released AP past exam questions. StudyDuel links to that content and never copies it.
- **Bluebook-style practice tests**: fixed test forms in `content/tests/practice-tests.json`, run in timed modules with a directions screen, module timer (hideable, low-time warning, auto-advance), mark for review, answer eliminator (ABC), math reference sheet, a "Check Your Work" page at the end of each module, no returning to finished modules, and a 10-minute break between SAT/PSAT sections. Results show a raw score report by section and module, not a scaled score. Current forms: SAT, PSAT/NMSQT, PSAT 8/9, and one short-form Section I test for each AP course with questions. They are shorter than real tests (the bank is small) but keep real per-question pacing.
- **Solo study**: Quick Practice (5/10/20, optional timer, instant or end-of-session feedback), Focus Mode (one skill, hints), Timed Challenge (score + personal bests), Review (incorrect, marked, saved, due), a shared Daily Challenge, and section-based Exam Simulation (clearly labeled as unofficial).
- **Exam engine**: passages, tables, charts, images, KaTeX math, multiple choice, multi-select, and student-produced numeric answers; navigator, mark for review, answer elimination, keyboard shortcuts, hide-able countdown with low-time warning and auto-submit, refresh-safe drafts, confirmation before submit, and a results page with explanations, topic breakdown, XP, and a recommended next session.
- **Original question bank**: 93 questions with explanations across SAT Reading and Writing (15), SAT Math (18), AP Statistics (10), AP Environmental Science (10), APUSH (10), AP English Language (9), plus starter sets for AP CSP (6), Biology (5), Chemistry (5), and Physics 1 (5). PSAT tracks reuse the SAT pool at easier difficulty levels. Coverage is labeled in the app.
- **Play with friends**: private rooms with 6-character codes and invite links, lobby with host, presence, and ready states, configurable exam/topic/count/difficulty/time/scoring/player limits, synchronized questions, server-validated answers, duplicate rejection, reveals with explanations, standings between rounds, final podium, play again, reconnect, and host hand-off.
- **Progression**: auditable XP ledger, published level formula, timezone-aware streaks, daily and weekly goals, skill mastery with a minimum sample size, readiness indicators, eight achievements, and an explainable recommendation engine.
- **Social**: friend requests by username, friend activity with privacy controls, and global, friends, weekly, monthly, and all-time leaderboards (XP, correct answers, wins, active days).
- **Two modes**:
  - **Demo mode** (no configuration): every solo feature plus a local practice match against clearly labeled bots. Data stays in the browser.
  - **Connected mode** (PostgreSQL, e.g. Render Postgres): accounts (email/password or guest), synced progress, online multiplayer, friends, and leaderboards.

## Quick start (demo mode)

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. No environment variables are needed; the banner at the top confirms demo mode.

## Connected mode locally

Requires a PostgreSQL 13+ database (a local install, Docker, or a Render database's External URL).

```bash
docker run -d --name studyduel-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16   # or use any Postgres
cp .env.example .env.local    # then set:
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
npm run build && npm start    # or npm run dev
```

Tables are created on the first request (the app applies pending migrations from `src/lib/server/migrations.ts` and syncs the question bank). You can also run `npm run db:migrate` yourself. Check configuration at any time with `GET /api/health`.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | server only | Postgres connection string. Leave empty for demo mode. Never expose to the browser. |
| `DATABASE_SSL` | server only | Optional: `disable`, `require`, or `verify`. Default: TLS on for remote hosts, off for `localhost` and Render internal hostnames. |
| `RESEND_API_KEY`, `EMAIL_FROM` | server only | Optional: send password reset emails through [Resend](https://resend.com). Without them, the reset page says resets aren't set up. |
| `APP_URL` | server only | Optional: base URL used in reset links (defaults to the request origin). |
| `CRON_SECRET` | server only | Protects `/api/cron/cleanup` (stale room and expired session cleanup). |
| `NEXT_PUBLIC_FORCE_DEMO_MODE` | public | `true` forces demo mode. |

If `DATABASE_URL` is set but isn't a `postgres://` URL, the app does **not** silently fall back: it shows a configuration warning banner and runs a browser-only preview. If the database can't be reached, online API routes return a clear error and `/api/health` reports the problem.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development, production build, production server |
| `npm run lint` / `typecheck` | ESLint and `tsc --noEmit` |
| `npm test` | Unit tests (content validation, grading, engine, XP, streaks, mastery, multiplayer rules) |
| `npm run test:db` | Database function and invariant tests against `DATABASE_URL` (reads `.env.local`; use a throwaway database) |
| `npm run test:e2e` | Playwright: builds a demo-mode server on port 3100 and runs the demo suites. Add `E2E_CONNECTED_URL=http://localhost:3000` to also run the connected suite |
| `npm run content:validate` | Validates `content/questions` and regenerates `question-file.schema.json` |
| `npm run db:migrate` | Applies pending migrations to `DATABASE_URL` (the app also does this on first use) |
| `npm run db:seed` | Upserts the question bank into `DATABASE_URL` (the app also does this on first use) |

## How it works

### Data and security model

- **Solo sessions** are created by the server, which chooses the question set and stamps the start time and deadline. Drafts autosave. On submit the server re-grades from the answer key (client-claimed correctness is never accepted), computes XP, and calls a single Postgres function that completes the session exactly once, in one transaction. Resubmitting returns the stored result. Submissions after the deadline are graded from the last draft saved before time ran out.
- **XP** is an append-only ledger (`xp_transactions`) with a unique key per source and reason, so rewards can't be duplicated. Correct-answer XP is paid once per question per 7 days with a daily cap; the daily challenge pays once per day (enforced in the database). `profiles.total_xp` is maintained by a trigger and is not client-writable.
- **Accounts** are handled by the app: passwords are stored only as salted scrypt hashes, and sign-in creates a random session token kept in an `httpOnly`, `SameSite=Lax` cookie (only its SHA-256 hash is stored). Changing or resetting a password signs out other devices. Guests get a real account without an email and can upgrade in place, keeping their progress.
- **Data access**: the browser never talks to the database. Every query runs in a server route and is scoped to the signed-in user in code; profile edits are limited to display name, username, and privacy flags. Answer keys are in `question_keys` and are never sent by the API. Leaderboards and friend data come from functions that expose only display names, usernames, and aggregates, and respect opt-outs.
- **Multiplayer** is server-authoritative without a long-running server. Each match is a small state machine (`countdown → question → reveal → … → finished`) stored in Postgres. Any member's request can apply a transition that is due, using a conditional update so concurrent requests can't double-advance. Answers are validated against the current question and deadline (with 750 ms grace), scored on the server (`100` per correct answer plus up to `50` speed bonus; wrong answers score `0`), and recorded by a function whose unique key rejects duplicates. Correctness stays hidden until the reveal. Room members poll the server every 1.5 seconds; each poll also records presence and can apply a due transition. Room codes alone never grant access: state is returned only to members.
- **Rate limiting**: durable database checks for room creation (10/hour), session creation, and friend requests, plus per-instance burst limits on every API route.
- **Demo mode** runs the same engine, grading, reward, and achievement code against `localStorage`.

### Project layout

```
content/questions/         Original question bank (JSON) + JSON Schema
src/app/                   Routes (App Router). (app) has the main shell; (focus) is the exam interface
src/app/api/               Route handlers: sessions, rooms, me, health, cron
src/components/            UI primitives (shadcn-style), exam engine, play, dashboard
src/lib/content/           Catalog, bank, grading, schema
src/lib/engine/            Session types, selection, grading + rewards (finalize)
src/lib/progression/       XP/levels, streaks/dates, mastery, achievements, stats, recommendations
src/lib/multiplayer/       Room rules, scoring, state machine
src/lib/server/            Trusted server services (db, auth, migrations, sessions, rooms, social, question sync)
src/lib/data/              Client repositories (local vs remote)
tests/unit, tests/integration, tests/e2e
```

See [docs/CONTENT.md](docs/CONTENT.md) to add questions or exams.

## Deploying: Vercel + Render Postgres

The app runs on Vercel; the database runs on Render.

1. **Create the database on Render.** Either New → Blueprint and pick this repo (uses `render.yaml`: Postgres 16 in Virginia, next to Vercel's default `iad1` region), or New → PostgreSQL by hand (pick the region closest to your Vercel functions). Under the database's **Networking/Access Control**, allow connections from `0.0.0.0/0`, because Vercel has no fixed outbound IPs. The connection still needs the password and uses TLS.
2. **Copy the External Database URL** from the database's Connect menu (it ends in `.render.com/<db name>`).
3. **Add environment variables in Vercel** (Settings → Environment Variables) for Production and Preview: `DATABASE_URL` (the External URL) and `CRON_SECRET` (any long random string). Optionally add `RESEND_API_KEY` and `EMAIL_FROM` for password reset emails. Redeploy after adding them.
4. **Tables are created automatically** on the first request after deploy. To do it ahead of time, run `DATABASE_URL="<external url>" npm run db:migrate` from your machine.
5. `vercel.json` schedules `/api/cron/cleanup` daily to close stale rooms and expire old sign-in sessions; Vercel sends `CRON_SECRET` automatically.

Hosting the app on Render instead also works: create a Node web service with build command `npm ci && npm run build`, start command `npm start`, and set `DATABASE_URL` to the **Internal** Database URL.

### Post-deployment smoke test

- [ ] `/api/health` returns `"mode":"connected"`, `"database":"ok"`, and an empty `problems` list.
- [ ] The landing page loads without the configuration banner; "Start studying" and "Play with friends" open working pages.
- [ ] Sign up, then complete a 5-question session; the dashboard shows it.
- [ ] Sign out and in again; the session is still listed. If Resend is configured, the password reset email arrives and `/auth/update-password` works.
- [ ] In two browsers (one signed in, one guest), create and join a room, see each other in the lobby with "Live updates connected", play a match to the final podium, and see XP on both dashboards.
- [ ] Leaderboard and Friends pages load for a registered account; adding a friend by username works.
- [ ] Toggle dark mode, and try a session on a phone-sized screen.

## Testing status

Run in this repository's development environment (local PostgreSQL 16):

- `npm test`: 74 unit tests.
- `npm run test:db`: 6 database tests (session completion, XP ledger, friends, leaderboards, guest restrictions, account deletion).
- `npm run test:e2e`: 11 demo-mode tests (desktop and mobile, including course search and full SAT and AP practice tests), plus 4 connected-mode tests covering persistence across sign-in, idempotent resubmission, a two-browser live match with duplicate-answer rejection, and a practice test with server-side draft autosave.
- `npm run build`, `npm run lint` (0 errors), `npm run typecheck`.

## Known limitations

- The question bank is small (93 questions). Starter AP sets have 5–6 questions each, and free-response, essay, DBQ/LEQ, and Create task practice are not included.
- No official or predicted scores are produced. Readiness indicators show the share of skills rated Strong; they are not score predictions.
- Practice answer keys ship to the browser so demo mode can grade offline. Server grading and XP rules prevent leaderboard inflation, but a determined student could look up answers in the bundle. For high-stakes competition, serve multiplayer questions only from the database and remove the bundle from the client.
- Per-instance rate limiting is best effort on serverless; durable limits cover the abuse-prone actions.
- Email or push study reminders are not implemented (the settings page says so). Accounts don't require email confirmation.
- Practice tests are short-form (one form per course) because the bank is small. SAT/PSAT modules are fixed, not adaptive, and there is no scaled score. Bluebook's highlighter/notes tool and built-in graphing calculator are not replicated.
- Per-module timers and module locks are enforced in the browser; the server enforces the overall test deadline and grades late submissions from the last saved draft.
- Official College Board links in `src/lib/content/course-directory.ts` follow College Board's URL patterns but could not be checked from the build environment (its network blocks collegeboard.org). Click through them once after deploying.
- Progress made in demo mode or while signed out stays on that device and isn't imported when you create an account (guest accounts that upgrade keep their progress).
- The privacy policy and terms are templates and have not been legally reviewed.
