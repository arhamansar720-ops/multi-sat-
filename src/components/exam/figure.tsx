"use client";

import Image from "next/image";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Figure as FigureData } from "@/lib/content/types";

const axis = { stroke: "var(--muted-foreground)", fontSize: 12 };

export function QuestionFigure({ figure }: { figure: FigureData }) {
  if (figure.kind === "table") {
    return (
      <figure className="my-4 overflow-x-auto">
        {figure.caption && <figcaption className="mb-2 text-sm font-medium">{figure.caption}</figcaption>}
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              {figure.columns.map((c, i) => (
                <th key={i} scope="col" className="border bg-muted px-3 py-2 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {figure.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) =>
                  ci === 0 ? (
                    <th key={ci} scope="row" className="border px-3 py-2 text-left font-medium">
                      {cell}
                    </th>
                  ) : (
                    <td key={ci} className="border px-3 py-2 tabular-nums">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    );
  }
  if (figure.kind === "image") {
    return (
      <figure className="my-4 inline-block rounded-xl border bg-white p-2">
        <Image src={figure.src} alt={figure.alt} width={figure.width} height={figure.height} className="h-auto max-w-full" />
      </figure>
    );
  }
  // Chart: also expose the data as a visually hidden table for screen readers.
  const data = figure.data.map((d) => ({ x: d.x, y: d.y }));
  return (
    <figure className="my-4 rounded-xl border bg-card p-3">
      {figure.title && <figcaption className="mb-2 text-sm font-medium">{figure.title}</figcaption>}
      <div className="h-64 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          {figure.chartType === "bar" ? (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="x" tick={axis} label={{ value: figure.xLabel, position: "insideBottom", offset: -16, fill: "var(--muted-foreground)", fontSize: 12 }} />
              <YAxis tick={axis} label={{ value: figure.yLabel, angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Bar dataKey="y" name={figure.yLabel} fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : figure.chartType === "line" ? (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="x" tick={axis} />
              <YAxis tick={axis} />
              <Line dataKey="y" stroke="var(--primary)" strokeWidth={2} />
            </LineChart>
          ) : (
            <ScatterChart margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" dataKey="x" name={figure.xLabel} tick={axis} label={{ value: figure.xLabel, position: "insideBottom", offset: -16, fill: "var(--muted-foreground)", fontSize: 12 }} />
              <YAxis type="number" dataKey="y" name={figure.yLabel} tick={axis} domain={["dataMin - 5", "dataMax + 5"]} label={{ value: figure.yLabel, angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Scatter data={data} fill="var(--primary)" />
            </ScatterChart>
          )}
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{figure.title ?? "Chart data"}</caption>
        <thead>
          <tr>
            <th scope="col">{figure.xLabel}</th>
            <th scope="col">{figure.yLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td>{d.x}</td>
              <td>{d.y}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
