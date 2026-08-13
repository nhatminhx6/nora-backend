import { createHash } from 'node:crypto';
import {
  DailyBriefStatus,
  EntityType,
  EventStatus,
  FinanceTransactionType,
  InsightType,
  NotificationChannel,
  NotificationStatus,
  PrismaClient,
  SourceKind,
  UserInsightStatus,
  WorkItemPriority,
  WorkItemSource,
  WorkItemStatus,
} from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_USER = {
  email: 'minhmera@gmail.com',
  password: '12345678',
  displayName: 'Minh Mera',
};

const workItems = [
  {
    ref: 'seed-review-openai-update',
    title: 'Đọc cập nhật OpenAI và ghi chú ảnh hưởng tới Nora',
    notes: 'Tóm tắt các thay đổi có thể áp dụng cho ingestion và trải nghiệm assistant.',
    status: WorkItemStatus.TODO,
    priority: WorkItemPriority.HIGH,
    dueInDays: 1,
  },
  {
    ref: 'seed-check-bitcoin-alert',
    title: 'Kiểm tra điều kiện cảnh báo Bitcoin',
    notes: 'Rà lại ngưỡng biến động và nội dung notification trước khi bật alert.',
    status: WorkItemStatus.IN_PROGRESS,
    priority: WorkItemPriority.URGENT,
    dueInDays: 0,
  },
  {
    ref: 'seed-plan-mobile-release',
    title: 'Chuẩn bị checklist release ứng dụng mobile',
    notes: 'Bao gồm API contract, migration, smoke test và release notes.',
    status: WorkItemStatus.TODO,
    priority: WorkItemPriority.MEDIUM,
    dueInDays: 3,
  },
  {
    ref: 'seed-review-daily-brief',
    title: 'Review nội dung Daily Brief hôm nay',
    notes: 'Kiểm tra source, localization và thứ tự ưu tiên của insight.',
    status: WorkItemStatus.DONE,
    priority: WorkItemPriority.MEDIUM,
    dueInDays: -1,
  },
] as const;

const financeCategories = [
  ['food', 'Ăn uống', 'fork.knife', FinanceTransactionType.EXPENSE],
  ['transport', 'Di chuyển', 'car.fill', FinanceTransactionType.EXPENSE],
  ['shopping', 'Mua sắm', 'bag.fill', FinanceTransactionType.EXPENSE],
  ['home', 'Nhà cửa', 'house.fill', FinanceTransactionType.EXPENSE],
  ['health', 'Sức khỏe', 'cross.case.fill', FinanceTransactionType.EXPENSE],
  ['entertainment', 'Giải trí', 'gamecontroller.fill', FinanceTransactionType.EXPENSE],
  ['education', 'Giáo dục', 'book.fill', FinanceTransactionType.EXPENSE],
  ['salary', 'Lương', 'banknote.fill', FinanceTransactionType.INCOME],
  ['bonus', 'Thưởng', 'gift.fill', FinanceTransactionType.INCOME],
  ['investment', 'Đầu tư', 'chart.line.uptrend.xyaxis', FinanceTransactionType.INCOME],
  ['other-expense', 'Khác', 'ellipsis.circle.fill', FinanceTransactionType.EXPENSE],
  ['other-income', 'Thu nhập khác', 'plus.circle.fill', FinanceTransactionType.INCOME],
] as const;

const financeSeedItems = [
  ['salary', FinanceTransactionType.INCOME, 35000000, 'Lương tháng'],
  ['bonus', FinanceTransactionType.INCOME, 4500000, 'Thưởng dự án'],
  ['food', FinanceTransactionType.EXPENSE, 85000, 'Ăn trưa'],
  ['food', FinanceTransactionType.EXPENSE, 42000, 'Cà phê'],
  ['transport', FinanceTransactionType.EXPENSE, 120000, 'Đổ xăng'],
  ['shopping', FinanceTransactionType.EXPENSE, 1290000, 'Mua đồ gia dụng'],
  ['home', FinanceTransactionType.EXPENSE, 3200000, 'Tiền điện nước'],
  ['health', FinanceTransactionType.EXPENSE, 650000, 'Khám sức khỏe'],
  ['entertainment', FinanceTransactionType.EXPENSE, 179000, 'Đăng ký xem phim'],
  ['education', FinanceTransactionType.EXPENSE, 499000, 'Mua sách'],
] as const;

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

