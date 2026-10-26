import type { Difficulty } from "./types";

/**
 * Study tracks are what students pick ("SAT", "AP Statistics"...). A track
 * draws from one or more courses in the question bank, optionally limited to
 * certain difficulties. Add a new exam by adding courses + a track here and
 * dropping a JSON file in content/questions. No other code changes needed.
 */
export interface CourseDef {
  id: string;
  exam: "sat" | "ap";
  name: string;
}

export type Coverage = "core" | "starter" | "planned";

export interface TrackDef {
  slug: string;
  name: string;
  shortName: string;
  program: "SAT Suite" | "AP";
  description: string;
  courses: string[];
  difficulties?: Difficulty[];
  coverage: Coverage;
  /** Tailwind color utility root used for accents, e.g. "blue". */
  accent: "blue" | "violet" | "emerald" | "amber" | "rose" | "cyan" | "orange" | "teal" | "indigo" | "lime";
  formatNote: string;
}

export const COURSES: CourseDef[] = [
  { id: "sat-rw", exam: "sat", name: "SAT Reading and Writing" },
  { id: "sat-math", exam: "sat", name: "SAT Math" },
  { id: "ap-statistics", exam: "ap", name: "AP Statistics" },
  { id: "ap-environmental-science", exam: "ap", name: "AP Environmental Science" },
  { id: "ap-us-history", exam: "ap", name: "AP United States History" },
  { id: "ap-english-language", exam: "ap", name: "AP English Language and Composition" },
  { id: "ap-computer-science-principles", exam: "ap", name: "AP Computer Science Principles" },
  { id: "ap-biology", exam: "ap", name: "AP Biology" },
  { id: "ap-chemistry", exam: "ap", name: "AP Chemistry" },
  { id: "ap-physics-1", exam: "ap", name: "AP Physics 1" },
];

export const TRACKS: TrackDef[] = [
  {
    slug: "sat",
    name: "SAT",
    shortName: "SAT",
    program: "SAT Suite",
    description: "Reading and Writing plus Math, organized by the skill domains of the digital SAT.",
    courses: ["sat-rw", "sat-math"],
    coverage: "core",
    accent: "blue",
    formatNote:
      "Practice sets follow the digital SAT's two sections and skill domains. Short quizzes do not produce an official or predicted SAT score.",
  },
  {
    slug: "psat-nmsqt",
    name: "PSAT/NMSQT & PSAT 10",
    shortName: "PSAT",
    program: "SAT Suite",
    description: "The same skill domains as the SAT, drawn from the easy and medium questions in the shared pool.",
    courses: ["sat-rw", "sat-math"],
    difficulties: ["easy", "medium"],
    coverage: "core",
    accent: "indigo",
    formatNote:
      "PSAT practice uses the shared SAT Suite skill pool limited to easy and medium questions. It is not a separate PSAT-specific question set.",
  },
  {
    slug: "psat-8-9",
    name: "PSAT 8/9",
    shortName: "PSAT 8/9",
    program: "SAT Suite",
    description: "Foundational Reading, Writing, and Math skills from the shared pool's easier questions.",
    courses: ["sat-rw", "sat-math"],
    difficulties: ["easy"],
    coverage: "starter",
    accent: "cyan",
    formatNote: "PSAT 8/9 practice uses the easy questions from the shared SAT Suite pool, so the set is small.",
  },
  {
    slug: "ap-statistics",
    name: "AP Statistics",
    shortName: "AP Stats",
    program: "AP",
    description: "Exploring data, sampling and experiments, probability, and inference.",
    courses: ["ap-statistics"],
    coverage: "core",
    accent: "violet",
    formatNote: "Multiple-choice practice organized by unit. Free-response questions are not included yet.",
  },
  {
    slug: "ap-environmental-science",
    name: "AP Environmental Science",
    shortName: "APES",
    program: "AP",
    description: "Ecosystems, populations, energy, pollution, and global change.",
    courses: ["ap-environmental-science"],
    coverage: "core",
    accent: "emerald",
    formatNote: "Multiple-choice and quantitative practice by unit. Free-response questions are not included yet.",
  },
  {
    slug: "ap-us-history",
    name: "AP United States History",
    shortName: "APUSH",
    program: "AP",
    description: "Stimulus-based questions on periods from colonial America through the modern era.",
    courses: ["ap-us-history"],
    coverage: "core",
    accent: "amber",
    formatNote: "Stimulus-based multiple-choice practice. Short-answer, DBQ, and LEQ practice are not included yet.",
  },
  {
    slug: "ap-english-language",
    name: "AP English Language and Composition",
    shortName: "AP Lang",
    program: "AP",
    description: "Rhetorical situation, claims and evidence, reasoning, and style.",
    courses: ["ap-english-language"],
    coverage: "core",
    accent: "rose",
    formatNote: "Passage-based multiple-choice practice. Essay prompts are not included yet.",
  },
  {
    slug: "ap-computer-science-principles",
    name: "AP Computer Science Principles",
    shortName: "AP CSP",
    program: "AP",
    description: "Algorithms, data, the internet, and the impact of computing.",
    courses: ["ap-computer-science-principles"],
    coverage: "starter",
    accent: "teal",
    formatNote: "Starter set of multiple-choice questions. The Create performance task is not covered.",
  },
  {
    slug: "ap-biology",
    name: "AP Biology",
    shortName: "AP Bio",
    program: "AP",
    description: "Cells, energetics, genetics, evolution, and ecology.",
    courses: ["ap-biology"],
    coverage: "starter",
    accent: "lime",
    formatNote: "Starter set of multiple-choice questions.",
  },
  {
    slug: "ap-chemistry",
    name: "AP Chemistry",
    shortName: "AP Chem",
    program: "AP",
    description: "Atomic structure, bonding, reactions, equilibrium, and thermodynamics.",
    courses: ["ap-chemistry"],
    coverage: "starter",
    accent: "orange",
    formatNote: "Starter set of multiple-choice and numeric questions.",
  },
  {
    slug: "ap-physics-1",
    name: "AP Physics 1",
    shortName: "AP Physics 1",
    program: "AP",
    description: "Kinematics, forces, energy, momentum, and rotation.",
    courses: ["ap-physics-1"],
    coverage: "starter",
    accent: "cyan",
    formatNote: "Starter set of multiple-choice and numeric questions.",
  },
];

export function getTrack(slug: string): TrackDef | undefined {
  return TRACKS.find((t) => t.slug === slug);
}

export function getCourse(id: string): CourseDef | undefined {
  return COURSES.find((c) => c.id === id);
}

/** The track a course belongs to "natively" (used to label sessions and skills). */
export function primaryTrackForCourse(courseId: string): TrackDef | undefined {
  return TRACKS.find((t) => t.courses.includes(courseId) && !t.difficulties);
}
