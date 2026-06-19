"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { setCurrentBookerCookie } from "@/lib/identity";
import { sweepExpiredBookings } from "@/lib/release";
import { bbox, rectToPoints, type Point } from "@/lib/floor";

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/book");
  revalidatePath("/bookings");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/stats");
}

// ---- Identity --------------------------------------------------------------
export async function switchBooker(id: string) {
  await setCurrentBookerCookie(id);
  revalidateAll();
}

// ---- Auto-release sweep ----------------------------------------------------
// Server action wrapper used by the client poll. Sweeps + revalidates so any
// open page reflects freshly-released desks. (Server pages call the pure
// `sweepExpiredBookings` from @/lib/release directly during render instead.)
export async function releaseExpiredBookings(): Promise<number> {
  const released = await sweepExpiredBookings();
  if (released > 0) revalidateAll();
  return released;
}

// ---- Bookings --------------------------------------------------------------
export async function createBooking(input: {
  bookerId: string;
  bookableIds: string[];
  date: string;
  startTime?: string;
  endTime?: string;
  bookingTitle?: string;
  bookingGuidance?: string;
  repeat?: string;
}) {
  if (!input.bookableIds.length) throw new Error("No desk selected");
  const booking = await prisma.booking.create({
    data: {
      bookerId: input.bookerId,
      date: input.date,
      startTime: input.startTime ?? "09:00",
      endTime: input.endTime ?? "17:00",
      bookingTitle: input.bookingTitle ?? "",
      bookingGuidance: input.bookingGuidance ?? "",
      repeat: input.repeat ?? "NONE",
      status: "RESERVED",
      bookables: { connect: input.bookableIds.map((id) => ({ id })) },
    },
  });
  revalidateAll();
  return booking.id;
}

export async function checkIn(bookingId: string) {
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CHECKED_IN", checkInAt: new Date() },
  });
  revalidateAll();
}

export async function checkOut(bookingId: string) {
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CHECKED_OUT", checkOutAt: new Date() },
  });
  revalidateAll();
}

export async function cancelBooking(bookingId: string) {
  await prisma.booking.delete({ where: { id: bookingId } });
  revalidateAll();
}

// ---- Admin: layout (bulk positions for desks + zones) ----------------------
export async function saveLayout(input: {
  desks: { id: string; x: number; y: number }[];
  zones: { id: string; points: Point[] }[];
  fixtures?: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }[];
}) {
  await prisma.$transaction([
    ...input.desks.map((d) =>
      prisma.bookable.update({
        where: { id: d.id },
        data: { x: d.x, y: d.y },
      }),
    ),
    ...(input.fixtures ?? []).map((f) =>
      prisma.fixture.update({
        where: { id: f.id },
        data: {
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          rotation: f.rotation,
        },
      }),
    ),
    ...input.zones.map((z) => {
      const box = bbox(z.points);
      return prisma.zone.update({
        where: { id: z.id },
        // Persist the polygon and keep the bounding box in sync.
        data: {
          points: JSON.stringify(z.points),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        },
      });
    }),
  ]);
  revalidateAll();
}

// ---- Admin: desks ----------------------------------------------------------
export async function updateBookable(
  id: string,
  data: {
    name?: string;
    zoneId?: string | null;
    isAvailable?: boolean;
    tags?: string[];
    textDescription?: string;
    type?: string;
  },
) {
  await prisma.bookable.update({
    where: { id },
    data: {
      ...("name" in data ? { name: data.name } : {}),
      ...("zoneId" in data ? { zoneId: data.zoneId } : {}),
      ...("isAvailable" in data ? { isAvailable: data.isAvailable } : {}),
      ...("textDescription" in data
        ? { textDescription: data.textDescription }
        : {}),
      ...("type" in data ? { type: data.type } : {}),
      ...(data.tags ? { tags: JSON.stringify(data.tags) } : {}),
    },
  });
  revalidateAll();
}

export async function createBookable(input: {
  premiseId: string;
  zoneId?: string | null;
  x: number;
  y: number;
  name: string;
}) {
  await prisma.bookable.create({
    data: {
      premiseId: input.premiseId,
      zoneId: input.zoneId ?? null,
      name: input.name,
      x: input.x,
      y: input.y,
    },
  });
  revalidateAll();
}

export async function deleteBookable(id: string) {
  await prisma.bookable.delete({ where: { id } });
  revalidateAll();
}

