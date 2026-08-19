import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { TerminologyGlossaryService } from '../src/terminology-glossary.service';

async function main(): Promise<void> {
  const [action, path] = process.argv.slice(2);
  const prisma = new PrismaClient();
  const service = new TerminologyGlossaryService(prisma as never);
  try {
    if (action === 'seed') {
      process.stdout.write(`${JSON.stringify(await service.seedV1())}\n`);
      return;
    }
    if (action === 'export' && path) {
      const outputPath = resolve(path);
      await writeFile(outputPath, `${await service.exportJson()}\n`, 'utf8');
      process.stdout.write(`${outputPath}\n`);
      return;
    }
    if (action === 'import' && path) {
      process.stdout.write(
        `${JSON.stringify(await service.importJson(await readFile(resolve(path), 'utf8')))}\n`,
      );
      return;
    }
    throw new Error('USAGE: npm run terminology -- seed|export <path>|import <path>');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'TERMINOLOGY_COMMAND_FAILED'}\n`,
  );
  process.exitCode = 1;
});
