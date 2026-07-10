import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infinite Auto Sched — Pemesanan Lapangan",
  description: "Pesan lapangan dan kelola konfirmasi tanpa spreadsheet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased min-h-screen bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/book" className="font-semibold tracking-tight">
              🏀 Infinite Auto Sched
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/book" className="text-neutral-600 hover:text-neutral-900">
                Pesan Lapangan
              </Link>
              <Link href="/admin" className="text-neutral-600 hover:text-neutral-900">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
