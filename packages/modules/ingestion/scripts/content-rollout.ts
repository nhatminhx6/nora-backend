import { PrismaClient } from '@prisma/client';
import { ContentRolloutService } from '../src/content-rollout.service';

async function main() {
  const email = argument('--user=');
  const actor = argument('--actor=');
  const reason = argument('--reason=');
  const enabledValue = argument('--enabled=');
  if (!email || !actor || !reason || !['true', 'false'].includes(enabledValue ?? ''))
    throw new Error('ROLLOUT_ARGS_REQUIRED');
  const prisma = new PrismaClient();
  try {
    const report = await new ContentRolloutService(prisma as never).setAccount({
      email,
      actor,
      reason,
      enabled: enabledValue === 'true',
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}
function argument(prefix: string): string | undefined {
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'CONTENT_ROLLOUT_FAILED'}\n`);
  process.exitCode = 1;
});
