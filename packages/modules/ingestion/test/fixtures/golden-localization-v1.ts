import { LocalizationBlockingError } from '../../src/localization-quality-v3.contract';
import { LocalizationQualityV3Input } from '../../src/localization-quality-v3.contract';

export type GoldenCategory =
  'technology-global' | 'economy-finance' | 'health' | 'vietnamese-source' | 'adversarial';

export interface GoldenLocalizationFixture {
  id: string;
  category: GoldenCategory;
  source: { title: string; content: string; language: 'en' | 'vi' };
  candidate: {
    title: string;
    summary: string;
    claims: Array<{ text: string; evidence: string[] }>;
    locale: 'en' | 'vi';
  };
  expectedPreservation: string[];
  acceptableTerms: string[];
  forbiddenTransformations: string[];
  expectedBlockingCodes: LocalizationBlockingError[];
  semanticMustReject: boolean;
}

const technologyOrganizations = ['OpenAI', 'Apple', 'Google', 'Microsoft', 'NVIDIA'];
const technologyProducts = ['GPT-5', 'iPhone 16 Pro', 'Android 16', 'Azure', 'CUDA'];
const economyOrganizations = ['Federal Reserve', 'World Bank', 'IMF', 'ECB', 'OECD'];
const economyValues = ['3.1%', '4.2%', '5.0%', '2.7%', '6.4%'];
const healthOrganizations = ['WHO', 'CDC', 'EMA'];
const healthValues = ['95%', '120', '14', '2.5%', '30'];

const technology: GoldenLocalizationFixture[] = technologyOrganizations.flatMap(
  (organization, row) =>
    technologyProducts.map((product, column) => {
      const sourceContent = `According to ${organization}, ${product} may increase processing capacity by 25%.`;
      return fixture({
        id: `tech-${row + 1}-${column + 1}`,
        category: 'technology-global',
        sourceTitle: `${organization} product update`,
        sourceContent,
        localizedTitle: `Cập nhật sản phẩm từ ${organization}`,
        localizedSummary: `Theo ${organization}, ${product} có thể tăng năng lực xử lý thêm 25%.`,
        localizedClaim: `${product} có thể tăng năng lực xử lý thêm 25%.`,
        preservation: [organization, product, '25%', 'may', 'increase'],
        acceptableTerms: ['năng lực xử lý', 'công suất xử lý'],
        forbidden: ['đổi 25% thành giá trị khác', 'đổi tăng thành giảm', 'khẳng định chắc chắn'],
      });
    }),
);

const economy: GoldenLocalizationFixture[] = economyOrganizations.flatMap((organization, row) =>
  economyValues.map((value, column) => {
    const sourceContent = `According to ${organization}, inflation may decrease to ${value} on 2026-08-14.`;
    return fixture({
      id: `economy-${row + 1}-${column + 1}`,
      category: 'economy-finance',
      sourceTitle: `${organization} inflation outlook`,
      sourceContent,
      localizedTitle: `Triển vọng lạm phát của ${organization}`,
      localizedSummary: `Theo ${organization}, lạm phát có thể giảm xuống ${value} vào 2026-08-14.`,
      localizedClaim: `Lạm phát có thể giảm xuống ${value}.`,
      preservation: [organization, value, '2026-08-14', 'may', 'decrease'],
      acceptableTerms: ['lạm phát', 'triển vọng'],
      forbidden: ['thêm lời khuyên đầu tư', 'đảo chiều giảm thành tăng', 'đổi ngày công bố'],
    });
  }),
);

const health: GoldenLocalizationFixture[] = healthOrganizations.flatMap((organization, row) =>
  healthValues.map((value, column) => {
    const sourceContent = `According to ${organization}, the study may include ${value} participants on 2026-09-01.`;
    return fixture({
      id: `health-${row + 1}-${column + 1}`,
      category: 'health',
      sourceTitle: `${organization} study update`,
      sourceContent,
      localizedTitle: `Cập nhật nghiên cứu từ ${organization}`,
      localizedSummary: `Theo ${organization}, nghiên cứu có thể gồm ${value} người tham gia vào 2026-09-01.`,
      localizedClaim: `Nghiên cứu có thể gồm ${value} người tham gia.`,
      preservation: [organization, value, '2026-09-01', 'may'],
      acceptableTerms: ['nghiên cứu', 'người tham gia'],
      forbidden: ['thêm hướng dẫn điều trị', 'đổi quy mô nghiên cứu', 'biến có thể thành xác nhận'],
    });
  }),
);

const vietnamesePublishers = ['VnExpress', 'Tuổi Trẻ', 'VietnamPlus'];
const vietnameseValues = ['3.1%', '4.0%', '5.2%', '6.3%', '7.4%'];
const vietnameseSource: GoldenLocalizationFixture[] = vietnamesePublishers.flatMap(
  (publisher, row) =>
    vietnameseValues.map((value, column) => {
      const sourceContent = `Theo ${publisher}, xuất khẩu có thể tăng ${value} vào 2026-10-01.`;
      return fixture({
        id: `vi-source-${row + 1}-${column + 1}`,
        category: 'vietnamese-source',
        sourceTitle: `Cập nhật xuất khẩu từ ${publisher}`,
        sourceContent,
        localizedTitle: `${publisher} export update`,
        localizedSummary: `According to ${publisher}, exports may increase ${value} on 2026-10-01.`,
        localizedClaim: `Exports may increase ${value}.`,
        sourceLanguage: 'vi',
        targetLocale: 'en',
        preservation: [publisher, value, '2026-10-01', 'có thể', 'tăng'],
        acceptableTerms: ['exports', 'export growth'],
        forbidden: ['đổi nguồn xuất bản', 'đảo tăng thành giảm', 'đổi phần trăm'],
      });
    }),
);

