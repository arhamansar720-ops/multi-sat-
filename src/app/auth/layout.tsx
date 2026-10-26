import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { ModeBanner } from "@/components/layout/mode-banner";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <ModeBanner />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">Privacy</Link> · <Link href="/terms" className="hover:text-foreground">Terms</Link> · <Link href="/help" className="hover:text-foreground">Help</Link>
      </footer>
    </div>
  );
}
