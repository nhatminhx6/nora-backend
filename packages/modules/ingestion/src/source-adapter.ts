export interface SourceFetchInput {
  url: string;
}

export interface NormalizedSourceItem {
  externalId: string;
  title: string;
  content: string;
  canonicalUrl: string;
  publishedAt: Date;
  publisher: string;
  language: 'vi' | 'en';
  metadata: Record<string, string>;
}

export interface SourceValidationResult {
  valid: boolean;
  errors: string[];
  canonicalUrl?: string;
  verifiedAt?: Date;
}

export interface SourceAdapter<TPayload> {
  readonly key: string;
  fetch(input: SourceFetchInput): Promise<TPayload[]>;
  normalize(payload: TPayload): NormalizedSourceItem | null;
  validate(item: NormalizedSourceItem): Promise<SourceValidationResult>;
}
