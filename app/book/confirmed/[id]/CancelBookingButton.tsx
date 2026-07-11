"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelBookingButton({
  bookingId,
  phone,
}: {
  bookingId: string;
  phone: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal membatalkan pemesanan.");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm mb-2">
          {error}
        </div>
      )}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="w-full rounded border border-red-300 text-red-700 text-sm font-medium py-2 hover:bg-red-50"
        >
          Batalkan Pemesanan
        </button>
      ) : (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-3">
          <p className="text-sm text-red-800 mb-2">
            Yakin ingin membatalkan pemesanan ini? Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={busy}
              className="flex-1 rounded bg-red-600 text-white text-sm font-medium py-2 hover:bg-red-700 disabled:opacity-40"
            >
              {busy ? "Membatalkan…" : "Ya, Batalkan"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="flex-1 rounded border border-neutral-300 text-sm font-medium py-2 hover:bg-neutral-100 disabled:opacity-40"
            >
              Tidak
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
