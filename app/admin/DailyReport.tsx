"use client";

import { useCallback, useEffect, useState } from "react";
import { todayInputValue, formatDisplayDate } from "@/lib/bookings/date";
import { formatCurrency } from "@/lib/bookings/currency";

type Summary = {
  date: string;
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  revenue: number;
  outstanding: number;
};

type LoadState = "loading" | "ready" | "error";

export default function DailyReport() {
  const [date, setDate] = useState(todayInputValue());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const res = await fetch(`/api/reports/daily?date=${date}`);
      if (!res.ok) throw new Error("Gagal memuat ringkasan.");
      const data = await res.json();
      setSummary(data.summary);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setState("error");
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="rounded border border-neutral-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">Ringkasan Harian</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pemesanan dan pendapatan untuk {formatDisplayDate(date)}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1" htmlFor="reportDate">
            Tanggal
          </label>
          <input
            id="reportDate"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
        </div>
      </div>

      {state === "loading" && (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-neutral-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {state === "error" && (
        <div className="flex items-center justify-between px-4 py-4 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={load} className="underline font-medium">
            Coba lagi
          </button>
        </div>
      )}

      {state === "ready" && summary && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total Pemesanan" value={String(summary.total)} />
            <Stat label="Menunggu" value={String(summary.pending)} tone="amber" />
            <Stat
              label="Terkonfirmasi"
              value={String(summary.confirmed + summary.completed)}
              tone="emerald"
            />
            <Stat label="Pendapatan" value={formatCurrency(summary.revenue)} tone="emerald" />
          </div>
          {summary.outstanding > 0 && (
            <p className="text-xs text-neutral-500">
              Belum dibayar: {formatCurrency(summary.outstanding)} dari {summary.pending} pemesanan
              yang menunggu.
            </p>
          )}
          {summary.total === 0 && (
            <p className="text-sm text-neutral-500 text-center py-2">
              Tidak ada pemesanan untuk tanggal ini.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "amber" | "emerald";
}) {
  const toneStyles: Record<string, string> = {
    neutral: "bg-neutral-50 text-neutral-900",
    amber: "bg-amber-50 text-amber-900",
    emerald: "bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={`rounded-lg px-3 py-3 ${toneStyles[tone]}`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-bold mt-1 tracking-tight">{value}</div>
    </div>
  );
}
