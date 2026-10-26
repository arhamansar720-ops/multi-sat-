import katex from "katex";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Renders trusted, bundled question text. Supported markup:
 *   $inline math$, $$display math$$, **bold**, *italic*, __underline__,
 *   ``` code blocks ```, "- " bullet lines, blank lines between paragraphs,
 *   and "______" (6+ underscores) as an answer blank.
 * All non-math text is rendered as React text nodes (escaped), and KaTeX runs
 * with trust disabled, so content cannot inject HTML.
 */
function renderMath(tex: string, display: boolean, key: string) {
  const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", output: "htmlAndMathml" });
  return display ? <span key={key} className="my-2 block" dangerouslySetInnerHTML={{ __html: html }} /> : <span key={key} dangerouslySetInnerHTML={{ __html: html }} />;
}

const INLINE = /(\$\$(?:\\.|[^$\\])+?\$\$|\$(?:\\.|[^$\\])+?\$|\*\*[^*]+\*\*|__[^_]+__|_{6,}|\*[^*\s][^*]*\*)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("$$")) out.push(renderMath(token.slice(2, -2), true, key));
    else if (token.startsWith("$")) out.push(renderMath(token.slice(1, -1), false, key));
    else if (token.startsWith("**")) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (/^_{6,}$/.test(token)) out.push(<span key={key} className="blank" role="img" aria-label="blank" />);
    else if (token.startsWith("__")) out.push(<u key={key}>{token.slice(2, -2)}</u>);
    else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/```\n?([\s\S]*?)```/g); // odd indexes are code
  const blocks: React.ReactNode[] = [];
  parts.forEach((part, pi) => {
    if (pi % 2 === 1) {
      blocks.push(
        <pre key={`code-${pi}`}>
          <code>{part.replace(/\n$/, "")}</code>
        </pre>,
      );
      return;
    }
    part
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((para, i) => {
        const key = `${pi}-${i}`;
        const lines = para.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) {
          blocks.push(
            <ul key={key} className="space-y-1">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.trim().slice(2), `${key}-${li}`)}</li>
              ))}
            </ul>,
          );
        } else {
          blocks.push(
            <p key={key}>
              {lines.map((l, li) => (
                <React.Fragment key={li}>
                  {li > 0 && <br />}
                  {renderInline(l, `${key}-${li}`)}
                </React.Fragment>
              ))}
            </p>,
          );
        }
      });
  });
  return <div className={cn("prose-question leading-relaxed", className)}>{blocks}</div>;
}

/** Inline-only variant for choices and short labels. */
export function InlineText({ text }: { text: string }) {
  return <>{renderInline(text, "i")}</>;
}
