import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground">The link may be broken, or the page may have moved.</p>
      <div className="flex gap-2">
        <Button asChild variant="outline"><Link href="/">Home</Link></Button>
        <Button asChild><Link href="/dashboard">Dashboard</Link></Button>
      </div>
    </main>
  );
}
