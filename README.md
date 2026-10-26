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
  - **Connected mode** (Supabase): accounts (email/password or guest), synced progress, online multiplayer, friends, and leaderboards.

## Quick start (demo mode)

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. No environment variables are needed; the banner at the top confirms demo mode.

## Connected mode locally

Requires Docker.

```bash
npx supabase start            # starts Postgres, Auth, Realtime, and applies supabase/migrations + seed.sql
cp .env.example .env.local    # then paste the values printed by `supabase start`:
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
#   SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
npm run build && npm start    # or npm run dev
```

`supabase/config.toml` enables anonymous sign-ins (guest play) and disables email confirmation locally. Confirmation emails, if enabled, appear in Mailpit at http://127.0.0.1:54324. Check configuration at any time with `GET /api/health`.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL. Leave empty for demo mode. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Anon or publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` also works). |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Trusted writes: grading, XP, rooms. Never expose to the browser. |
| `CRON_SECRET` | server only | Protects `/api/cron/cleanup` (stale room cleanup). |
| `NEXT_PUBLIC_FORCE_DEMO_MODE` | public | `true` forces demo mode. |

If only one of the public Supabase variables is set, the app does **not** silently fall back: it shows a configuration warning banner and runs a browser-only preview. If the service role key is missing, online API routes return a clear 503 message and `/api/health` reports the problem.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development, production build, production server |
| `npm run lint` / `typecheck` | ESLint and `tsc --noEmit` |
| `npm test` | Unit tests (content validation, grading, engine, XP, streaks, mastery, multiplayer rules) |
| `npm run test:db` | Database authorization tests against Supabase (reads `.env.local`) |
| `npm run test:e2e` | Playwright: builds a demo-mode server on port 3100 and runs the demo suites. Add `E2E_CONNECTED_URL=http://localhost:3000` to also run the connected suite |
| `npm run content:validate` | Validates `content/questions` and regenerates `question-file.schema.json` |
| `npm run db:seed-sql` | Regenerates `supabase/seed.sql` from the bank |
| `npm run db:seed` | Upserts the bank into the Supabase project in `.env.local` |

## How it works

### Data and security model

- **Solo sessions** are created by the server, which chooses the question set and stamps the start time and deadline. Drafts autosave. On submit the server re-grades from the answer key (client-claimed correctness is never accepted), computes XP, and calls a single `SECURITY DEFINER` Postgres function that completes the session exactly once. Resubmitting returns the stored result. Submissions after the deadline are graded from the last draft saved before time ran out.
- **XP** is an append-only ledger (`xp_transactions`) with a unique key per source and reason, so rewards can't be duplicated. Correct-answer XP is paid once per question per 7 days with a daily cap; the daily challenge pays once per day (enforced in the database). `profiles.total_xp` is maintained by a trigger and is not client-writable.
- **Row Level Security** is on for every table. Students can read only their own history; column privileges restrict profile edits to display name, username, and privacy flags. Answer keys are in `question_keys`, which has no client policies. Leaderboards and friend data come from functions that expose only display names, usernames, and aggregates, and respect opt-outs.
- **Multiplayer** is server-authoritative without a long-running server. Each match is a small state machine (`countdown → question → reveal → … → finished`) stored in Postgres. Any member's request can apply a transition that is due, using a conditional update so concurrent requests can't double-advance. Answers are validated against the current question and deadline (with 750 ms grace), scored on the server (`100` per correct answer plus up to `50` speed bonus; wrong answers score `0`), and recorded by a function whose unique key rejects duplicates. Correctness stays hidden until the reveal. Supabase Realtime private channels (authorized by RLS on `realtime.messages`) carry presence and "state changed" pings; clients fall back to polling if Realtime is unavailable. Room codes alone never grant access: state is returned only to members.
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
src/lib/server/            Trusted server services (sessions, rooms, question sync)
src/lib/data/              Client repositories (local vs remote)
supabase/migrations/       Schema, RLS, functions;  supabase/seed.sql is generated
tests/unit, tests/integration, tests/e2e
```

See [docs/CONTENT.md](docs/CONTENT.md) to add questions or exams.

## Deploying to Vercel with Supabase

1. **Create a Supabase project.** In the SQL editor, run the files in `supabase/migrations/` in order (or `npx supabase link --project-ref <ref> && npx supabase db push`). Optionally run `supabase/seed.sql`; the app also seeds the bank automatically on first use.
2. **Auth settings** (Authentication → Sign In / Providers):
   - Enable Email. Keep "Confirm email" on for production.
   - Enable **Anonymous sign-ins** to allow guest play and the "demo account" button. If you leave it off, the app tells guests to create an account.
   - Authentication → URL Configuration: set **Site URL** to your production URL and add redirect URLs `https://<your-domain>/auth/callback` and, for preview deployments, `https://*-<your-team>.vercel.app/auth/callback`.
