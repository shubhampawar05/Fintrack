import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { userFromRequestCookie } from "@/server/auth";
import { SESSION_COOKIE } from "@/server/session";
import { rateLimit } from "@/server/rate-limit";
import { importPaymentAppStatement } from "@/server/payment-app";
import { MAX_FILE_BYTES } from "@/lib/parsing";

export const runtime = "nodejs";

/** Upload a Paytm UPI statement. Parsed in memory; the file is not kept. */
export async function POST(req: NextRequest) {
  const user = await userFromRequestCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (req.headers.get("origin") && new URL(req.headers.get("origin")!).host !== req.headers.get("host")) {
    return NextResponse.json({ error: "Cross-origin upload rejected" }, { status: 403 });
  }
  const limit = rateLimit(`upload:${user.id}`, 30, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "Too many uploads. Please wait a few minutes." }, { status: 429 });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_FILE_BYTES + 64 * 1024) return NextResponse.json({ error: "File is larger than 15 MB." }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const file = form.get("file");
  const password = form.get("password");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is larger than 15 MB." }, { status: 413 });
  try {
    const result = await importPaymentAppStatement({
      userId: user.id,
      fileName: file.name.replace(/[^\w.\- ()']/g, "_"),
      bytes: new Uint8Array(await file.arrayBuffer()),
      password: typeof password === "string" && password ? password : undefined,
    });
    if (result.ok) revalidatePath("/", "layout");
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (e) {
    console.error("[payment-app] failed:", e instanceof Error ? e.name : "error");
    return NextResponse.json({ error: "The statement could not be processed." }, { status: 400 });
  }
}
