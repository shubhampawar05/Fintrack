import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { ensureUserDefaults } from "./bootstrap";

export const OWNER_EMAIL = process.env.APP_USER_EMAIL || "owner@fintrack.local";

export async function getOrCreateOwner() {
  const user = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: { email: OWNER_EMAIL, name: process.env.APP_USER_NAME || "Owner" },
  });
  await ensureUserDefaults(user.id);
  return user;
}

/**
 * Server-side authorization for every page, action and route handler.
 * All data access is scoped by the returned user's id.
 */
export const requireUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token))) redirect("/login");
  const user = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!user) redirect("/login");
  return user;
});

/** Variant for route handlers: returns null instead of redirecting. */
export async function userFromRequestCookie(token: string | undefined) {
  if (!(await verifySessionToken(token))) return null;
  return prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
}
