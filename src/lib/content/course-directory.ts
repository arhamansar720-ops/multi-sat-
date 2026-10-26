/**
 * Directory of every course the search tool knows about, including courses
 * StudyDuel has no questions for yet. Official links point to College Board's
 * own free materials (practice tests in Bluebook, released past exam
 * questions); StudyDuel never copies that content.
 *
 * All external URLs live in this file so they are easy to audit and update.
 */
export type SubjectArea = "SAT Suite" | "Arts" | "English" | "History and Social Sciences" | "Math and Computer Science" | "Sciences" | "World Languages and Cultures" | "AP Capstone";

export type ExamFormat = "digital-test" | "exam" | "portfolio";

export interface OfficialLink {
  label: string;
  url: string;
  description: string;
}

export interface DirectoryCourse {
  slug: string;
  name: string;
  program: "SAT Suite" | "AP";
  subject: SubjectArea;
  /** Extra search terms: abbreviations and nicknames students use. */
  aliases: string[];
  format: ExamFormat;
  /** StudyDuel study track with original questions, if any. */
  track?: string;
  officialLinks: OfficialLink[];
}

export const BLUEBOOK_URL = "https://bluebook.collegeboard.org/";
const SAT_PRACTICE_TESTS_URL = "https://satsuite.collegeboard.org/practice/practice-tests";
const KHAN_SAT_URL = "https://www.khanacademy.org/test-prep/digital-sat";

function satLinks(testName: string): OfficialLink[] {
  return [
    { label: "Official full-length practice tests", url: SAT_PRACTICE_TESTS_URL, description: `College Board's free ${testName} practice tests, taken in the Bluebook app.` },
    { label: "Download Bluebook", url: BLUEBOOK_URL, description: "College Board's testing app, where official practice tests run." },
    { label: "Official Digital SAT Prep on Khan Academy", url: KHAN_SAT_URL, description: "Free practice made in partnership with College Board." },
  ];
}

function apLinks(slug: string, format: ExamFormat): OfficialLink[] {
  const links: OfficialLink[] = [
    { label: "AP course and exam overview", url: `https://apstudents.collegeboard.org/courses/${slug}`, description: "Exam format, dates, and course content from College Board." },
  ];
  if (format === "exam") {
    links.push({
      label: "Past exam questions",
      url: `https://apcentral.collegeboard.org/courses/${slug}/exam/past-exam-questions`,
      description: "Free-response questions from past exams, with scoring guidelines, released by College Board.",
    });
  }
  return links;
}

function ap(slug: string, name: string, subject: SubjectArea, aliases: string[], opts: { format?: ExamFormat; track?: string } = {}): DirectoryCourse {
  const format = opts.format ?? "exam";
  return { slug, name, program: "AP", subject, aliases, format, track: opts.track, officialLinks: apLinks(slug, format) };
}

