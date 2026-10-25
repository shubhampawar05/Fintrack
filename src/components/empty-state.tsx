import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      {icon && <div className="text-muted-foreground [&_svg]:size-8">{icon}</div>}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && (
        <Button asChild size="sm">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
