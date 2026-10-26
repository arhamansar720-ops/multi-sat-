export function ProsePage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-[0.95rem] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:space-y-1">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {updated && <p className="text-sm text-muted-foreground">Last updated {updated}</p>}
      </header>
      {children}
    </article>
  );
}
