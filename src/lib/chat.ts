// Chatbot tool surface — natural-language desk booking on top of the existing
// server actions and Prisma data model. These functions are the bridge between
// Claude's tool calls and Deskly's domain logic; they are pure server-side and
// always scoped to the supplied bookerId (the logged-in identity), never trusting
// an id from the model.

import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { parseTags } from "@/lib/types";
import { isoDate, weekdayLabel } from "@/lib/time";
import { sweepExpiredBookings } from "@/lib/release";
import { createBooking, cancelBooking } from "@/server/actions";

// ---- Tool schemas exposed to Claude ---------------------------------------
export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_available_desks",
    description:
      "List bookable desks and rooms that are free on a given date. Use this to find candidates before creating a booking, or to answer availability questions. Returns each desk's id (needed for create_booking), name, type, zone, tags and description.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "The date to check, in ISO format YYYY-MM-DD.",
        },
        type: {
          type: "string",
          enum: ["DESK", "ROOM"],
          description: "Optional filter: only desks, or only rooms.",
        },
        tag: {
          type: "string",
          description:
            "Optional tag to filter on, e.g. 'standing', 'window', 'dual-monitor', 'accessible'.",
        },
        zoneType: {
          type: "string",
          enum: ["QUIET", "COLLAB", "STANDING", "FOCUS", "SOCIAL"],
          description: "Optional filter: only desks in zones of this type.",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "create_booking",
    description:
      "Reserve one or more desks/rooms for the current user on a date. Always confirm the desk(s) and date with the user, and verify availability with list_available_desks first. Pass the bookable ids returned by list_available_desks.",
    input_schema: {
      type: "object",
      properties: {
        bookableIds: {
          type: "array",
          items: { type: "string" },
          description: "The ids of the desks/rooms to book (from list_available_desks).",
        },
        date: {
          type: "string",
          description: "The booking date in ISO format YYYY-MM-DD.",
        },
        startTime: {
          type: "string",
          description: "Optional start time HH:MM (24h). Defaults to 09:00.",
        },
        endTime: {
          type: "string",
          description: "Optional end time HH:MM (24h). Defaults to 17:00.",
        },
        title: {
          type: "string",
          description: "Optional short title/purpose for the booking.",
        },
      },
      required: ["bookableIds", "date"],
    },
  },
  {
    name: "list_my_bookings",
    description:
      "List the current user's own upcoming bookings (today onwards), including each booking's id (needed for cancel_booking), date, time, desk names and status.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cancel_booking",
    description:
      "Cancel one of the current user's bookings by its id. Confirm with the user before cancelling. Use list_my_bookings to find the id.",
    input_schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          description: "The id of the booking to cancel (from list_my_bookings).",
        },
      },
      required: ["bookingId"],
    },
  },
];

