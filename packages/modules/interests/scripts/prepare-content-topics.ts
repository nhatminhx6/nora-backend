import { PrismaClient } from '@prisma/client';
import { PreparedContentService } from '../src/prepared-content.service';

async function main() {
  const actor = process.argv.slice(2).find((value) => value.startsWith('--actor='))?.slice(8);
  if (!actor) throw new Error('PREPARE_ACTOR_REQUIRED');
  const prisma = new PrismaClient();
  try {
    process.stdout.write(`${JSON.stringify(await new PreparedContentService(prisma as never).reclassifyLegacyTopics(actor), null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'PREPARE_TOPICS_FAILED'}\n`);
  process.exitCode = 1;
});
