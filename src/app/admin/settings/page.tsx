import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentBooker } from "@/lib/identity";
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
      reclaimedCount={released}
      deskCount={desks}
    />
  );
}
