import { PrismaClient } from '@prisma/client';
import {
  LegacyContentBackfillService,
  parseBackfillArgs,
} from '../src/legacy-content-backfill.service';

async function main() {
  const prisma = new PrismaClient();
  try {
    process.stdout.write(
      `${JSON.stringify(await new LegacyContentBackfillService(prisma as never).run(parseBackfillArgs(process.argv.slice(2))), null, 2)}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'CONTENT_BACKFILL_FAILED'}\n`);
  process.exitCode = 1;
});
