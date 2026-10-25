import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondary,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** A link, or a ready-made element such as a dialog trigger. */
  action?: { href: string; label: string } | React.ReactElement;
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      {icon && <div className="text-muted-foreground [&_svg]:size-8">{icon}</div>}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>}
      </div>
      {(action || secondary) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {action &&
            ("href" in action && "label" in action ? (
              <Button asChild size="sm">
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ) : (
              action
            ))}
          {secondary && (
            <Link href={secondary.href} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {secondary.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