// ---- Tool executor ---------------------------------------------------------
// Runs a single tool call and returns a JSON-serialisable result for the model.
export async function runChatTool(
  name: string,
  input: Record<string, unknown>,
  bookerId: string,
): Promise<unknown> {
  switch (name) {
    case "list_available_desks":
      return listAvailableDesks(input);
    case "create_booking":
      return createBookingTool(input, bookerId);
    case "list_my_bookings":
      return listMyBookings(bookerId);
    case "cancel_booking":
      return cancelBookingTool(input, bookerId);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// Desks free on a date = available desks with no active booking that day.
async function listAvailableDesks(input: Record<string, unknown>) {
  const date = String(input.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "date must be in YYYY-MM-DD format." };
  }
  await sweepExpiredBookings();

  const premise = await prisma.premise.findFirst({
    include: { zones: true, bookables: { orderBy: { name: "asc" } } },
  });
  if (!premise) return { error: "No premise configured." };

  const taken = await prisma.booking.findMany({
    where: { date, status: { in: ["RESERVED", "CHECKED_IN"] } },
    include: { bookables: { select: { id: true } } },
  });
  const takenIds = new Set(taken.flatMap((b) => b.bookables.map((bk) => bk.id)));
  const zoneById = new Map(premise.zones.map((z) => [z.id, z]));

  const typeFilter = input.type ? String(input.type) : null;
  const tagFilter = input.tag ? String(input.tag).toLowerCase() : null;
  const zoneFilter = input.zoneType ? String(input.zoneType) : null;

  const desks = premise.bookables
    .filter((b) => b.isAvailable && !takenIds.has(b.id))
    .map((b) => {
      const zone = b.zoneId ? zoneById.get(b.zoneId) : null;
      return {
        id: b.id,
        name: b.name,
        type: b.type,
        zone: zone ? zone.name : null,
        zoneType: zone ? zone.type : null,
        tags: parseTags(b.tags),
        description: b.textDescription || null,
      };
    })
    .filter((d) => (typeFilter ? d.type === typeFilter : true))
    .filter((d) => (zoneFilter ? d.zoneType === zoneFilter : true))
    .filter((d) =>
      tagFilter ? d.tags.some((t) => t.toLowerCase().includes(tagFilter)) : true,
    );

  return {
    date,
    weekday: weekdayLabel(date),
    availableCount: desks.length,
    desks,
  };
}

async function createBookingTool(
  input: Record<string, unknown>,
  bookerId: string,
) {
  const bookableIds = Array.isArray(input.bookableIds)
    ? (input.bookableIds as unknown[]).map(String)
    : [];
  const date = String(input.date ?? "");
  if (!bookableIds.length) return { error: "No desks selected." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "date must be in YYYY-MM-DD format." };
  }

  // Re-check availability so the model can't double-book a desk taken since it
  // last listed them.
  const clash = await prisma.booking.findMany({
    where: {
      date,
      status: { in: ["RESERVED", "CHECKED_IN"] },
      bookables: { some: { id: { in: bookableIds } } },
    },
    include: { bookables: { select: { id: true, name: true } } },
  });
  if (clash.length) {
    const clashing = clash
      .flatMap((b) => b.bookables)
      .filter((bk) => bookableIds.includes(bk.id))
      .map((bk) => bk.name);
    return {
      error: `Already booked for ${date}: ${[...new Set(clashing)].join(", ")}. Pick a different desk or date.`,
    };
  }

  const desks = await prisma.bookable.findMany({
    where: { id: { in: bookableIds } },
    select: { id: true, name: true },
  });
  if (desks.length !== bookableIds.length) {
    return { error: "One or more desk ids were not found." };
  }

  const bookingId = await createBooking({
    bookerId,
    bookableIds,
    date,
    startTime: input.startTime ? String(input.startTime) : undefined,
    endTime: input.endTime ? String(input.endTime) : undefined,
    bookingTitle: input.title ? String(input.title) : undefined,
  });

  return {
    success: true,
    bookingId,
    date,
    weekday: weekdayLabel(date),
    desks: desks.map((d) => d.name),
    startTime: input.startTime ? String(input.startTime) : "09:00",
    endTime: input.endTime ? String(input.endTime) : "17:00",
  };
}

async function listMyBookings(bookerId: string) {
  await sweepExpiredBookings();
  const today = isoDate(new Date());
  const bookings = await prisma.booking.findMany({
    where: { bookerId, date: { gte: today } },
    include: { bookables: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return {
    count: bookings.length,
    bookings: bookings.map((b) => ({
      id: b.id,
      date: b.date,
      weekday: weekdayLabel(b.date),
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      title: b.bookingTitle || null,
      desks: b.bookables.map((bk) => bk.name),
    })),
  };
}

async function cancelBookingTool(
  input: Record<string, unknown>,
  bookerId: string,
) {
  const bookingId = String(input.bookingId ?? "");
  if (!bookingId) return { error: "bookingId is required." };

  // Ownership check — never cancel someone else's booking from a model id.
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookables: { select: { name: true } } },
  });
  if (!booking) return { error: "Booking not found." };
  if (booking.bookerId !== bookerId) {
    return { error: "That booking belongs to someone else and can't be cancelled." };
  }

  await cancelBooking(bookingId);
  return {
    success: true,
    cancelled: { date: booking.date, desks: booking.bookables.map((b) => b.name) },
  };
}
