import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infinite Auto Sched — Court Booking",
  description: "Book a court and manage confirmations without spreadsheets.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/book" className="font-semibold tracking-tight">
              🏀 Infinite Auto Sched
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/book" className="text-neutral-600 hover:text-neutral-900">
                Book a Court
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