// ---- Admin: zones ----------------------------------------------------------
export async function createZone(input: {
  premiseId: string;
  name: string;
  type: string;
  color: string;
}) {
  const x = 60;
  const y = 60;
  const width = 300;
  const height = 220;
  await prisma.zone.create({
    data: {
      premiseId: input.premiseId,
      name: input.name,
      type: input.type,
      color: input.color,
      x,
      y,
      width,
      height,
      points: JSON.stringify(rectToPoints(x, y, width, height)),
    },
  });
  revalidateAll();
}

export async function updateZone(
  id: string,
  data: { name?: string; type?: string; color?: string },
) {
  await prisma.zone.update({ where: { id }, data });
  revalidateAll();
}

export async function deleteZone(id: string) {
  // Desks in the zone are kept (zoneId set null via schema relation).
  await prisma.zone.delete({ where: { id } });
  revalidateAll();
}

// ---- Admin: fixtures (walls, doors, toilets, fire exits, …) ----------------
export async function createFixture(input: {
  premiseId: string;
  type: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  await prisma.fixture.create({
    data: {
      premiseId: input.premiseId,
      type: input.type,
      label: input.label ?? "",
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
    },
  });
  revalidateAll();
}

export async function updateFixture(
  id: string,
  data: {
    type?: string;
    label?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
  },
) {
  await prisma.fixture.update({ where: { id }, data });
  revalidateAll();
}

export async function deleteFixture(id: string) {
  await prisma.fixture.delete({ where: { id } });
  revalidateAll();
}

// ---- Admin: duplicate (Ctrl/Cmd+D in the editor) ---------------------------
// Each clones the source record offset by DUP_OFFSET so the copy is visible,
// and returns the new id so the editor can re-select it after refresh.
const DUP_OFFSET = 24;

export async function duplicateBookable(id: string): Promise<string | null> {
  const src = await prisma.bookable.findUnique({ where: { id } });
  if (!src) return null;
  const copy = await prisma.bookable.create({
    data: {
      premiseId: src.premiseId,
      zoneId: src.zoneId,
      name: `${src.name} copy`,
      type: src.type,
      isAvailable: src.isAvailable,
      tags: src.tags,
      textDescription: src.textDescription,
      x: src.x + DUP_OFFSET,
      y: src.y + DUP_OFFSET,
    },
  });
  revalidateAll();
  return copy.id;
}

export async function duplicateFixture(id: string): Promise<string | null> {
  const src = await prisma.fixture.findUnique({ where: { id } });
  if (!src) return null;
  const copy = await prisma.fixture.create({
    data: {
      premiseId: src.premiseId,
      type: src.type,
      label: src.label,
      width: src.width,
      height: src.height,
      rotation: src.rotation,
      x: src.x + DUP_OFFSET,
      y: src.y + DUP_OFFSET,
    },
  });
  revalidateAll();
  return copy.id;
}

export async function duplicateZone(id: string): Promise<string | null> {
  const src = await prisma.zone.findUnique({ where: { id } });
  if (!src) return null;
  const pts = (JSON.parse(src.points) as Point[]).map((p) => ({
    x: p.x + DUP_OFFSET,
    y: p.y + DUP_OFFSET,
  }));
  const copy = await prisma.zone.create({
    data: {
      premiseId: src.premiseId,
      name: `${src.name} copy`,
      type: src.type,
      color: src.color,
      x: src.x + DUP_OFFSET,
      y: src.y + DUP_OFFSET,
      width: src.width,
      height: src.height,
      points: JSON.stringify(pts),
    },
  });
  revalidateAll();
  return copy.id;
}

// ---- Admin: settings -------------------------------------------------------
export async function updateSettings(autoReleaseMinutes: number) {
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: { autoReleaseMinutes },
    create: { id: "singleton", autoReleaseMinutes },
  });
  revalidateAll();
}

export async function updatePremise(
  id: string,
  data: { name?: string; address?: string },
) {
  await prisma.premise.update({ where: { id }, data });
  revalidateAll();
}

// Set (or clear, with null) the floor-plan background image. Stored inline as a
// data URL so the POC needs no file storage / static-asset pipeline.
export async function updatePremiseBackground(
  id: string,
  backgroundUrl: string | null,
) {
  await prisma.premise.update({ where: { id }, data: { backgroundUrl } });
  revalidateAll();
}
