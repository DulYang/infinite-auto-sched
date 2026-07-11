"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/book", label: "Pesan Lapangan", icon: "🏀" },
  { href: "/admin", label: "Admin", icon: "🛠️" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Let Escape close the drawer.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <Link href="/book" className="font-semibold tracking-tight text-[15px]">
          🏀 Infinite Auto Sched
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Buka menu"
          aria-expanded={open}
          className="-mr-2 p-2 text-neutral-700"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[80%] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
              <span className="font-semibold tracking-tight text-[15px]">🏀 Infinite Auto Sched</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="-mr-2 p-2 text-neutral-500"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex items-center gap-2.5 rounded px-3 py-2.5 text-sm font-medium",
                    isActive(pathname, item.href)
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-100",
                  ].join(" ")}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:shrink-0 md:flex-col md:border-r md:border-neutral-200 md:bg-white">
        <div className="sticky top-0 flex h-screen flex-col">
          <Link href="/book" className="px-5 py-4 font-semibold tracking-tight border-b border-neutral-200">
            🏀 Infinite Auto Sched
          </Link>
          <nav className="flex flex-col gap-1 p-3">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-2.5 rounded px-3 py-2.5 text-sm font-medium",
                  isActive(pathname, item.href)
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-700 hover:bg-neutral-100",
                ].join(" ")}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
