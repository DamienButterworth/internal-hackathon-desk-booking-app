import { prisma } from "@/lib/prisma";
import { getCurrentBooker } from "@/lib/identity";
import { ProfilePicker } from "@/components/ProfilePicker";
import { MapPin } from "lucide-react";

export default async function Home() {
  const [bookers, current, premise] = await Promise.all([
    prisma.booker.findMany({ orderBy: { name: "asc" } }),
    getCurrentBooker(),
    prisma.premise.findFirst(),
  ]);

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10">
      <div className="mb-10 max-w-2xl">
        <span className="chip mb-4 border-brand-tint bg-brand-tint text-brand-strong">
          Mercator · Desk booking, reimagined
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Find the right desk, not just any desk.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Deskly is a map-first booking tool that knows your team, respects the
          quiet zone, and quietly hands back the desks no-one shows up to. Pick a
          profile to jump in — this is a demo, so there&apos;s no login.
        </p>
        {premise && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-soft">
            <MapPin size={15} className="text-brand" />
            {premise.name} — {premise.address}
          </p>
        )}
      </div>

      <ProfilePicker bookers={bookers} currentId={current?.id} />
    </div>
  );
}
