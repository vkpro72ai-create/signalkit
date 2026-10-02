-- AlterTable
ALTER TABLE "BuildBlueprint" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Niche" ADD COLUMN     "founderIdeaText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "intakeMode" TEXT NOT NULL DEFAULT 'discovered';

-- AlterTable
ALTER TABLE "ResearchUpdate" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VentureThesis" ALTER COLUMN "updatedAt" DROP DEFAULT;
