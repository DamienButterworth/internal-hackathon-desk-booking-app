"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  LayoutDashboard,
  Map,
  Settings,
  BarChart3,
} from "lucide-react";
import clsx from "clsx";

type BookerLite = {
  id: string;
  name: string;
  team: string;
  role: string;
} | null;

const userLinks = [
  { href: "/book", label: "Book a desk", icon: Map },
  { href: "/bookings", label: "My bookings", icon: CalendarCheck },
  { href: "/stats", label: "Insights", icon: BarChart3 },
];

const adminLinks = [
  { href: "/admin", label: "Floor plan", icon: LayoutDashboard },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function Nav({ booker }: { booker: BookerLite }) {
  const pathname = usePathname();
  const isAdmin = booker?.role === "ADMIN";
  const links = isAdmin ? [...userLinks, ...adminLinks] : userLinks;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-white font-bold">
            D
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            Deskly
          </span>
          <span className="hidden text-[11px] font-medium uppercase tracking-wider text-muted sm:inline">
            by Mercator
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-tint text-brand-strong"
                    : "text-ink-soft hover:bg-surface",
                )}
              >
                <Icon size={15} />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto">
          {booker ? (
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-full border border-line py-1 pl-1 pr-3 hover:bg-surface"
            >
              <span
                className={clsx(
                  "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold text-white",
                  isAdmin ? "bg-ink" : "bg-brand",
                )}
              >
                {booker.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-xs font-semibold text-ink">
                  {booker.name}
                </span>
                <span className="block text-[10px] text-muted">
                  {isAdmin ? "Admin · " : ""}
                  {booker.team}
                </span>
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
