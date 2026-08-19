export interface TerminologySeedEntry {
  sourceLanguage: string;
  targetLocale: string;
  sourceTerm: string;
  preferredTerm: string;
  shortTerm?: string;
  protected: boolean;
  domain: string;
  version: string;
}

const entry = (
  sourceTerm: string,
  preferredTerm: string,
  domain: string,
  protectedTerm = false,
  shortTerm?: string,
): TerminologySeedEntry => ({
  sourceLanguage: 'en',
  targetLocale: 'vi',
  sourceTerm,
  preferredTerm,
  ...(shortTerm ? { shortTerm } : {}),
  protected: protectedTerm,
  domain,
  version: 'glossary-v1',
});

export const TERMINOLOGY_SEED_V1: readonly TerminologySeedEntry[] = [
  entry('breaking news', 'tin mới nhất', 'general-news'),
  entry('developing story', 'sự việc đang diễn biến', 'general-news'),
  entry('according to', 'theo', 'general-news'),
  entry('artificial intelligence', 'trí tuệ nhân tạo', 'technology', false, 'AI'),
  entry('large language model', 'mô hình ngôn ngữ lớn', 'technology', false, 'LLM'),
  entry(
    'application programming interface',
    'giao diện lập trình ứng dụng',
    'technology',
    false,
    'API',
  ),
  entry('OpenAI', 'OpenAI', 'organization-product', true),
  entry('ChatGPT', 'ChatGPT', 'organization-product', true),
  entry('GPT-5', 'GPT-5', 'organization-product', true),
  entry('iPhone', 'iPhone', 'organization-product', true),
  entry('Federal Reserve', 'Cục Dự trữ Liên bang Mỹ', 'economy-finance', false, 'Fed'),
  entry('interest rate', 'lãi suất', 'economy-finance'),
  entry('consumer price index', 'chỉ số giá tiêu dùng', 'economy-finance', false, 'CPI'),
  entry('gross domestic product', 'tổng sản phẩm quốc nội', 'economy-finance', false, 'GDP'),
  entry('basis point', 'điểm cơ bản', 'economy-finance'),
  entry('adverse event', 'biến cố bất lợi', 'health-safety'),
  entry('clinical trial', 'thử nghiệm lâm sàng', 'health-safety'),
  entry('public health emergency', 'tình trạng khẩn cấp y tế công cộng', 'health-safety'),
  entry('World Health Organization', 'Tổ chức Y tế Thế giới', 'health-safety', false, 'WHO'),
  entry('Apple', 'Apple', 'organization-product', true),
];
