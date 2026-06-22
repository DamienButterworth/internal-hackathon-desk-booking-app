"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { setCurrentBookerCookie } from "@/lib/identity";
import { sweepExpiredBookings } from "@/lib/release";
import { bbox, rectToPoints, type Point } from "@/lib/floor";
import { dateTimeOf, timesOverlap } from "@/lib/time";

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
  seatIndex?: number;
  startTime?: string;
  endTime?: string;
  bookingTitle?: string;
  bookingGuidance?: string;
  repeat?: string;
}) {
  if (!input.bookableIds.length) throw new Error("No desk selected");
  const seatIndex = input.seatIndex ?? 0;
  const startTime = input.startTime ?? "09:00";
  const endTime = input.endTime ?? "17:00";
  // Reject bookings whose start is in the past (1-minute grace for clock skew
  // and the time it takes to submit). The UI also prevents this client-side.
  if (dateTimeOf(input.date, startTime).getTime() < Date.now() - 60_000) {
    throw new Error("That start time is in the past.");
  }
  // A person can't hold two desks at once: reject if they already have an
  // active booking on this date whose time range overlaps the new one.
  const ownSameDay = await prisma.booking.findMany({
    where: {
      bookerId: input.bookerId,
      date: input.date,
      status: { in: ["RESERVED", "CHECKED_IN"] },
    },
    select: { startTime: true, endTime: true },
  });
  if (
    ownSameDay.some((b) => timesOverlap(startTime, endTime, b.startTime, b.endTime))
  ) {
    throw new Error(
      "You already have a booking that overlaps this time. Cancel it or pick a non-overlapping slot.",
    );
  }
  // Guard against double-booking the same seat: a bookable is taken when an
  // active booking already holds this seat (seat 0 for single-seat desks/rooms).
  const clash = await prisma.booking.findFirst({
    where: {
      date: input.date,
      seatIndex,
      status: { in: ["RESERVED", "CHECKED_IN"] },
      bookables: { some: { id: { in: input.bookableIds } } },
    },
  });
  if (clash) throw new Error("That seat is already booked for this date.");
  const booking = await prisma.booking.create({
    data: {
      bookerId: input.bookerId,
      date: input.date,
      seatIndex,
      startTime,
      endTime,
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
  desks: { id: string; x: number; y: number; width?: number; height?: number }[];
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
        data: {
          x: d.x,
          y: d.y,
          ...(d.width != null ? { width: d.width } : {}),
          ...(d.height != null ? { height: d.height } : {}),
        },
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

// Persist a complete layout snapshot in one transaction — used by editor
// undo/redo, where every field (geometry AND properties) of the existing
// entities must be restored at once. The set of entities is unchanged (add /
// delete reset the undo history), so this only updates, never creates/deletes.
export async function replaceLayoutFull(input: {
  premiseId: string;
  desks: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
    type: string;
    zoneId: string | null;
    isAvailable: boolean;
    seats: number;
    shape: string;
    seatSize: number;
    seatGap: number;
    seatShape: string;
    seatSide: string;
    fontSize: number;
    endSeats: boolean;
    tags: string[];
    textDescription: string;
  }[];
  zones: {
    id: string;
    name: string;
    type: string;
    color: string;
    points: Point[];
  }[];
  fixtures: {
    id: string;
    type: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }[];
  bg: { x: number; y: number; width: number; height: number };
}) {
  await prisma.$transaction([
    ...input.desks.map((d) =>
      prisma.bookable.update({
        where: { id: d.id },
        data: {
          x: d.x,
          y: d.y,
          width: d.width,
          height: d.height,
          name: d.name,
          type: d.type,
          zoneId: d.zoneId,
          isAvailable: d.isAvailable,
          seats: d.seats,
          shape: d.shape,
          seatSize: d.seatSize,
          seatGap: d.seatGap,
          seatShape: d.seatShape,
          seatSide: d.seatSide,
          fontSize: d.fontSize,
          endSeats: d.endSeats,
          tags: JSON.stringify(d.tags),
          textDescription: d.textDescription,
        },
      }),
    ),
    ...input.zones.map((z) => {
      const box = bbox(z.points);
      return prisma.zone.update({
        where: { id: z.id },
        data: {
          name: z.name,
          type: z.type,
          color: z.color,
          points: JSON.stringify(z.points),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        },
      });
    }),
    ...input.fixtures.map((f) =>
      prisma.fixture.update({
        where: { id: f.id },
        data: {
          type: f.type,
          label: f.label,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          rotation: f.rotation,
        },
      }),
    ),
    prisma.premise.update({
      where: { id: input.premiseId },
      data: {
        bgX: input.bg.x,
        bgY: input.bg.y,
        bgWidth: input.bg.width,
        bgHeight: input.bg.height,
      },
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
    seats?: number;
    shape?: string;
    width?: number;
    height?: number;
    seatSize?: number;
    seatGap?: number;
    seatShape?: string;
    seatSide?: string;
    fontSize?: number;
    endSeats?: boolean;
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
      ...("seats" in data ? { seats: data.seats } : {}),
      ...("shape" in data ? { shape: data.shape } : {}),
      ...("width" in data ? { width: data.width } : {}),
      ...("height" in data ? { height: data.height } : {}),
      ...("seatSize" in data ? { seatSize: data.seatSize } : {}),
      ...("seatGap" in data ? { seatGap: data.seatGap } : {}),
      ...("seatShape" in data ? { seatShape: data.seatShape } : {}),
      ...("seatSide" in data ? { seatSide: data.seatSide } : {}),
      ...("fontSize" in data ? { fontSize: data.fontSize } : {}),
      ...("endSeats" in data ? { endSeats: data.endSeats } : {}),
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
  seats?: number;
  shape?: string;
  width?: number;
  height?: number;
  seatSize?: number;
  endSeats?: boolean;
}) {
  await prisma.bookable.create({
    data: {
      premiseId: input.premiseId,
      zoneId: input.zoneId ?? null,
      name: input.name,
      x: input.x,
      y: input.y,
      ...(input.seats != null ? { seats: input.seats } : {}),
      ...(input.shape != null ? { shape: input.shape } : {}),
      ...(input.width != null ? { width: input.width } : {}),
      ...(input.height != null ? { height: input.height } : {}),
      ...(input.seatSize != null ? { seatSize: input.seatSize } : {}),
      ...(input.endSeats != null ? { endSeats: input.endSeats } : {}),
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
  x?: number;
  y?: number;
}) {
  const x = Math.round(input.x ?? 60);
  const y = Math.round(input.y ?? 60);
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
      seats: src.seats,
      shape: src.shape,
      width: src.width,
      height: src.height,
      seatSize: src.seatSize,
      seatGap: src.seatGap,
      seatShape: src.seatShape,
      seatSide: src.seatSide,
      fontSize: src.fontSize,
      endSeats: src.endSeats,
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

export async function updateLegendColors(colors: {
  free: string;
  taken: string;
  yours: string;
  unavailable: string;
}) {
  const data = {
    freeColor: colors.free,
    takenColor: colors.taken,
    yoursColor: colors.yours,
    unavailableColor: colors.unavailable,
  };
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
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
  // Optional placement to set at the same time (e.g. natural size on upload).
  rect?: { x: number; y: number; width: number; height: number },
) {
  await prisma.premise.update({
    where: { id },
    data: {
      backgroundUrl,
      ...(rect
        ? {
            bgX: rect.x,
            bgY: rect.y,
            bgWidth: rect.width,
            bgHeight: rect.height,
          }
        : {}),
    },
  });
  revalidateAll();
}

// Set the global wall appearance (colour and/or opacity) for the premise —
// applied to every WALL fixture when the plan is rendered.
export async function updatePremiseWallStyle(
  id: string,
  data: { wallColor?: string; wallOpacity?: number },
) {
  await prisma.premise.update({
    where: { id },
    data: {
      ...("wallColor" in data ? { wallColor: data.wallColor } : {}),
      ...("wallOpacity" in data ? { wallOpacity: data.wallOpacity } : {}),
    },
  });
  revalidateAll();
}

// Reposition/resize the floor-plan background image in world space.
export async function updatePremiseBackgroundRect(
  id: string,
  rect: { x: number; y: number; width: number; height: number },
) {
  await prisma.premise.update({
    where: { id },
    data: { bgX: rect.x, bgY: rect.y, bgWidth: rect.width, bgHeight: rect.height },
  });
  revalidateAll();
}
