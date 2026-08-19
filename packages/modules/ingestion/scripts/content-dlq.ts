import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { DeadLetterService, parseDlqArgs } from '../src/dead-letter.service';
import { IngestionQueue } from '../src/ingestion.queue';

async function main() {
  const args = parseDlqArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const queue = new IngestionQueue(new ConfigService());
  const service = new DeadLetterService(prisma as never, queue);
  try {
    const result =
      args.action === 'inspect'
        ? await service.inspect(args.filter)
        : await service.retry(args.filter, { max: args.max, policyChanged: args.policyChanged });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await queue.onModuleDestroy();
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'CONTENT_DLQ_FAILED'}\n`);
  process.exitCode = 1;
});
