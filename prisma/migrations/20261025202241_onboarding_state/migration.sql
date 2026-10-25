-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "onboardingChecklistHiddenAt" TIMESTAMP(3),
ADD COLUMN     "onboardingGuideSeenAt" TIMESTAMP(3),
ADD COLUMN     "onboardingReviewDoneAt" TIMESTAMP(3);
