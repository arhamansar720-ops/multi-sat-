import { BarChart3, BookOpen, LayoutDashboard, Library, RotateCcw, Swords, Trophy, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/courses", label: "Courses", icon: Library, mobile: true },
  { href: "/study", label: "Study", icon: BookOpen, mobile: true },
  { href: "/play", label: "Play", icon: Swords, mobile: true },
  { href: "/review", label: "Review", icon: RotateCcw },
  { href: "/progress", label: "Progress", icon: BarChart3, mobile: true },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/friends", label: "Friends", icon: Users },
];
