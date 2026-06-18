"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { releaseExpiredBookings } from "@/server/actions";

// Periodically sweeps expired (un-checked-in) bookings so desks free up live —
// no cron needed. Refreshes the route when something was actually released.
export function AutoReleasePoller({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    const tick = async () => {
      const released = await releaseExpiredBookings();
      if (active && released > 0) router.refresh();
    };
    const t = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [intervalMs, router]);
  return null;
}
