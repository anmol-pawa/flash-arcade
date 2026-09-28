"use client";
import type { ResultSet } from "@/lib/db/engine";

export function ResultGrid({ result, max = 50, accent }: { result: ResultSet; max?: number; accent?: string }) {
  const rows = result.rows.slice(0, max);
  return (
    <div className="overflow-auto rounded-lg border border-white/10 scroll-thin" data-testid="result-grid">
      <table className="w-full border-collapse font-mono text-[12px]">
        <thead className="sticky top-0 bg-[#120d26]">
          <tr>
            {result.columns.map((c, i) => (
              <th key={i} className="border-b border-white/10 px-2.5 py-1.5 text-left font-semibold whitespace-nowrap" style={{ color: accent ?? "var(--accent)" }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white/[0.02] hover:bg-white/[0.06]">
              {r.map((v, j) => (
                <td key={j} className={`px-2.5 py-1 whitespace-nowrap ${v === null ? "italic text-white/30" : typeof v === "number" ? "text-right text-amber-200/90 tabular-nums" : "text-white/85"}`}>
                  {v === null ? "NULL" : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-widest text-white/35">
        {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
        {result.rows.length > max ? ` · showing ${max}` : ""}
      </div>
    </div>
  );
}
