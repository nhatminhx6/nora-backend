import { createHash } from 'node:crypto';
import {
  DailyBriefStatus,
  EntityType,
  EventStatus,
  InsightType,
  NotificationChannel,
  NotificationStatus,
  PrismaClient,
  SourceKind,
  UserInsightStatus,
} from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_USER = {
  email: 'admin@nora.local',
  password: 'NoraLocal123!',
  displayName: 'Nora Admin',
};

const topics = [
  {
    key: 'openai',
    insightId: '00000000-0000-4000-8000-000000000001',
    name: 'OpenAI',
    type: EntityType.COMPANY,
    entityKey: 'company:openai',
    sourceName: 'OpenAI Newsroom',
    sourceSlug: 'openai-newsroom',
    sourceBaseUrl: 'https://openai.com/news/',
    sourceTier: 1,
    url: 'https://openai.com/index/learn-teach-chatgpt-work-codex/',
    publishedAt: '2026-08-04T00:00:00.000Z',
    title: 'OpenAI giới thiệu plugin giáo dục cho ChatGPT Work và Codex',
    content:
      'OpenAI giới thiệu ba plugin dành cho giáo viên K–12, giảng viên đại học và sinh viên, tích hợp tài liệu khóa học cùng các công cụ được phê duyệt.',
    summary:
      'Ba plugin giáo dục mới giúp giáo viên và sinh viên sử dụng ChatGPT Work và Codex với ngữ cảnh khóa học do họ lựa chọn.',
    importance: 0.92,
  },
  {
    key: 'bitcoin',
    insightId: '00000000-0000-4000-8000-000000000002',
    name: 'Bitcoin',
    type: EntityType.CRYPTO,
    entityKey: 'crypto:bitcoin',
    sourceName: 'CoinDesk',
    sourceSlug: 'coindesk-markets',
    sourceBaseUrl: 'https://www.coindesk.com/markets/',
    sourceTier: 2,
    url: 'https://www.coindesk.com/markets/2026/08/05/bitcoin-broader-market-fail-to-keep-pace-as-global-equities-hit-record-highs',
    publishedAt: '2026-08-05T11:01:00.000Z',
    title: 'Bitcoin đi ngang khi chứng khoán toàn cầu lập đỉnh',
    content:
      'Theo CoinDesk, Bitcoin giao dịch gần như không đổi quanh 64.000 USD trong khi các chỉ số chứng khoán toàn cầu tăng; dữ liệu phái sinh cho thấy hoạt động Bitcoin và Ether trầm lắng.',
    summary:
      'Bitcoin chưa theo kịp đà tăng của chứng khoán toàn cầu; dòng vốn stablecoin và dữ liệu phái sinh cho thấy nhu cầu crypto còn yếu.',
    importance: 0.86,
  },
  {
    key: 'apple',
    insightId: '00000000-0000-4000-8000-000000000003',
    name: 'Apple',
    type: EntityType.COMPANY,
    entityKey: 'company:apple',
    sourceName: 'OpenAI Newsroom',
    sourceSlug: 'openai-newsroom',
    sourceBaseUrl: 'https://openai.com/news/',
    sourceTier: 1,
    url: 'https://openai.com/index/apple-is-getting-this-wrong/',
    publishedAt: '2026-08-03T00:00:00.000Z',
    title: 'OpenAI công bố phản hồi về vụ kiện của Apple',
    content:
      'Trong bài đăng ngày 3/8, OpenAI phản bác một số cáo buộc của Apple liên quan đến cựu nhân viên và thông tin mật; đây là lập trường từ phía OpenAI trong tranh chấp.',
    summary:
      'OpenAI đưa ra phản hồi công khai đối với các cáo buộc của Apple và công bố tài liệu hỗ trợ cho lập trường của mình.',
    importance: 0.78,
  },
] as const;

