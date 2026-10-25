"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import * as svc from "@/server/onboarding";
import { run } from "./util";

export async function markGuideSeenAction() {
  return run(async () => {
    const user = await requireUser();
    await svc.markGuideSeen(user.id);
  });
}

export async function setChecklistHiddenAction(hidden: boolean) {
  return run(async () => {
    const user = await requireUser();
    await svc.setChecklistHidden(user.id, z.boolean().parse(hidden));
    revalidatePath("/", "layout");
  });
}

export async function setReviewDoneAction(done: boolean) {
  return run(async () => {
    const user = await requireUser();
    await svc.setReviewDone(user.id, z.boolean().parse(done));
    revalidatePath("/", "layout");
  });
}
