import "server-only";
import { cookies } from "next/headers";
import { MONTH_COOKIE, RANGE_COOKIE, readParam, type SearchParams } from "@/lib/range-params";

/** When the URL names no range, fall back to the last one the user picked (validated later by rangeFromParams). */
export async function withSavedRange(sp: SearchParams): Promise<SearchParams> {
  if (readParam(sp, "range")) return sp;
  const saved = (await cookies()).get(RANGE_COOKIE)?.value;
  if (!saved) return sp;
  const [range, from, to] = saved.split("|");
  return { ...sp, range, from: from || undefined, to: to || undefined };
}

/** When the URL names no month, fall back to the last one the user picked (validated later by monthFromParams). */
export async function withSavedMonth(sp: SearchParams): Promise<SearchParams> {
  if (readParam(sp, "month")) return sp;
  const saved = (await cookies()).get(MONTH_COOKIE)?.value;
  return saved ? { ...sp, month: saved } : sp;
}
