export type Difficulty = "easy" | "medium" | "hard";
export type QuestionType = "mcq" | "multi" | "numeric";

export interface Choice {
  id: string;
  text: string;
}

export interface Passage {
  title?: string;
  text: string;
  /** Optional attribution line, e.g. "Adapted from an original passage". */
  source?: string;
}

export interface TableFigure {
  kind: "table";
  caption?: string;
  columns: string[];
  rows: string[][];
}

export interface ChartFigure {
  kind: "chart";
  chartType: "bar" | "line" | "scatter";
  title?: string;
  xLabel: string;
  yLabel: string;
  /** Each point is { x, y } where x may be a category label for bar charts. */
  data: { x: string | number; y: number }[];
}

export interface ImageFigure {
  kind: "image";
  /** Path under /public, e.g. /figures/triangle.svg */
  src: string;
  alt: string;
  width: number;
  height: number;
}

export type Figure = TableFigure | ChartFigure | ImageFigure;

export interface Question {
  id: string;
  /** Program family, e.g. "sat" or "ap". */
  exam: string;
  /** Course id, e.g. "sat-math" or "ap-statistics". */
  course: string;
  /** Section (SAT) or unit (AP) label. */
  section: string;
  topic: string;
  skill: string;
  difficulty: Difficulty;
  type: QuestionType;
  prompt: string;
  passage?: Passage;
  figure?: Figure;
  choices?: Choice[];
  /** Choice ids for mcq/multi; accepted answer strings for numeric. */
  correct: string[];
  /** Numeric tolerance (absolute). Defaults to 0.0001. */
  tolerance?: number;
  explanation: string;
  hint?: string;
  estimatedSeconds: number;
  tags: string[];
  version: number;
}

/** A question as sent to a client that must not see answers yet. */
export type PublicQuestion = Omit<Question, "correct" | "explanation" | "tolerance" | "hint"> & {
  hint?: string;
};

export type AnswerResponse = string[]; // selected choice ids, or [typed value] for numeric
