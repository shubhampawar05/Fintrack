import { Landmark, Upload } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

const COPY = {
  accounts: {
    icon: <Landmark />,
    title: "Add a bank account first",
    description: "Statements are imported into a specific account. Add one entry per bank account — only the bank name, type and last 4 digits are needed.",
    action: { href: "/accounts", label: "Add account" },
  },
  statements: {
    icon: <Upload />,
    title: "Import a statement first",
    description: "Upload a PDF, CSV or XLSX statement for one of your accounts. You'll preview every row before anything is saved.",
    action: { href: "/import", label: "Import statement" },
  },
};

/** Empty state for a data page whose content depends on an unfinished setup step. */
export function SetupEmptyState({ prerequisite, what }: { prerequisite: "accounts" | "statements"; what?: string }) {
  const c = COPY[prerequisite];
  return (
    <EmptyState
      icon={c.icon}
      title={c.title}
      description={what ? `${what} ${c.description}` : c.description}
      action={c.action}
      secondary={{ href: "/guide", label: "See all setup steps" }}
    />
  );
}
