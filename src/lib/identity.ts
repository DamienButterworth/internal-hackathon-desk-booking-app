import { cookies } from "next/headers";
import { prisma } from "./prisma";

const COOKIE = "deskly_bookerId";

// The "logged in" identity is just a Booker id stored in a cookie — no auth,
// by design (see plan). Admins are simply bookers with role === "ADMIN".
export async function getCurrentBooker() {
  const store = await cookies();
  const id = store.get(COOKIE)?.value;

  if (id) {
    const booker = await prisma.booker.findUnique({ where: { id } });
    if (booker) return booker;
  }
  // Default to the first regular user so the app is never identity-less.
  return prisma.booker.findFirst({
    where: { role: "USER" },
    orderBy: { name: "asc" },
  });
}

export async function setCurrentBookerCookie(id: string) {
  const store = await cookies();
  store.set(COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 30 });
}
