import type { Metadata } from "next";
import "./globals.css";
import AppNav from "./components/AppNav";

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
        <div className="md:flex md:min-h-screen">
          <AppNav />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
