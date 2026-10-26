# Adding questions and exams

All questions are original and live in `content/questions/*.json`. The app bundles them at build time and syncs them to the `questions` / `question_keys` tables automatically the first time a server route needs them (or run `npm run db:seed`).

## Question format

Each file is `{ "questions": [ ... ] }`. Add `"$schema": "./question-file.schema.json"` for editor autocomplete and validation.

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Unique, lowercase kebab-case, e.g. `sat-math-alg-006`. Never reuse or rename an id once published: attempts reference it. |
| `exam` | yes | Program family: `sat` or `ap` (add more freely). |
| `course` | yes | Must exist in `COURSES` in `src/lib/content/catalog.ts`. |
| `section` | yes | SAT section or AP unit, e.g. `Math`, `Unit 3: Populations`. |
| `topic`, `skill` | yes | Used for filtering, mastery, and recommendations. Reuse existing skill names when the skill is the same. |
| `difficulty` | yes | `easy`, `medium`, or `hard`. |
| `type` | yes | `mcq` (one answer), `multi` (select all that apply, no partial credit), or `numeric` (student-produced response). |
| `prompt` | yes | Question stem. |
| `passage` | no | `{ "title"?, "text", "source"? }`. Shown beside the question on desktop. |
| `figure` | no | `table` (`columns`, `rows`), `chart` (`chartType`: `bar`/`line`/`scatter`, `xLabel`, `yLabel`, `data: [{x, y}]`), or `image` (`src` under `/public/figures/`, `alt`, `width`, `height`). |
| `choices` | mcq/multi | `[{ "id": "A", "text": "..." }]`, 2–6 choices with distinct text. |
| `correct` | yes | Choice ids, or accepted numeric strings such as `["3/4", "0.75"]`. Equivalent fractions and decimals are accepted automatically. |
| `tolerance` | no | Absolute tolerance for numeric answers (default `0.0001`). |
| `explanation` | yes | Why the answer is right and, ideally, why tempting distractors are wrong. |
| `hint` | no | Shown only in modes with hints enabled. |
| `estimatedSeconds` | yes | Used to size timed sessions. |
| `tags`, `version` | yes | Bump `version` when you materially change a question. |

### Text formatting

`$...$` inline math and `$$...$$` display math (KaTeX), `**bold**`, `*italic*`, `__underline__`, a run of six or more underscores for a blank (`______`), fenced code blocks with triple backticks, and lines starting with `- ` for bullet lists. Use `\\$` inside math for a dollar sign.

Text is rendered as escaped React text, and KaTeX runs with `trust: false`, so content cannot inject HTML. Images must be files you add under `public/figures/`.

## Adding a new exam or course

1. Add the course to `COURSES` and a study track to `TRACKS` in `src/lib/content/catalog.ts` (set `coverage` honestly: `core` or `starter`).
2. Create `content/questions/<course>.json`.
3. Import the file in `src/lib/content/bank.ts` (one line in `FILES`).
4. Run `npm run content:validate` and `npm test`. The unit tests check every key grades correctly and that answer letters aren't skewed.

## Quality rules

- Original content only. Never copy questions from official tests, prep books, or websites.
- Every question needs plausible distractors and an explanation that matches the keyed answer.
- Spread correct answers across choice letters.
- Don't pad the bank with near-duplicates.

## Practice test forms

`content/tests/practice-tests.json` defines fixed tests. Each test has a `track`, a `title`, a `description`, `modules` (each with `id`, `title`, `section`, `minutes`, and ordered `questionIds` from that track's pool), and `breakAfter` (module indexes followed by a 10-minute break). Keep questions that share a passage together and in order. Unit tests check that every id exists, belongs to the test's track, and appears once.

## Course directory

`src/lib/content/course-directory.ts` lists every course in the search tool, including courses without StudyDuel questions. Set `track` to connect a course to a study track. Official links point to College Board's own pages; keep all external URLs in that file.
