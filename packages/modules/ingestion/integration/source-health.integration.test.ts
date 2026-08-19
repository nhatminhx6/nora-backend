import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient, SourceCircuitState, SourceKind, SubscriptionStatus } from '@prisma/client';
import { SourceHealthService } from '../src/source-health.service';

const prisma = new PrismaClient();

test('circuit opens, probes half-open, recovers and honors manual controls', async (context) => {
  const suffix = randomUUID().slice(0, 8);
  const source = await prisma.source.create({
    data: {
      name: `Health ${suffix}`,
      slug: `health-${suffix}`,
      kind: SourceKind.RSS,
      adapterKey: 'generic-rss-v2',
      defaultIntervalSec: 900,
    },
  });
  const subscription = await prisma.sourceSubscription.create({
    data: { sourceId: source.id, subscriptionKey: 'health', nextSyncAt: new Date() },
  });
  context.after(async () => {
    await prisma.source.delete({ where: { id: source.id } });
    await prisma.$disconnect();
  });
  const health = new SourceHealthService(prisma as never);
  const failureAt = new Date('2026-08-14T08:00:00Z');
  for (let attempt = 0; attempt < 5; attempt += 1)
    await health.recordFailure(subscription.id, 'NETWORK_ERROR', failureAt);
  let stored = await prisma.sourceSubscription.findUniqueOrThrow({
    where: { id: subscription.id },
  });
  assert.equal(stored.circuitState, SourceCircuitState.OPEN);
  assert.equal(stored.status, SubscriptionStatus.PAUSED);
  assert.equal(stored.consecutiveFailures, 5);
  assert.deepEqual((stored.healthMetrics as { errors: object }).errors, { NETWORK_ERROR: 5 });

  assert.equal(await health.releaseDueProbes(new Date('2026-08-14T08:14:59Z')), 0);
  assert.equal(await health.releaseDueProbes(new Date('2026-08-14T08:15:00Z')), 1);
  stored = await prisma.sourceSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(stored.circuitState, SourceCircuitState.HALF_OPEN);
  assert.equal(stored.status, SubscriptionStatus.ACTIVE);

  await health.recordSuccess(subscription.id, new Date('2026-08-14T08:15:01Z'));
  stored = await prisma.sourceSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(stored.circuitState, SourceCircuitState.CLOSED);
  assert.equal(stored.consecutiveFailures, 0);
  assert.ok(stored.lastSuccessAt);

  await health.manualPause(subscription.id);
  await health.releaseDueProbes(new Date('2027-08-14T08:00:00Z'));
  stored = await prisma.sourceSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(stored.circuitState, SourceCircuitState.MANUAL_PAUSED);
  await health.manualResume(subscription.id, new Date('2026-08-14T09:00:00Z'));
  stored = await prisma.sourceSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(stored.circuitState, SourceCircuitState.CLOSED);
  assert.equal(stored.status, SubscriptionStatus.ACTIVE);

  for (let attempt = 0; attempt < 4; attempt += 1)
    await health.recordFailure(subscription.id, 'HTTP_403', new Date('2026-08-14T09:01:00Z'));
  stored = await prisma.sourceSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(stored.circuitState, SourceCircuitState.OPEN);
  assert.equal(stored.consecutiveFailures, 4, '403 rate opens before generic failure threshold');

  await health.manualResume(subscription.id, new Date('2026-08-14T10:00:00Z'));
  for (let attempt = 0; attempt < 10; attempt += 1)
    await health.recordParserResult(
      subscription.id,
      attempt >= 6,
      new Date('2026-08-14T10:01:00Z'),
    );
  stored = await prisma.sourceSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(stored.circuitState, SourceCircuitState.OPEN);
  assert.equal(stored.lastErrorCode, 'PARSER_REJECT_SPIKE');
});