3. **Realtime**: no extra setup. The migration adds the RLS policies for private room channels. (If you disabled "Allow public access" in Realtime settings, private channels still work.)
4. **Import the GitHub repository in Vercel** (Add New → Project). Framework preset: Next.js. No build settings to change.
5. **Add environment variables** in Vercel (Settings → Environment Variables) for Production and Preview: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` (any long random string). Redeploy after adding them.
6. `vercel.json` schedules `/api/cron/cleanup` daily to close stale rooms; Vercel sends `CRON_SECRET` automatically.

### Post-deployment smoke test

- [ ] `/api/health` returns `"mode":"connected"`, `"database":"ok"`, and an empty `problems` list.
- [ ] The landing page loads without the configuration banner; "Start studying" and "Play with friends" open working pages.
- [ ] Sign up, confirm the email link (it should land on `/auth/callback` and continue), then complete a 5-question session; the dashboard shows it.
- [ ] Sign out and in again; the session is still listed. Password reset email arrives and `/auth/update-password` works.
- [ ] In two browsers (one signed in, one guest), create and join a room, see each other in the lobby with "Live updates connected", play a match to the final podium, and see XP on both dashboards.
- [ ] Leaderboard and Friends pages load for a registered account; adding a friend by username works.
- [ ] Toggle dark mode, and try a session on a phone-sized screen.

## Testing status

Run in this repository's development environment (local Supabase via the Supabase CLI):

- `npm test`: 74 unit tests.
- `npm run test:db`: 6 authorization and friends/leaderboard tests against local Supabase.
- `npm run test:e2e`: 11 demo-mode tests (desktop and mobile, including course search and full SAT and AP practice tests), plus 4 connected-mode tests covering persistence across sign-in, idempotent resubmission, a two-browser live match with duplicate-answer rejection, and a practice test with server-side draft autosave.
- `npm run build`, `npm run lint` (0 errors), `npm run typecheck`.

## Known limitations

- The question bank is small (93 questions). Starter AP sets have 5–6 questions each, and free-response, essay, DBQ/LEQ, and Create task practice are not included.
- No official or predicted scores are produced. Readiness indicators show the share of skills rated Strong; they are not score predictions.
- Practice answer keys ship to the browser so demo mode can grade offline. Server grading and XP rules prevent leaderboard inflation, but a determined student could look up answers in the bundle. For high-stakes competition, serve multiplayer questions only from the database and remove the bundle from the client.
- Per-instance rate limiting is best effort on serverless; durable limits cover the abuse-prone actions.
- Email or push study reminders are not implemented (the settings page says so).
- Practice tests are short-form (one form per course) because the bank is small. SAT/PSAT modules are fixed, not adaptive, and there is no scaled score. Bluebook's highlighter/notes tool and built-in graphing calculator are not replicated.
- Per-module timers and module locks are enforced in the browser; the server enforces the overall test deadline and grades late submissions from the last saved draft.
- Official College Board links in `src/lib/content/course-directory.ts` follow College Board's URL patterns but could not be checked from the build environment (its network blocks collegeboard.org). Click through them once after deploying.
- Progress made in demo mode or while signed out stays on that device and isn't imported when you create an account (guest accounts that upgrade keep their progress).
- The privacy policy and terms are templates and have not been legally reviewed.
