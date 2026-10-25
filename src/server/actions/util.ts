import "server-only";
import { ZodError } from "zod";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => i.message).join("; ") };
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    // Do not leak internals (or financial data) in error messages.
    const msg = e instanceof Error && !/prisma|SELECT|INSERT/i.test(e.message) ? e.message : "Something went wrong.";
    console.error("[action]", e instanceof Error ? e.name : "error");
    return { ok: false, error: msg };
  }
}
