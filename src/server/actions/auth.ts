"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSessionToken, safeEqual, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/session";
import { getOrCreateOwner } from "@/server/auth";
import { rateLimit } from "@/server/rate-limit";

export async function login(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterMs / 60000)} minute(s).` };
  const parsed = z.object({ password: z.string().min(1).max(200) }).safeParse({ password: form.get("password") });
  const expected = process.env.APP_PASSWORD;
  if (!expected || expected.length < 8) return { error: "APP_PASSWORD is not configured (min 8 characters). See README." };
  if (!parsed.success || !safeEqual(parsed.data.password, expected)) return { error: "Incorrect password." };
  await getOrCreateOwner();
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
