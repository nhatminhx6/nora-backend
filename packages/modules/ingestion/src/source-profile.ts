import { ContentLanguage, Market } from '@nora/common';
import { ContentRetentionPolicy, SourceKind } from '@prisma/client';

export type SourceSelectionPolicy = 'ALL_ITEMS' | 'MATCH_TOPIC_TERMS';

export interface SourceProfile {
  readonly name: string;
  readonly slug: string;
  readonly feedUrl: string;
  readonly adapterKey: string;
  readonly kind: SourceKind;
  readonly language: ContentLanguage;
  readonly markets: readonly Market[];
  readonly topics: readonly string[];
  readonly sourceTier: 1 | 2 | 3;
  readonly authorityScore: number;
  readonly licensePolicy: ContentRetentionPolicy;
  readonly updateIntervalSec: number;
  readonly rateLimitPerMinute?: number;
  readonly verificationPolicy: string;
  readonly selectionPolicy: SourceSelectionPolicy;
  readonly enabled: boolean;
}
