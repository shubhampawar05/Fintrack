import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import type { SetupProgress, SetupStep } from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { HideChecklistButton, MarkReviewDoneButton } from "./checklist-actions";

/**
 * Setup checklist. `full` is the first-run view (and the Guide page); `banner` sits above the
 * dashboard while required steps remain and can be hidden.
 */
export function SetupChecklist({ progress, mode }: { progress: SetupProgress; mode: "full" | "banner" }) {
  const required = progress.steps.filter((s) => s.required);
  const optional = progress.steps.filter((s) => !s.required);
  // The first unfinished step gets the primary button, so it's clear where to start.
  const next = progress.steps.find((s) => !s.done)?.id;
  const pct = Math.round((progress.requiredDone / progress.requiredTotal) * 100);
  return (
    <Card className={cn(mode === "banner" && "mb-6")}>
      <CardHeader>
        <CardTitle>{mode === "full" && progress.requiredDone === 0 ? "Welcome — let's set up Fintrack" : "Finish setting up"}</CardTitle>
        <CardDescription>
          {progress.requiredDone} of {progress.requiredTotal} required steps done. Steps tick themselves off as your data comes in.
        </CardDescription>
        {mode === "banner" && (
          <CardAction>
            <HideChecklistButton />
          </CardAction>
        )}
        <Progress value={pct} aria-label={`${progress.requiredDone} of ${progress.requiredTotal} required steps done`} className="mt-2" />
      </CardHeader>
      <CardContent className="space-y-5">
        <ol className="space-y-2">
          {required.map((s, i) => (
            <StepRow key={s.id} step={s} n={i + 1} isNext={s.id === next} compact={mode === "banner"} />
          ))}
        </ol>
        {mode === "full" && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Optional</h3>
            <ol className="space-y-2">
              {optional.map((s, i) => (
                <StepRow key={s.id} step={s} n={required.length + i + 1} isNext={s.id === next} />
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepRow({ step, n, isNext, compact = false }: { step: SetupStep; n: number; isNext: boolean; compact?: boolean }) {
  // In the banner, finished steps collapse to one line so the remaining work stands out.
  const collapsed = compact && step.done;
  return (
    <li className={cn("flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center", step.done && "bg-muted/40")}>
      <div className="flex min-w-0 flex-1 gap-3">
        {step.done ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden />
        ) : (
          <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">
            <span className="sr-only">Step {n}: </span>
            {step.title}
            <span className={cn("ml-2 text-xs font-normal", step.done ? "text-positive" : "text-muted-foreground")}>
              {step.done ? "Done" : step.required ? "To do" : "Optional"}
            </span>
          </p>
          {!collapsed && <p className="text-sm text-muted-foreground">{step.reason}</p>}
          {step.detail && <p className="text-xs text-muted-foreground">{step.detail}</p>}
        </div>
      </div>
      {!collapsed && (
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {step.canMarkDone && <MarkReviewDoneButton />}
          <Button asChild size="sm" variant={isNext ? "default" : "outline"}>
            <Link href={step.href}>
              {step.done ? "Open" : step.action} <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
    </li>
  );
}
