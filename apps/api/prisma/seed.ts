/**
 * Seed demo data: countries/regions, users with different roles, a workspace
 * with settings, and demo projects. Idempotent via upserts so it is safe to
 * re-run. Demo passwords are for local development only.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'signalkit-demo-pw';

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Countries & regions (reference data for market selectors).
  const countries = [
    { code: 'US', primaryLanguage: 'en', currency: 'USD', names: { en: 'United States', ru: 'США' } },
    { code: 'TR', primaryLanguage: 'tr', currency: 'TRY', names: { en: 'Türkiye', tr: 'Türkiye' } },
    { code: 'DE', primaryLanguage: 'de', currency: 'EUR', names: { en: 'Germany', de: 'Deutschland' } },
    { code: 'AE', primaryLanguage: 'ar', currency: 'AED', names: { en: 'United Arab Emirates', ar: 'الإمارات' } },
    { code: 'BR', primaryLanguage: 'pt', currency: 'BRL', names: { en: 'Brazil', pt: 'Brasil' } },
  ];
  for (const c of countries) {
    await prisma.country.upsert({
      where: { code: c.code },
      update: { primaryLanguage: c.primaryLanguage, currency: c.currency, names: c.names },
      create: c,
    });
  }
  await prisma.region.upsert({
    where: { code: 'US-CA' },
    update: {},
    create: { code: 'US-CA', countryCode: 'US', names: { en: 'California' } },
  });
  await prisma.region.upsert({
    where: { code: 'DE-BY' },
    update: {},
    create: { code: 'DE-BY', countryCode: 'DE', names: { en: 'Bavaria', de: 'Bayern' } },
  });

  // Owner user + settings.
  const owner = await prisma.user.upsert({
    where: { email: 'founder@signalkit.dev' },
    update: {},
    create: {
      email: 'founder@signalkit.dev',
      passwordHash,
      displayName: 'Demo Founder',
      emailVerified: true,
      interfaceLocale: 'en',
      settings: { create: { interfaceLocale: 'en', countryOfResidence: 'TR' } },
    },
  });

  // A strategist and a viewer to exercise RBAC.
  const strategist = await prisma.user.upsert({
    where: { email: 'strategist@signalkit.dev' },
    update: {},
    create: {
      email: 'strategist@signalkit.dev',
      passwordHash,
      displayName: 'Demo Strategist',
      emailVerified: true,
      settings: { create: {} },
    },
  });
  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@signalkit.dev' },
    update: {},
    create: {
      email: 'viewer@signalkit.dev',
      passwordHash,
      displayName: 'Demo Viewer',
      emailVerified: true,
      settings: { create: {} },
    },
  });

  // Workspace with settings, LLM settings, billing, and members.
  const existing = await prisma.workspace.findUnique({ where: { slug: 'demo-studio' } });
  const workspace =
    existing ??
    (await prisma.workspace.create({
      data: {
        name: 'Demo Studio',
        slug: 'demo-studio',
        ownerId: owner.id,
        settings: { create: { defaultLocale: 'en', defaultMarketCountry: 'US' } },
        llmSettings: { create: {} },
        billingAccount: { create: { plan: 'founder_pro', creditBalance: 1000 } },
        members: {
          create: [
            { userId: owner.id, role: 'owner', status: 'active' },
            { userId: strategist.id, role: 'strategist', status: 'active' },
            { userId: viewer.id, role: 'viewer', status: 'active' },
          ],
        },
      },
    }));

  // Demo projects across markets.
  const projectCount = await prisma.project.count({ where: { workspaceId: workspace.id } });
  if (projectCount === 0) {
    await prisma.project.createMany({
      data: [
        {
          workspaceId: workspace.id,
          createdById: owner.id,
          name: 'Clinic WhatsApp AI sales copilot',
          goal: 'Help Turkish clinics convert WhatsApp inquiries into booked visits.',
          marketScope: 'manual_country',
          targetCountry: 'TR',
          marketLanguage: 'tr',
          defaultOutputLanguage: 'tr',
        },
        {
          workspaceId: workspace.id,
          createdById: owner.id,
          name: 'EU AI Act SMB compliance assistant',
          goal: 'Guide German SMBs through EU AI Act obligations.',
          marketScope: 'manual_country',
          targetCountry: 'DE',
          marketLanguage: 'de',
          defaultOutputLanguage: 'de',
        },
      ],
    });
  }

  console.log(
    `Seeded: ${countries.length} countries, 3 users, workspace "${workspace.slug}", demo projects.\n` +
      `Demo login: founder@signalkit.dev / ${DEMO_PASSWORD}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
