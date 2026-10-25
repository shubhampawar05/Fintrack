import { requireUser } from "@/server/auth";
import { getSetupProgress } from "@/server/onboarding";
import { PageHeader } from "@/components/page-header";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { HowItWorks } from "@/components/onboarding/how-it-works";
import { ShowChecklistButton } from "@/components/onboarding/checklist-actions";

export default async function GuidePage() {
  const user = await requireUser();
  const { progress, guideSeen, checklistHidden } = await getSetupProgress(user.id);
  return (
    <>
      <PageHeader
        title="Guide"
        description="Your setup progress and how Fintrack counts your money."
        actions={
          <>
            {checklistHidden && !progress.allRequiredDone && <ShowChecklistButton />}
            <HowItWorks seen={guideSeen} />
          </>
        }
      />
      <SetupChecklist progress={progress} mode="full" />
    </>
  );
}
