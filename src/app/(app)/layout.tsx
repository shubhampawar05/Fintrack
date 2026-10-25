import { LogOut } from "lucide-react";
import { requireUser } from "@/server/auth";
import { logout } from "@/server/actions/auth";
import { Brand, MobileNav, SidebarNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="no-print sticky top-0 hidden h-svh flex-col gap-6 border-r bg-sidebar px-3 py-5 lg:flex">
        <Brand />
        <SidebarNav />
        <div className="mt-auto flex items-center justify-between px-1">
          <ThemeToggle />
          <form action={logout}>
            <Button variant="ghost" size="sm" type="submit">
              <LogOut /> Sign out
            </Button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-2 backdrop-blur lg:hidden">
          <div className="flex items-center gap-1">
            <MobileNav />
            <Brand />
          </div>
          <div className="flex items-center">
            <ThemeToggle />
            <form action={logout}>
              <Button variant="ghost" size="icon" type="submit" aria-label="Sign out">
                <LogOut />
              </Button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
