import { Atom, BookOpen, Calculator, Cpu, Dna, FlaskConical, GraduationCap, Landmark, Leaf, PenLine, Sigma, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  sat: GraduationCap,
  "psat-nmsqt": BookOpen,
  "psat-8-9": BookOpen,
  "ap-statistics": Sigma,
  "ap-environmental-science": Leaf,
  "ap-us-history": Landmark,
  "ap-english-language": PenLine,
  "ap-computer-science-principles": Cpu,
  "ap-biology": Dna,
  "ap-chemistry": FlaskConical,
  "ap-physics-1": Atom,
};

export function TrackIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICONS[slug] ?? Calculator;
  return <Icon className={className} aria-hidden />;
}
