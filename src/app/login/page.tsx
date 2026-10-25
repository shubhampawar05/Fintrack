import { LoginForm } from "./login-form";
import { Landmark } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Landmark className="size-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Fintrack</h1>
          <p className="text-sm text-muted-foreground">Your financial data stays on this machine.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