export const DIRECTORY: DirectoryCourse[] = [
  { slug: "sat", name: "SAT", program: "SAT Suite", subject: "SAT Suite", aliases: ["digital sat", "college board sat", "rw", "reading and writing", "math"], format: "digital-test", track: "sat", officialLinks: satLinks("SAT") },
  { slug: "psat-nmsqt", name: "PSAT/NMSQT & PSAT 10", program: "SAT Suite", subject: "SAT Suite", aliases: ["psat", "nmsqt", "national merit", "psat 10"], format: "digital-test", track: "psat-nmsqt", officialLinks: satLinks("PSAT/NMSQT and PSAT 10") },
  { slug: "psat-8-9", name: "PSAT 8/9", program: "SAT Suite", subject: "SAT Suite", aliases: ["psat 8", "psat 9", "8th grade", "9th grade"], format: "digital-test", track: "psat-8-9", officialLinks: satLinks("PSAT 8/9") },

  ap("ap-2-d-art-and-design", "AP 2-D Art and Design", "Arts", ["2d art", "art and design", "portfolio"], { format: "portfolio" }),
  ap("ap-3-d-art-and-design", "AP 3-D Art and Design", "Arts", ["3d art", "sculpture", "portfolio"], { format: "portfolio" }),
  ap("ap-drawing", "AP Drawing", "Arts", ["drawing", "portfolio"], { format: "portfolio" }),
  ap("ap-art-history", "AP Art History", "Arts", ["art history", "arth"]),
  ap("ap-music-theory", "AP Music Theory", "Arts", ["music", "theory"]),

  ap("ap-english-language-and-composition", "AP English Language and Composition", "English", ["ap lang", "lang", "english language", "rhetoric", "apel"], { track: "ap-english-language" }),
  ap("ap-english-literature-and-composition", "AP English Literature and Composition", "English", ["ap lit", "lit", "english literature"]),

  ap("ap-african-american-studies", "AP African American Studies", "History and Social Sciences", ["aaas", "african american"]),
  ap("ap-comparative-government-and-politics", "AP Comparative Government and Politics", "History and Social Sciences", ["comp gov", "comparative government"]),
  ap("ap-european-history", "AP European History", "History and Social Sciences", ["apeuro", "euro", "european"]),
  ap("ap-human-geography", "AP Human Geography", "History and Social Sciences", ["aphug", "hug", "human geo", "geography"]),
  ap("ap-macroeconomics", "AP Macroeconomics", "History and Social Sciences", ["macro", "economics", "econ"]),
  ap("ap-microeconomics", "AP Microeconomics", "History and Social Sciences", ["micro", "economics", "econ"]),
  ap("ap-psychology", "AP Psychology", "History and Social Sciences", ["psych", "appsych"]),
  ap("ap-united-states-government-and-politics", "AP United States Government and Politics", "History and Social Sciences", ["apgov", "us gov", "government", "civics"]),
  ap("ap-united-states-history", "AP United States History", "History and Social Sciences", ["apush", "us history", "american history"], { track: "ap-us-history" }),
  ap("ap-world-history-modern", "AP World History: Modern", "History and Social Sciences", ["apwh", "world history", "whap"]),

  ap("ap-calculus-ab", "AP Calculus AB", "Math and Computer Science", ["calc ab", "calculus"]),
  ap("ap-calculus-bc", "AP Calculus BC", "Math and Computer Science", ["calc bc", "calculus"]),
  ap("ap-computer-science-a", "AP Computer Science A", "Math and Computer Science", ["apcsa", "csa", "java", "computer science"]),
  ap("ap-computer-science-principles", "AP Computer Science Principles", "Math and Computer Science", ["apcsp", "csp", "computer science"], { track: "ap-computer-science-principles" }),
  ap("ap-precalculus", "AP Precalculus", "Math and Computer Science", ["precalc", "pre-calculus"]),
  ap("ap-statistics", "AP Statistics", "Math and Computer Science", ["ap stats", "stats", "statistics"], { track: "ap-statistics" }),

  ap("ap-biology", "AP Biology", "Sciences", ["ap bio", "bio", "biology"], { track: "ap-biology" }),
  ap("ap-chemistry", "AP Chemistry", "Sciences", ["ap chem", "chem", "chemistry"], { track: "ap-chemistry" }),
  ap("ap-environmental-science", "AP Environmental Science", "Sciences", ["apes", "enviro", "environmental"], { track: "ap-environmental-science" }),
  ap("ap-physics-1", "AP Physics 1: Algebra-Based", "Sciences", ["physics 1", "p1", "physics"], { track: "ap-physics-1" }),
  ap("ap-physics-2", "AP Physics 2: Algebra-Based", "Sciences", ["physics 2", "p2", "physics"]),
  ap("ap-physics-c-electricity-and-magnetism", "AP Physics C: Electricity and Magnetism", "Sciences", ["physics c", "e&m", "emag", "physics"]),
  ap("ap-physics-c-mechanics", "AP Physics C: Mechanics", "Sciences", ["physics c", "mech", "physics"]),

  ap("ap-chinese-language-and-culture", "AP Chinese Language and Culture", "World Languages and Cultures", ["chinese", "mandarin"]),
  ap("ap-french-language-and-culture", "AP French Language and Culture", "World Languages and Cultures", ["french"]),
  ap("ap-german-language-and-culture", "AP German Language and Culture", "World Languages and Cultures", ["german"]),
  ap("ap-italian-language-and-culture", "AP Italian Language and Culture", "World Languages and Cultures", ["italian"]),
  ap("ap-japanese-language-and-culture", "AP Japanese Language and Culture", "World Languages and Cultures", ["japanese"]),
  ap("ap-latin", "AP Latin", "World Languages and Cultures", ["latin", "vergil", "caesar"]),
  ap("ap-spanish-language-and-culture", "AP Spanish Language and Culture", "World Languages and Cultures", ["spanish lang", "spanish"]),
  ap("ap-spanish-literature-and-culture", "AP Spanish Literature and Culture", "World Languages and Cultures", ["spanish lit", "spanish"]),

  ap("ap-seminar", "AP Seminar", "AP Capstone", ["capstone", "seminar"], { format: "portfolio" }),
  ap("ap-research", "AP Research", "AP Capstone", ["capstone", "research"], { format: "portfolio" }),
];

export const SUBJECT_AREAS: SubjectArea[] = [
  "SAT Suite",
  "Math and Computer Science",
  "Sciences",
  "English",
  "History and Social Sciences",
  "World Languages and Cultures",
  "Arts",
  "AP Capstone",
];

export function getDirectoryCourse(slug: string): DirectoryCourse | undefined {
  return DIRECTORY.find((c) => c.slug === slug);
}

export function directoryCourseForTrack(track: string): DirectoryCourse | undefined {
  return DIRECTORY.find((c) => c.track === track);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim();
}

/**
 * Ranks courses for a query: exact alias or abbreviation first, then name
 * prefix, then any word match. Every query word must match somewhere.
 */
export function searchCourses(query: string, courses: DirectoryCourse[] = DIRECTORY): DirectoryCourse[] {
  const q = normalize(query);
  if (!q) return courses;
  const words = q.split(" ");
  const scored: { c: DirectoryCourse; score: number }[] = [];
  for (const c of courses) {
    const name = normalize(c.name);
    const aliases = c.aliases.map(normalize);
    const haystack = [name, normalize(c.subject), ...aliases].join(" ");
    if (!words.every((w) => haystack.includes(w))) continue;
    let score = 0;
    if (aliases.includes(q) || name === q) score += 100;
    if (name.startsWith(q) || name.replace(/^ap /, "").startsWith(q)) score += 50;
    if (aliases.some((a) => a.startsWith(q))) score += 30;
    if (c.track) score += 5; // courses with practice float up on ties
    scored.push({ c, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name)).map((s) => s.c);
}
