import { ContentLanguage, Market } from '@nora/common';

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

export interface FetchInputV2 {
  sourceId: string;
  subscriptionId?: string;
  url: string;
  sourceLanguage?: ContentLanguage;
  topicHints?: readonly string[];
  marketHints?: readonly Market[];
}

export interface RawPayloadEnvelope {
  rawPayloadId?: string;
  sourceId: string;
  subscriptionId?: string;
  requestUrl: string;
  finalUrl: string;
  httpStatus: number;
  contentType?: string;
  fetchedAt: Date;
  body: Uint8Array;
  payloadHash: string;
  sourceLanguage?: ContentLanguage;
  topicHints: readonly string[];
  marketHints: readonly Market[];
}

export interface RawEvidenceReference {
  rawPayloadId?: string;
  payloadHash: string;
  path: string;
}

export interface CanonicalCandidate {
  sourceId: string;
  canonicalUrlCandidate: string;
  externalId: string;
  originalTitle: string;
  originalContent: string;
  originalExcerpt: string;
  sourceLanguageCandidate: ContentLanguage;
  publishedAtCandidate: Date;
  sourceUpdatedAtCandidate?: Date;
  publisher: string;
  author?: string;
  topicHints: readonly string[];
  marketHints: readonly Market[];
  rawEvidence: readonly RawEvidenceReference[];
  fetchedAt: Date;
}

export interface ProvenanceResult {
  valid: boolean;
  errors: readonly string[];
  canonicalUrl?: string;
  verifiedAt?: Date;
}

export interface SourceAdapterV2 {
  readonly key: string;
  fetch(input: FetchInputV2): Promise<RawPayloadEnvelope[]>;
  normalize(input: RawPayloadEnvelope): Promise<CanonicalCandidate[]>;
  validate(input: CanonicalCandidate): Promise<ProvenanceResult>;
}
