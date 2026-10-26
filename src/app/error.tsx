"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">An unexpected error interrupted this page. Your saved progress is safe.</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={reset}>Try again</Button>
        <Button asChild><Link href="/dashboard">Dashboard</Link></Button>
      </div>
    </main>
  );
}
