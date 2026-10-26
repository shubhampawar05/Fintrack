import Link from "next/link";
import { formatINR, type Paise } from "@/lib/money";
import { href } from "@/lib/range-params";

/** Next to a spending total: unclassified debits are not counted, so say so and link to Money flow. */
export function UnclassifiedNotice({ paise, rangeQuery }: { paise: Paise; rangeQuery: Record<string, string> }) {
  if (paise <= 0) return null;
  return (
    <Link href={href("/money-flow", rangeQuery)} className="mt-1 block text-xs font-medium text-foreground underline-offset-4 hover:underline">
      {formatINR(paise, { decimals: false })} more not yet classified — not counted
    </Link>
  );
}
