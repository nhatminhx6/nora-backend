import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { IngestionQueue } from '../src/ingestion.queue';
import { parseReplayArgs, RawPayloadReplayService } from '../src/raw-payload-replay.service';

async function main() {
  const prisma = new PrismaClient();
  const queue = new IngestionQueue(new ConfigService());
  try {
    process.stdout.write(
      `${JSON.stringify(await new RawPayloadReplayService(prisma as never, queue).replay(parseReplayArgs(process.argv.slice(2))), null, 2)}\n`,
    );
  } finally {
    await queue.onModuleDestroy();
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'CONTENT_REPLAY_FAILED'}\n`);
  process.exitCode = 1;
});