function localDate(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function main(): Promise<void> {
  const timeZone = 'Asia/Ho_Chi_Minh';
  const dateKey = localDate(timeZone);
  const briefDate = new Date(`${dateKey}T00:00:00.000Z`);
  const now = new Date();

  const targetEmail = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  const user = targetEmail
    ? await prisma.user.findUniqueOrThrow({ where: { email: targetEmail } })
    : await prisma.user.upsert({
        where: { email: DEMO_USER.email },
        update: { displayName: DEMO_USER.displayName, timezone: timeZone, locale: 'vi' },
        create: {
          email: DEMO_USER.email,
          passwordHash: await hash(DEMO_USER.password, 12),
          displayName: DEMO_USER.displayName,
          timezone: timeZone,
          locale: 'vi',
          notificationPrefs: { push: true, dailyBrief: true },
          profileData: { onboardingCompleted: true },
        },
      });

  const invalidEvents = await prisma.event.findMany({
    where: { url: { contains: 'example.com/nora-demo' }, status: { not: EventStatus.REJECTED } },
  });
  for (const event of invalidEvents) {
    const previousMetadata =
      typeof event.metadata === 'object' &&
      event.metadata !== null &&
      !Array.isArray(event.metadata)
        ? event.metadata
        : {};
    await prisma.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.REJECTED,
        metadata: {
          ...previousMetadata,
          invalidatedAt: now.toISOString(),
          invalidationReason: 'PLACEHOLDER_SOURCE_URL',
          revisions: [
            {
              url: event.url,
              contentHash: event.contentHash,
              correctedAt: now.toISOString(),
              reason: 'Replaced fabricated seed source with verified publisher article',
            },
          ],
        },
      },
    });
  }

  const userInsightIds: string[] = [];

  for (const topic of topics) {
    const source = await prisma.source.upsert({
      where: { slug: topic.sourceSlug },
      update: {
        name: topic.sourceName,
        baseUrl: topic.sourceBaseUrl,
        lastSyncedAt: now,
        config: { sourceTier: topic.sourceTier, curated: true },
      },
      create: {
        name: topic.sourceName,
        slug: topic.sourceSlug,
        kind: SourceKind.WEB_SCRAPING,
        adapterKey: 'curated-web-article',
        baseUrl: topic.sourceBaseUrl,
        defaultIntervalSec: 900,
        rateLimitPerMinute: 30,
        lastSyncedAt: now,
        config: { sourceTier: topic.sourceTier, curated: true },
      },
    });
    const entity = await prisma.entity.upsert({
      where: { type_canonicalKey: { type: topic.type, canonicalKey: topic.entityKey } },
      update: { canonicalName: topic.name, normalizedName: topic.name.toLowerCase() },
      create: {
        type: topic.type,
        canonicalName: topic.name,
        normalizedName: topic.name.toLowerCase(),
        canonicalKey: topic.entityKey,
        aliases: [topic.name],
        metadata: { seeded: true },
      },
    });

    const interest = await prisma.interest.upsert({
      where: {
        userId_normalizedName: { userId: user.id, normalizedName: topic.name.toLowerCase() },
      },
      update: { status: 'ACTIVE', topicKey: topic.key },
      create: {
        userId: user.id,
        topicKey: topic.key,
        name: topic.name,
        normalizedName: topic.name.toLowerCase(),
        type: topic.type,
        description: `Theo dõi tin tức và cập nhật về ${topic.name}`,
        config: { notificationEnabled: true },
      },
    });

    await prisma.interestEntity.upsert({
      where: { interestId_entityId: { interestId: interest.id, entityId: entity.id } },
      update: { confidence: 1, isPrimary: true },
      create: { interestId: interest.id, entityId: entity.id, confidence: 1, isPrimary: true },
    });

    const event = await prisma.event.upsert({
      where: {
        sourceId_externalId: {
          sourceId: source.id,
          externalId: createHash('sha256').update(topic.url).digest('hex'),
        },
      },
      update: {
        title: topic.title,
        content: topic.content,
        summary: topic.summary,
        contentHash: createHash('sha256').update(topic.content).digest('hex'),
        url: topic.url,
        author: topic.sourceName,
        publishedAt: new Date(topic.publishedAt),
        processedAt: now,
        status: EventStatus.PROCESSED,
        metadata: {
          publisher: topic.sourceName,
          canonicalUrl: topic.url,
          sourceTier: topic.sourceTier,
          fetchedAt: now.toISOString(),
          verifiedAt: now.toISOString(),
          originalPublishedAt: topic.publishedAt,
          contentHash: createHash('sha256').update(topic.content).digest('hex'),
          curated: true,
          revisions: [],
        },
      },
      create: {
        sourceId: source.id,
        externalId: createHash('sha256').update(topic.url).digest('hex'),
        contentHash: createHash('sha256').update(topic.content).digest('hex'),
        type: 'NEWS',
        title: topic.title,
        content: topic.content,
        summary: topic.summary,
        url: topic.url,
        author: topic.sourceName,
        language: 'vi',
        publishedAt: new Date(topic.publishedAt),
        occurredAt: new Date(topic.publishedAt),
        status: EventStatus.PROCESSED,
        processedAt: now,
        metadata: {
          publisher: topic.sourceName,
          canonicalUrl: topic.url,
          sourceTier: topic.sourceTier,
          fetchedAt: now.toISOString(),
          verifiedAt: now.toISOString(),
          originalPublishedAt: topic.publishedAt,
          contentHash: createHash('sha256').update(topic.content).digest('hex'),
          curated: true,
          revisions: [],
        },
      },
    });

    await prisma.eventEntity.upsert({
      where: { eventId_entityId: { eventId: event.id, entityId: entity.id } },
      update: { relevanceScore: topic.importance, isPrimary: true },
      create: {
        eventId: event.id,
        entityId: entity.id,
        relevanceScore: topic.importance,
        isPrimary: true,
      },
    });

    const insight = await prisma.insight.upsert({
      where: { id: topic.insightId },
      update: {
        title: topic.title,
        content: topic.summary,
        importanceScore: topic.importance,
        generatedAt: now,
        modelProvider: 'curated-source',
        modelName: 'source-grounded',
        promptVersion: 'curation-v1',
        metadata: {
          publisher: topic.sourceName,
          canonicalUrl: topic.url,
          sourceTier: topic.sourceTier,
          curated: true,
        },
      },
      create: {
        id: topic.insightId,
        type: InsightType.SUMMARY,
        title: topic.title,
        content: topic.summary,
        language: 'vi',
        importanceScore: topic.importance,
        confidenceScore: 0.95,
        modelProvider: 'curated-source',
        modelName: 'source-grounded',
        promptVersion: 'curation-v1',
        generatedAt: now,
        metadata: {
          publisher: topic.sourceName,
          canonicalUrl: topic.url,
          sourceTier: topic.sourceTier,
          curated: true,
          date: dateKey,
        },
      },
    });

    await prisma.insightEvent.upsert({
      where: { insightId_eventId: { insightId: insight.id, eventId: event.id } },
      update: {},
      create: { insightId: insight.id, eventId: event.id },
    });
    await prisma.insightEvent.deleteMany({
      where: { insightId: insight.id, eventId: { not: event.id } },
    });
    await prisma.insightEntity.upsert({
      where: { insightId_entityId: { insightId: insight.id, entityId: entity.id } },
      update: { relevanceScore: topic.importance },
      create: { insightId: insight.id, entityId: entity.id, relevanceScore: topic.importance },
    });
    await prisma.insightLocalization.upsert({
      where: { insightId_locale: { insightId: insight.id, locale: 'vi' } },
      update: {
        title: topic.title,
        content: topic.summary,
        relevanceReason: `Bạn đang theo dõi ${topic.name}.`,
        suggestedAction: `Mở bài viết gốc từ ${topic.sourceName}`,
        provider: 'curated-translation',
      },
      create: {
        insightId: insight.id,
        locale: 'vi',
        title: topic.title,
        content: topic.summary,
        relevanceReason: `Bạn đang theo dõi ${topic.name}.`,
        suggestedAction: `Mở bài viết gốc từ ${topic.sourceName}`,
        provider: 'curated-translation',
      },
    });

    const userInsight = await prisma.userInsight.upsert({
      where: {
        userId_insightId_interestId: {
          userId: user.id,
          insightId: insight.id,
          interestId: interest.id,
        },
      },
      update: { status: UserInsightStatus.UNREAD, relevanceScore: topic.importance },
      create: {
        userId: user.id,
        insightId: insight.id,
        interestId: interest.id,
        status: UserInsightStatus.UNREAD,
        relevanceScore: topic.importance,
        matchedReason: { entity: topic.name, reason: 'primary_interest_match' },
      },
    });
    userInsightIds.push(userInsight.id);

    await prisma.notification.upsert({
      where: {
        userId_channel_deduplicationKey: {
          userId: user.id,
          channel: NotificationChannel.IN_APP,
          deduplicationKey: `seed:${dateKey}:${topic.key}`,
        },
      },
      update: {
        title: topic.title,
        body: topic.summary,
        metadata: { curated: true, sourceUrl: topic.url, publisher: topic.sourceName },
      },
      create: {
        userId: user.id,
        userInsightId: userInsight.id,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        title: topic.title,
        body: topic.summary,
        actionUrl: `/insights/${insight.id}`,
        deduplicationKey: `seed:${dateKey}:${topic.key}`,
        scheduledAt: now,
        sentAt: now,
        attemptCount: 1,
        metadata: { curated: true, sourceUrl: topic.url, publisher: topic.sourceName },
      },
    });
  }

  const brief = await prisma.dailyBrief.upsert({
    where: { userId_briefDate: { userId: user.id, briefDate } },
    update: {
      status: DailyBriefStatus.READY,
      title: `Nora Daily Brief · ${dateKey}`,
      summary: `3 cập nhật đáng chú ý hôm nay về OpenAI, Bitcoin và Apple.`,
      generatedAt: now,
      metadata: { curated: true, qualityGate: 'passed' },
    },
    create: {
      userId: user.id,
      briefDate,
      timezone: timeZone,
      status: DailyBriefStatus.READY,
      title: `Nora Daily Brief · ${dateKey}`,
      summary: `3 cập nhật đáng chú ý hôm nay về OpenAI, Bitcoin và Apple.`,
      generatedAt: now,
      metadata: { curated: true, qualityGate: 'passed' },
    },
  });

  for (const [index, topic] of topics.entries()) {
    await prisma.dailyBriefItem.upsert({
      where: { dailyBriefId_position: { dailyBriefId: brief.id, position: index + 1 } },
      update: {
        userInsightId: userInsightIds[index],
        title: topic.title,
        content: topic.summary,
        metadata: { curated: true, sourceUrl: topic.url, publisher: topic.sourceName },
      },
      create: {
        dailyBriefId: brief.id,
        userInsightId: userInsightIds[index],
        position: index + 1,
        section: index === 1 ? 'Thị trường' : 'Công nghệ',
        title: topic.title,
        content: topic.summary,
        metadata: { curated: true, sourceUrl: topic.url, publisher: topic.sourceName },
      },
    });
  }

  console.log(
    `Curated Nora data for ${user.email} on ${dateKey}: ${topics.length} verified interests and insights.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
