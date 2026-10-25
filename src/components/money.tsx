import { formatINR, type Paise } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Amount display. `tone="direction"` colours credits green and debits neutral (with sign). */
export function Money({
  paise,
  direction,
  tone = "neutral",
  compact,
  className,
}: {
  paise: Paise;
  direction?: "DEBIT" | "CREDIT";
  tone?: "neutral" | "direction" | "signed";
  compact?: boolean;
  className?: string;
}) {
  const signed = direction === "DEBIT" ? -paise : paise;
  const text =
    tone === "direction" && direction
      ? `${direction === "CREDIT" ? "+" : "−"}${formatINR(paise, { compact })}`
      : formatINR(tone === "signed" ? signed : paise, { compact, sign: tone === "signed" });
  const color =
    (tone === "direction" && direction === "CREDIT") || (tone === "signed" && signed > 0)
      ? "text-positive"
      : tone === "signed" && signed < 0
        ? "text-negative"
        : undefined;
  return <span className={cn("tabular whitespace-nowrap", color, className)}>{text}</span>;
}
