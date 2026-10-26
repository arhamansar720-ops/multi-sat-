"use client";

import { MotionConfig, motion } from "framer-motion";
import { Award, Calendar, Check, Flag, Flame, Sparkles, Swords, Target, Trophy } from "lucide-react";
import { getAchievement, type AchievementDef } from "@/lib/progression/achievements";

const ICONS: Record<AchievementDef["icon"], typeof Award> = {
  flag: Flag,
  check: Check,
  hundred: Award,
  swords: Swords,
  flame: Flame,
  target: Target,
  calendar: Calendar,
  trophy: Trophy,
};

export function AchievementIcon({ icon, className }: { icon: AchievementDef["icon"]; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} aria-hidden />;
}

/** Subtle celebration for level-ups and new achievements. Honors reduced-motion settings. */
export function Celebration({ levelUp, achievements }: { levelUp: number | null; achievements: string[] }) {
  if (!levelUp && achievements.length === 0) return null;
  return (
    <MotionConfig reducedMotion="user">
      <div role="status" aria-live="polite" className="grid gap-3 sm:grid-cols-2">
        {levelUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="flex items-center gap-3 rounded-2xl border border-violet/30 bg-violet-soft p-4"
          >
            <motion.span
              initial={{ rotate: -20 }}
              animate={{ rotate: 0 }}
              transition={{ delay: 0.15, type: "spring" }}
              className="flex size-11 items-center justify-center rounded-xl bg-violet text-white dark:text-background"
            >
              <Sparkles className="size-5" aria-hidden />
            </motion.span>
            <div>
              <p className="font-semibold">Level up! You reached level {levelUp}.</p>
              <p className="text-sm text-muted-foreground">Keep going to unlock the next level.</p>
            </div>
          </motion.div>
        )}
        {achievements.map((id, i) => {
          const a = getAchievement(id);
          if (!a) return null;
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 260, damping: 20 }}
              className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-warning text-white dark:text-background">
                <AchievementIcon icon={a.icon} className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Achievement unlocked: {a.name}</p>
                <p className="text-sm text-muted-foreground">{a.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </MotionConfig>
  );
}
