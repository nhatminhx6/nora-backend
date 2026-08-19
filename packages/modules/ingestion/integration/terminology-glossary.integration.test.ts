import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { TerminologyGlossaryService } from '../src/terminology-glossary.service';

const prisma = new PrismaClient();

test('glossary seeds, resolves domain conflicts and round-trips review JSON', async (context) => {
  context.after(async () => {
    await prisma.terminologyEntry.deleteMany({
      where: { version: { in: ['glossary-v1', 'zh-extension-v1'] } },
    });
    await prisma.$disconnect();
  });
  const service = new TerminologyGlossaryService(prisma as never);
  const seeded = await service.seedV1();
  assert.equal(seeded.imported, 20);
  await service.importEntries([
    {
      sourceLanguage: 'en',
      targetLocale: 'vi',
      sourceTerm: 'interest rate',
      preferredTerm: 'mức lãi',
      protected: false,
      domain: 'general-news',
      version: 'glossary-v1',
    },
    {
      sourceLanguage: 'en',
      targetLocale: 'zh-Hans',
      sourceTerm: 'OpenAI',
      preferredTerm: 'OpenAI',
      protected: true,
      domain: 'organization-product',
      version: 'zh-extension-v1',
    },
  ]);
  const finance = await service.resolve(' INTEREST  RATE ', {
    sourceLanguage: 'en',
    targetLocale: 'vi',
    domains: ['economy-finance'],
    version: 'glossary-v1',
  });
  assert.equal(finance?.preferredTerm, 'lãi suất');
  assert.equal(finance?.domain, 'economy-finance');
  const exported = await service.exportJson({ targetLocale: 'vi', version: 'glossary-v1' });
  const before = await prisma.terminologyEntry.count({
    where: { targetLocale: 'vi', version: 'glossary-v1' },
  });
  await service.importJson(exported);
  const after = await prisma.terminologyEntry.count({
    where: { targetLocale: 'vi', version: 'glossary-v1' },
  });
  assert.equal(after, before);
  assert.deepEqual(
    JSON.parse(await service.exportJson({ targetLocale: 'vi', version: 'glossary-v1' })),
    JSON.parse(exported),
  );
  assert.equal(await prisma.terminologyEntry.count({ where: { targetLocale: 'zh-Hans' } }), 1);
});
