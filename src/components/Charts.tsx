"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { formatBRL } from "@/lib/format";

const PALETTE = ["#A78BFA", "#8167A9", "#34D399", "#F59E0B", "#60A5FA", "#F472B6", "#2DD4BF", "#FB923C", "#C084FC", "#94A3B8", "#F87171"];
const tooltipStyle = { background: "#1B1821", border: "1px solid #2A2632", borderRadius: 12, color: "#F3F1F7", fontSize: 12 };

export function CategoryChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-48 w-48 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.slice(0, 7).map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-ink-muted"><i className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{d.name}</span>
            <span className="tabular-nums">{formatBRL(d.value)} <span className="text-ink-muted">({total ? Math.round((d.value / total) * 100) : 0}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MonthlyChart({ data }: { data: { month: string; Receitas: number; Despesas: number }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: -10, right: 4, top: 8 }}>
          <CartesianGrid stroke="#2A2632" vertical={false} />
          <XAxis dataKey="month" stroke="#9A95A6" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#9A95A6" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.04)" }} formatter={(v: number) => formatBRL(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Receitas" fill="#34D399" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Despesas" fill="#F87171" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceChart({ data }: { data: { date: string; total: number }[] }) {
  return (
    <div className="h-48">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
          <CartesianGrid stroke="#2A2632" vertical={false} />
          <XAxis dataKey="date" stroke="#9A95A6" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#9A95A6" fontSize={11} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
          <Line type="monotone" dataKey="total" stroke="#A78BFA" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