const adversarial: GoldenLocalizationFixture[] = Array.from({ length: 20 }, (_, index) => {
  const kind = (['number', 'polarity', 'date', 'entity', 'certainty', 'causality'] as const)[
    index % 6
  ]!;
  const sourceContent =
    'According to OpenAI, GPT-5 may increase throughput by 25% on 2026-08-14 because demand rose.';
  const base = {
    id: `adversarial-${String(index + 1).padStart(2, '0')}`,
    category: 'adversarial' as const,
    source: { title: 'OpenAI GPT-5 update', content: sourceContent, language: 'en' as const },
    expectedPreservation: ['OpenAI', 'GPT-5', '25%', '2026-08-14', 'may', 'increase', 'because'],
    acceptableTerms: ['thông lượng', 'năng lực xử lý'],
  };
  const variants = {
    number: {
      summary: 'Theo OpenAI, GPT-5 có thể tăng thông lượng 30% vào 2026-08-14 vì nhu cầu tăng.',
      codes: ['NUMBER_CHANGED'] as LocalizationBlockingError[],
      forbidden: '25% → 30%',
    },
    polarity: {
      summary: 'Theo OpenAI, GPT-5 có thể giảm thông lượng 25% vào 2026-08-14 vì nhu cầu tăng.',
      codes: ['DIRECTION_REVERSED'] as LocalizationBlockingError[],
      forbidden: 'increase → giảm',
    },
    date: {
      summary: 'Theo OpenAI, GPT-5 có thể tăng thông lượng 25% vào 2026-08-15 vì nhu cầu tăng.',
      codes: ['DATE_CHANGED'] as LocalizationBlockingError[],
      forbidden: '2026-08-14 → 2026-08-15',
    },
    entity: {
      summary: 'Theo Google, GPT-6 có thể tăng thông lượng 25% vào 2026-08-14 vì nhu cầu tăng.',
      codes: ['NUMBER_CHANGED', 'ENTITY_CORRUPTED'] as LocalizationBlockingError[],
      forbidden: 'OpenAI/GPT-5 → Google/GPT-6',
    },
    certainty: {
      summary: 'Theo OpenAI, GPT-5 xác nhận tăng thông lượng 25% vào 2026-08-14 vì nhu cầu tăng.',
      codes: ['CERTAINTY_CHANGED'] as LocalizationBlockingError[],
      forbidden: 'may → xác nhận',
    },
    causality: {
      summary: 'Theo OpenAI, GPT-5 có thể tăng thông lượng 25% vào 2026-08-14 mặc dù nhu cầu tăng.',
      codes: [] as LocalizationBlockingError[],
      forbidden: 'because → mặc dù',
    },
  }[kind];
  return {
    ...base,
    candidate: {
      title: kind === 'entity' ? 'Cập nhật GPT-6 từ Google' : 'Cập nhật GPT-5 từ OpenAI',
      summary: variants.summary,
      claims: [{ text: variants.summary, evidence: [sourceContent] }],
      locale: 'vi',
    },
    forbiddenTransformations: [variants.forbidden],
    expectedBlockingCodes: variants.codes,
    semanticMustReject: kind === 'causality',
  };
});

export const GOLDEN_LOCALIZATION_DATASET_V1: GoldenLocalizationFixture[] = [
  ...technology,
  ...economy,
  ...health,
  ...vietnameseSource,
  ...adversarial,
];

export function qualityInput(fixtureValue: GoldenLocalizationFixture): LocalizationQualityV3Input {
  return {
    sourceTitle: fixtureValue.source.title,
    sourceContent: fixtureValue.source.content,
    localizedTitle: fixtureValue.candidate.title,
    localizedSummary: fixtureValue.candidate.summary,
    localizedClaims: fixtureValue.candidate.claims,
    sourceLanguage: fixtureValue.source.language,
    targetLocale: fixtureValue.candidate.locale,
    glossary: [],
  };
}

function fixture(input: {
  id: string;
  category: Exclude<GoldenCategory, 'adversarial'>;
  sourceTitle: string;
  sourceContent: string;
  localizedTitle: string;
  localizedSummary: string;
  localizedClaim: string;
  sourceLanguage?: 'en' | 'vi';
  targetLocale?: 'en' | 'vi';
  preservation: string[];
  acceptableTerms: string[];
  forbidden: string[];
}): GoldenLocalizationFixture {
  return {
    id: input.id,
    category: input.category,
    source: {
      title: input.sourceTitle,
      content: input.sourceContent,
      language: input.sourceLanguage ?? 'en',
    },
    candidate: {
      title: input.localizedTitle,
      summary: input.localizedSummary,
      claims: [{ text: input.localizedClaim, evidence: [input.sourceContent] }],
      locale: input.targetLocale ?? 'vi',
    },
    expectedPreservation: input.preservation,
    acceptableTerms: input.acceptableTerms,
    forbiddenTransformations: input.forbidden,
    expectedBlockingCodes: [],
    semanticMustReject: false,
  };
}
