"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export default function ReceiptUpload({
  bookingId,
  phone,
  hasReceipt,
}: {
  bookingId: string;
  phone: string;
  hasReceipt: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setError(null);
    if (!ALLOWED.includes(file.type)) {
      setError("Format tidak didukung. Unggah gambar (JPG/PNG/WebP) atau PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Ukuran file maksimal 5MB.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "dat";
      const path = `${bookingId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) {
        setError("Gagal mengunggah file. Silakan coba lagi.");
        return;
      }

      const { error: rpcError } = await supabase.rpc("attach_receipt", {
        p_id: bookingId,
        p_phone: phone,
        p_path: path,
      });
      if (rpcError) {
        setError("Gagal menyimpan bukti. Silakan coba lagi.");
        return;
      }

      setDone(true);
      router.refresh();
    } catch {
      setError("Terjadi kesalahan saat mengunggah.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-neutral-200 bg-white px-4 py-4">
      <h2 className="font-semibold text-sm mb-1">Unggah Bukti Pembayaran</h2>
      <p className="text-xs text-neutral-500 mb-3">
        Sudah transfer? Unggah tangkapan layar atau struk agar admin dapat memverifikasi lebih cepat.
        {hasReceipt && " Anda sudah mengunggah bukti — mengunggah lagi akan menggantinya."}
      </p>

      {done ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
          Bukti pembayaran berhasil diunggah. Admin akan segera memverifikasi.
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-white file:text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={handleUpload}
            disabled={busy || !file}
            className="w-full rounded bg-neutral-900 text-white text-sm font-medium py-2 hover:bg-neutral-800 disabled:opacity-40"
          >
            {busy ? "Mengunggah…" : "Unggah Bukti"}
          </button>
        </div>
      )}
    </div>
  );
}
