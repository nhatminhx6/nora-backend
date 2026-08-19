import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { ContentRetentionPolicy, PrismaClient, SourceKind } from '@prisma/client';
import { Queue } from 'bullmq';
import { IngestionQueue, INGESTION_QUEUE, redisConnection } from '../src/ingestion.queue';
import { SourceSchedulerService, scheduleBucket } from '../src/source-scheduler.service';

const prisma = new PrismaClient();
const config = new ConfigService(process.env);

test('day 2 PostgreSQL and Redis identities survive scheduler/worker concurrency', async (context) => {
  const suffix = randomUUID().slice(0, 8);
  const source = await prisma.source.create({
    data: {
      name: `Integration ${suffix}`,
      slug: `integration-${suffix}`,
      kind: SourceKind.RSS,
      adapterKey: 'generic-rss',
      baseUrl: 'https://example.org/feed.xml',
      defaultIntervalSec: 900,
      config: { licensePolicy: ContentRetentionPolicy.FULL_TEXT },
    },
  });
  const subscription = await prisma.sourceSubscription.create({
    data: {
      sourceId: source.id,
      subscriptionKey: 'shared-source-for-100-users',
      nextSyncAt: new Date('2026-08-14T00:00:00Z'),
    },
  });
  const userDomain = `day2-${suffix}.integration`;
  await prisma.user.createMany({
    data: Array.from({ length: 100 }, (_, index) => ({
      email: `user-${index}@${userDomain}`,
      displayName: `Day 2 User ${index}`,
    })),
  });
  assert.equal(await prisma.user.count({ where: { email: { endsWith: `@${userDomain}` } } }), 100);
  const queue = new IngestionQueue(config);
  const rawQueue = new Queue(INGESTION_QUEUE, { connection: redisConnection(config) });
  const integrationJobIds: string[] = [];
  context.after(async () => {
    for (const jobId of integrationJobIds) await (await rawQueue.getJob(jobId))?.remove();
    await rawQueue.close();
    await queue.onModuleDestroy();
    await prisma.user.deleteMany({ where: { email: { endsWith: `@${userDomain}` } } });
    await prisma.rawSourcePayload.deleteMany({ where: { sourceId: source.id } });
    await prisma.pipelineRun.deleteMany({ where: { sourceId: source.id } });
    await prisma.source.delete({ where: { id: source.id } });
    await prisma.$disconnect();
  });

  const now = new Date('2026-08-14T08:03:00Z');
  const first = new SourceSchedulerService(prisma as never, queue);
  const second = new SourceSchedulerService(prisma as never, queue);
  const results = await Promise.all([
    first.scheduleDueSources(now, 100, 'scheduler-a'),
    second.scheduleDueSources(now, 100, 'scheduler-b'),
  ]);
  assert.equal(
    results.reduce((sum, result) => sum + result.claimed, 0),
    1,
  );
  assert.equal(
    results.reduce((sum, result) => sum + result.enqueued, 0),
    1,
  );
  integrationJobIds.push(...results.flatMap((result) => result.jobIds));

  const duplicate = await queue.enqueueContentJob({
    version: 2,
    type: 'FETCH_SOURCE',
    correlationId: 'restarted-worker',
    pipelineRunId: results.find((result) => result.claimed === 1)!.pipelineRunId,
    sourceId: source.id,
    subscriptionId: subscription.id,
    scheduleBucket: scheduleBucket(now),
    attempt: 1,
  });
  assert.equal(duplicate.jobId, results.find((result) => result.jobIds.length)!.jobIds[0]);
  integrationJobIds.push(duplicate.jobId);

  const payloadHash = 'a'.repeat(64);
  const rawIdentity = {
    sourceId_payloadHash: { sourceId: source.id, payloadHash },
  };
  const create = {
    sourceId: source.id,
    subscriptionId: subscription.id,
    requestUrl: source.baseUrl!,
    payloadHash,
    fetchedAt: now,
    retentionPolicy: ContentRetentionPolicy.FULL_TEXT,
    payload: Buffer.from('<rss/>'),
  };
  await prisma.rawSourcePayload.upsert({ where: rawIdentity, update: {}, create });
  await prisma.rawSourcePayload.upsert({ where: rawIdentity, update: {}, create });
  assert.equal(
    await prisma.rawSourcePayload.count({ where: { sourceId: source.id, payloadHash } }),
    1,
  );
});
