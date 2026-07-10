"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditLog } from "@/lib/types";
import { labelForAction } from "@/lib/bookings/audit";

type LoadState = "loading" | "ready" | "error";

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/audit-logs");
      if (!res.ok) throw new Error("Gagal memuat log audit.");
      const data = await res.json();
      setLogs(data.auditLogs ?? []);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <div className="rounded border border-neutral-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
      >
        <span>Log Audit (50 aksi terakhir)</span>
        <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-neutral-200">
          {state === "loading" && (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-6 bg-neutral-100 rounded animate-pulse" />
              ))}
            </div>
          )}

          {state === "error" && (
            <div className="p-4 text-sm text-red-700 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={load} className="underline font-medium">
                Coba lagi
              </button>
            </div>
          )}

          {state === "ready" && logs.length === 0 && (
            <div className="p-4 text-sm text-neutral-500 text-center">
              Belum ada riwayat audit.
            </div>
          )}

          {state === "ready" && logs.length > 0 && (
            <ul className="divide-y divide-neutral-100 max-h-96 overflow-y-auto">
              {logs.map((log) => (
                <li key={log.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-4">
                  <div>
                    <span className="font-medium">{labelForAction(log.action)}</span>
                    <span className="text-neutral-400">
                      {" "}
                      · oleh {log.performed_by === "system" ? "sistem" : (log.performed_by ?? "sistem")}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("id-ID")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
