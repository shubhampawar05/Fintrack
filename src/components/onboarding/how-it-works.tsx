"use client";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Compass } from "lucide-react";
import { HOW_IT_WORKS } from "@/lib/onboarding/steps";
import { markGuideSeenAction } from "@/server/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * "How Fintrack works" walkthrough. With `autoOpen` it opens on mount (first dashboard visit) and
 * records that it was seen when closed; otherwise it opens from its trigger button.
 */
export function HowItWorks({ autoOpen = false, seen }: { autoOpen?: boolean; seen: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const [step, setStep] = useState(0);
  const recorded = useRef(seen);
  const last = HOW_IT_WORKS.length - 1;
  const s = HOW_IT_WORKS[step];

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) setStep(0);
    if (!next && !recorded.current) {
      recorded.current = true;
      void markGuideSeenAction();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!autoOpen && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Compass /> How Fintrack works
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
            Step {step + 1} of {HOW_IT_WORKS.length}
          </p>
          <DialogTitle>{s.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">
              {s.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-1.5" aria-hidden>
          {HOW_IT_WORKS.map((x, i) => (
            <span key={x.title} className={`h-1.5 w-6 rounded-full ${i === step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0} className={step === 0 ? "invisible" : ""}>
            <ArrowLeft /> Back
          </Button>
          {step < last ? (
            <Button onClick={() => setStep(step + 1)}>
              Next <ArrowRight />
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Get started</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
