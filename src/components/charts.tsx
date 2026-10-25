"use client";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR, type Paise } from "@/lib/money";
import { formatMonth } from "@/lib/dates";

const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

interface TooltipItem {
  dataKey?: string | number;
  value?: number | string;
  name?: string;
  color?: string;
}

function MonthTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipItem[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  const income = Number(payload.find((p) => p.dataKey === "income")?.value ?? 0);
  const expenses = Number(payload.find((p) => p.dataKey === "expenses")?.value ?? 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{formatMonth(String(label))}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular font-medium">{formatINR(Number(p.value))}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-6 border-t pt-1">
        <span className="text-muted-foreground">Remaining</span>
        <span className="tabular font-medium">{formatINR(income - expenses, { sign: true })}</span>
      </div>
    </div>
  );
}

/** Income vs expenses per month — grouped bars, one shared rupee axis. */
export function MonthlyBars({ data }: { data: { month: string; income: Paise; expenses: Paise }[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Monthly income and expenses">
      <ResponsiveContainer>
        <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m).split(" ")[0]} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatINR(v, { compact: true, decimals: false })} tick={axisTick} axisLine={false} tickLine={false} width={64} />
          <Tooltip content={<MonthTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
          <Bar name="Income" dataKey="income" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar name="Expenses" dataKey="expenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked magnitudes (categories, merchants) as labelled horizontal bars in one hue. */
export function RankedBars({
  data,
  max,
}: {
  data: { label: string; amount: Paise; pct?: number | null; href?: string; sub?: string }[];
  max?: number;
}) {
  const top = Math.max(...data.map((d) => d.amount), 1);
  const rows = max ? data.slice(0, max) : data;
  return (
    <ul className="space-y-3">
      {rows.map((d) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{d.label}</span>
              <span className="tabular shrink-0 font-medium">
                {formatINR(d.amount, { decimals: false })}
                {d.pct != null && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{d.pct}%</span>}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-series-1" style={{ width: `${Math.max((d.amount / top) * 100, 1.5)}%` }} />
            </div>
            {d.sub && <div className="mt-1 text-xs text-muted-foreground">{d.sub}</div>}
          </>
        );
        return (
          <li key={d.label} title={`${d.label}: ${formatINR(d.amount)}${d.pct != null ? ` (${d.pct}%)` : ""}`}>
            {d.href ? (
              <Link href={d.href} className="block rounded-md outline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Part-to-whole for up to three groups: stacked bar with 2px gaps plus a labelled legend. */
export function SplitBar({ parts }: { parts: { label: string; amount: Paise; color: string }[] }) {
  const total = parts.reduce((s, p) => s + Math.max(p.amount, 0), 0);
  if (total <= 0) return <p className="text-sm text-muted-foreground">No spending in this period.</p>;
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Spending split">
        {parts
          .filter((p) => p.amount > 0)
          .map((p) => (
            <div key={p.label} title={`${p.label}: ${formatINR(p.amount)}`} style={{ width: `${(p.amount / total) * 100}%`, background: p.color }} />
          ))}
      </div>
      <ul className="grid gap-2 text-sm sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-2 sm:flex-col sm:items-start">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="tabular font-medium">
              {formatINR(Math.max(p.amount, 0), { decimals: false })}{" "}
              <span className="text-xs font-normal text-muted-foreground">{Math.round((Math.max(p.amount, 0) / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
