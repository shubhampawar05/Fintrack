"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight, BarChart3, FileText, Goal, Landmark, LayoutDashboard, Menu, PiggyBank, Repeat, Settings, Upload,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/analysis", label: "Spending Analysis", icon: BarChart3 },
  { href: "/accounts", label: "Bank Accounts", icon: Landmark },
  { href: "/import", label: "Import Statements", icon: Upload },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/goals", label: "Financial Goals", icon: Goal },
  { href: "/recurring", label: "Recurring Payments", icon: Repeat },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
              active && "bg-accent font-medium text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-3 font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Landmark className="size-4" />
      </span>
      Fintrack
    </Link>
  );
}

export function SidebarNav() {
  return <NavLinks />;
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetHeader className="p-0 pb-4">
          <SheetTitle asChild>
            <div>
              <Brand />
            </div>
          </SheetTitle>
        </SheetHeader>
        <NavLinks onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
