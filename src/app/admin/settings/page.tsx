import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentBooker } from "@/lib/identity";
import { DEFAULT_LEGEND_COLORS } from "@/lib/floor";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  const booker = await getCurrentBooker();
  if (booker?.role !== "ADMIN") redirect("/");

  const [premise, settings, released, desks] = await Promise.all([
    prisma.premise.findFirst(),
    prisma.appSettings.findUnique({ where: { id: "singleton" } }),
    prisma.booking.count({ where: { status: "RELEASED" } }),
    prisma.bookable.count({ where: { type: "DESK" } }),
  ]);
  if (!premise) redirect("/");

  return (
    <SettingsForm
      premise={{ id: premise.id, name: premise.name, address: premise.address }}
      autoReleaseMinutes={settings?.autoReleaseMinutes ?? 30}
      legendColors={{
        free: settings?.freeColor ?? DEFAULT_LEGEND_COLORS.free,
        taken: settings?.takenColor ?? DEFAULT_LEGEND_COLORS.taken,
        yours: settings?.yoursColor ?? DEFAULT_LEGEND_COLORS.yours,
        unavailable:
          settings?.unavailableColor ?? DEFAULT_LEGEND_COLORS.unavailable,
      }}
      reclaimedCount={released}
      deskCount={desks}
    />
  );
}