const extraFeedTitles = [
  'OpenAI cập nhật bộ công cụ phát triển agent',
  'Codex bổ sung cải tiến cho quy trình review code',
  'Apple công bố thay đổi mới cho hệ sinh thái ứng dụng',
  'Thị trường AI tiếp tục thu hút dòng vốn đầu tư',
  'Bitcoin biến động sau phiên giao dịch tại Mỹ',
  'Các mô hình ngôn ngữ nhỏ ngày càng hiệu quả hơn',
  'Xu hướng tích hợp AI vào ứng dụng mobile tăng nhanh',
  'Doanh nghiệp đẩy mạnh tự động hóa quy trình nội bộ',
  'Công cụ lập trình bằng AI cải thiện khả năng kiểm thử',
  'Bảo mật dữ liệu trở thành ưu tiên của sản phẩm AI',
  'Nền tảng cloud tối ưu hạ tầng cho workload AI',
  'Các framework frontend tập trung nhiều hơn vào hiệu năng',
  'SwiftUI tiếp tục hoàn thiện trải nghiệm đa nền tảng',
  'React cải thiện công cụ hỗ trợ phát triển ứng dụng',
  'Thị trường crypto ghi nhận thanh khoản tăng trở lại',
  'Nhà phát triển quan tâm hơn đến AI chạy trên thiết bị',
  'Thiết kế sản phẩm chuyển hướng sang trải nghiệm chủ động',
  'Agent AI bắt đầu đảm nhận các workflow nhiều bước',
  'Các đội ngũ ưu tiên observability cho hệ thống phân tán',
  'API-first tiếp tục là lựa chọn phổ biến cho sản phẩm mới',
  'Ứng dụng cá nhân hóa tận dụng ngữ cảnh người dùng tốt hơn',
  'Công nghệ tìm kiếm kết hợp semantic và dữ liệu thời gian thực',
  'Các sản phẩm fintech tăng cường lớp kiểm soát rủi ro',
  'Trợ lý số mở rộng khả năng quản lý công việc hằng ngày',
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
        update: {
          passwordHash: await hash(DEMO_USER.password, 12),
          displayName: DEMO_USER.displayName,
          timezone: timeZone,
          locale: 'vi',
          status: 'ACTIVE',
          deletedAt: null,
        },
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
      update: {
        status: 'ACTIVE',
        topicKey: topic.key,
        config: { notificationEnabled: true, category: 'other' },
      },
      create: {
        userId: user.id,
        topicKey: topic.key,
        name: topic.name,
        normalizedName: topic.name.toLowerCase(),
        type: topic.type,
        description: `Theo dõi tin tức và cập nhật về ${topic.name}`,
        config: { notificationEnabled: true, category: 'other' },
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

    await prisma.insightEvent.createMany({
      data: [{ insightId: insight.id, eventId: event.id }],
      skipDuplicates: true,
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

  const extraSource = await prisma.source.upsert({
    where: { slug: 'nora-seed-feed' },
    update: { name: 'Nora Curated Feed', lastSyncedAt: now },
    create: {
      name: 'Nora Curated Feed',
      slug: 'nora-seed-feed',
      kind: SourceKind.WEB_SCRAPING,
      adapterKey: 'development-feed-seed',
      baseUrl: 'https://openai.com/news/',
      defaultIntervalSec: 900,
      lastSyncedAt: now,
      config: { developmentSeed: true },
    },
  });
  const seededInterests = await prisma.interest.findMany({
    where: { userId: user.id, topicKey: { in: topics.map((topic) => topic.key) } },
  });

  for (const [index, title] of extraFeedTitles.entries()) {
    const sequence = index + 1;
    const interest = seededInterests[index % seededInterests.length]!;
    const isImportant = index < 12;
    const importance = isImportant ? 0.82 + (index % 3) * 0.03 : 0.48 + (index % 4) * 0.03;
    const content = isImportant
      ? `${title}. Đây là cập nhật có mức ưu tiên cao và nên được xem sớm để đánh giá ảnh hưởng tới các chủ đề anh đang theo dõi.`
      : `${title}. Nora lưu lại cập nhật này để anh có thể đọc thêm khi thuận tiện.`;
    const url = `https://openai.com/news/?nora-seed=${sequence}`;
    const publishedAt = new Date(now.getTime() - sequence * 30 * 60_000);
    const event = await prisma.event.upsert({
      where: { url },
      update: {
        title,
        content,
        summary: content,
        publishedAt,
        status: EventStatus.PROCESSED,
      },
      create: {
        sourceId: extraSource.id,
        externalId: createHash('sha256').update(url).digest('hex'),
        contentHash: createHash('sha256').update(content).digest('hex'),
        type: 'NEWS',
        title,
        content,
        summary: content,
        url,
        author: 'Nora Curated Feed',
        language: 'vi',
        publishedAt,
        occurredAt: publishedAt,
        status: EventStatus.PROCESSED,
        processedAt: now,
        metadata: {
          sourceName: 'Nora Curated Feed',
          developmentSeed: true,
          sequence,
        },
      },
    });
    const insightId = `10000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
    const insight = await prisma.insight.upsert({
      where: { id: insightId },
      update: {
        type: isImportant ? InsightType.ALERT : InsightType.SUMMARY,
        title,
        content,
        importanceScore: importance,
        generatedAt: publishedAt,
      },
      create: {
        id: insightId,
        type: isImportant ? InsightType.ALERT : InsightType.SUMMARY,
        title,
        content,
        language: 'vi',
        importanceScore: importance,
        confidenceScore: 0.92,
        modelProvider: 'development-seed',
        modelName: 'feed-seed-v1',
        promptVersion: 'seed-v1',
        generatedAt: publishedAt,
        metadata: {
          suggestedAction: isImportant ? 'Xem cập nhật' : 'Đọc thêm',
          developmentSeed: true,
        },
      },
    });
    await prisma.insightEvent.createMany({
      data: [{ insightId: insight.id, eventId: event.id }],
      skipDuplicates: true,
    });
    await prisma.insightLocalization.upsert({
      where: { insightId_locale: { insightId: insight.id, locale: 'vi' } },
      update: {
        title,
        content,
        relevanceReason: `Cập nhật này liên quan đến chủ đề ${interest.name}.`,
        suggestedAction: isImportant ? 'Xem cập nhật' : 'Đọc thêm',
      },
      create: {
        insightId: insight.id,
        locale: 'vi',
        title,
        content,
        relevanceReason: `Cập nhật này liên quan đến chủ đề ${interest.name}.`,
        suggestedAction: isImportant ? 'Xem cập nhật' : 'Đọc thêm',
        provider: 'development-seed',
        validationStatus: 'PASSED',
        qualityScore: 0.95,
        generatedAt: publishedAt,
        metadata: { developmentSeed: true },
      },
    });
    await prisma.userInsight.upsert({
      where: {
        userId_insightId_interestId: {
          userId: user.id,
          insightId: insight.id,
          interestId: interest.id,
        },
      },
      update: {
        status: UserInsightStatus.UNREAD,
        relevanceScore: importance,
        createdAt: publishedAt,
      },
      create: {
        userId: user.id,
        insightId: insight.id,
        interestId: interest.id,
        status: UserInsightStatus.UNREAD,
        relevanceScore: importance,
        matchedReason: { reason: `Liên quan đến chủ đề ${interest.name}.` },
        createdAt: publishedAt,
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

  for (const item of workItems) {
    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + item.dueInDays);
    await prisma.workItem.upsert({
      where: {
        userId_source_sourceRef: {
          userId: user.id,
          source: WorkItemSource.EXTRACTED,
          sourceRef: item.ref,
        },
      },
      update: {
        title: item.title,
        notes: item.notes,
        status: item.status,
        priority: item.priority,
        dueAt,
        completedAt: item.status === WorkItemStatus.DONE ? now : null,
      },
      create: {
        userId: user.id,
        title: item.title,
        notes: item.notes,
        status: item.status,
        priority: item.priority,
        dueAt,
        completedAt: item.status === WorkItemStatus.DONE ? now : null,
        source: WorkItemSource.EXTRACTED,
        sourceRef: item.ref,
        metadata: { seeded: true },
      },
    });
  }

  const categoryIds = new Map<string, string>();
  for (const [index, category] of financeCategories.entries()) {
    const [slug, name, symbolName, type] = category;
    const saved = await prisma.financeCategory.upsert({
      where: { userId_slug: { userId: user.id, slug } },
      update: { name, symbolName, type, sortOrder: index, isArchived: false },
      create: { userId: user.id, slug, name, symbolName, type, sortOrder: index },
    });
    categoryIds.set(slug, saved.id);
  }

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  await prisma.financeMonthlyBudget.upsert({
    where: { userId_month_currency: { userId: user.id, month: monthStart, currency: 'VND' } },
    update: { amount: 12000000 },
    create: { userId: user.id, month: monthStart, amount: 12000000, currency: 'VND' },
  });
  await prisma.financeTransaction.deleteMany({ where: { userId: user.id, notes: { startsWith: 'seed-finance-' } } });
  for (let index = 0; index < 36; index += 1) {
    const item = financeSeedItems[index % financeSeedItems.length]!;
    const [categorySlug, type, baseAmount, title] = item;
    const occurredAt = new Date(now);
    occurredAt.setUTCDate(Math.max(1, now.getUTCDate() - index));
    await prisma.financeTransaction.create({ data: {
      userId: user.id, categoryId: categoryIds.get(categorySlug)!, type,
      amount: baseAmount + (index % 4) * 10000, title,
      notes: `seed-finance-${index + 1}`, occurredAt,
    } });
  }

  const economicIndicators = [
    { key: 'gold-sjc', vi: 'Vàng SJC', en: 'SJC Gold', category: 'COMMODITY', unit: 'triệu đồng/lượng', frequency: 'DAILY', source: 'SJC', url: 'https://sjc.com.vn/', symbol: 'circle.hexagongrid.fill', base: 124.6, step: 0.22 },
    { key: 'usd-vnd', vi: 'Tỷ giá USD/VND', en: 'USD/VND Exchange Rate', category: 'CURRENCY', unit: 'VND', frequency: 'DAILY', source: 'Ngân hàng Nhà nước Việt Nam', url: 'https://www.sbv.gov.vn/', symbol: 'dollarsign.arrow.circlepath', base: 26180, step: 7.5 },
    { key: 'vn-index', vi: 'VN-Index', en: 'VN-Index', category: 'MARKET', unit: 'điểm', frequency: 'DAILY', source: 'HOSE', url: 'https://www.hsx.vn/', symbol: 'chart.line.uptrend.xyaxis', base: 1518, step: 1.35 },
    { key: 'cpi-vietnam', vi: 'Lạm phát CPI', en: 'Vietnam CPI Inflation', category: 'MACRO', unit: '% YoY', frequency: 'MONTHLY', source: 'Cục Thống kê', url: 'https://www.gso.gov.vn/', symbol: 'chart.bar.xaxis', base: 3.42, step: 0.015 },
    { key: 'policy-rate', vi: 'Lãi suất điều hành', en: 'Policy Rate', category: 'MACRO', unit: '%', frequency: 'MONTHLY', source: 'Ngân hàng Nhà nước Việt Nam', url: 'https://www.sbv.gov.vn/', symbol: 'percent', base: 4.5, step: 0 },
  ];
  for (const [sortOrder, definition] of economicIndicators.entries()) {
    const indicator = await prisma.economicIndicator.upsert({ where: { key: definition.key }, update: { nameVi: definition.vi, nameEn: definition.en, category: definition.category, unit: definition.unit, frequency: definition.frequency, sourceName: definition.source, sourceUrl: definition.url, symbolName: definition.symbol, sortOrder }, create: { key: definition.key, nameVi: definition.vi, nameEn: definition.en, category: definition.category, unit: definition.unit, frequency: definition.frequency, sourceName: definition.source, sourceUrl: definition.url, symbolName: definition.symbol, sortOrder } });
    for (let offset = 89; offset >= 0; offset -= 1) {
      const observedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
      const wave = Math.sin((89 - offset) / 6) * definition.step * 3;
      const value = definition.base + (89 - offset) * definition.step + wave;
      const previous = definition.base + Math.max(0, 88 - offset) * definition.step;
      await prisma.economicIndicatorObservation.upsert({ where: { indicatorId_observedAt: { indicatorId: indicator.id, observedAt } }, update: { value, changeValue: value - previous, changePct: previous === 0 ? 0 : ((value - previous) / previous) * 100 }, create: { indicatorId: indicator.id, observedAt, value, changeValue: value - previous, changePct: previous === 0 ? 0 : ((value - previous) / previous) * 100, metadata: { seeded: true } } });
    }
  }

  console.log(
    `Curated Nora data for ${user.email} on ${dateKey}: ${topics.length + extraFeedTitles.length} feed insights, ${workItems.length} work items, 36 finance transactions.`,
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
