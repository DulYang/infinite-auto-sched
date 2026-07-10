import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Halaman Tidak Ditemukan</h1>
      <p className="text-neutral-500 mb-6 text-sm">
        Halaman yang Anda cari tidak ada atau sudah dipindahkan.
      </p>
      <Link href="/book" className="text-sm text-neutral-900 underline hover:text-neutral-700">
        Kembali ke halaman pemesanan
      </Link>
    </div>
  );
}
