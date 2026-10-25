import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="space-y-1.5 px-4">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
