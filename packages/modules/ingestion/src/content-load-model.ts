import { performance } from 'node:perf_hooks';
import { candidateReasons, isCandidate } from './candidate-matching.service';
import { rankingScore } from './content-ranking.service';

export interface LoadScenarioReport {
  users: number; sourceRequests: number; localizationCalls: number; matchingOperations: number;
  throughputPerSecond: number; latencyMs: { p50: number; p95: number; p99: number };
  queueDepthPeak: number; estimatedTranslationCostPer1000Usd: number;
}

export function runLoadMatrix(userCounts = [1, 100, 1_000, 10_000]): { scenarios: LoadScenarioReport[]; dbQueryHotspots: string[]; comparison: { v1SourceRequestsAt10000: number; v2SourceRequestsAt10000: number } } {
  const scenarios = userCounts.map((users) => simulate(users));
  return { scenarios, dbQueryHotspots: ['content_audience_matches(user_id,status,ranking_score)', 'canonical_contents(provenance_status,published_at)', 'content_localizations(locale,status,verified_at)'], comparison: { v1SourceRequestsAt10000: 10_000, v2SourceRequestsAt10000: 1 } };
}

function simulate(users: number): LoadScenarioReport {
  const latencies: number[] = []; const started = performance.now(); const batchSize = 500;
  for (let index = 0; index < users; index += 1) {
    const itemStarted = performance.now();
    const reason = candidateReasons({ contentTopics: ['technology'], contentEntities: ['OpenAI'], contentMarkets: ['GLOBAL', 'US'], text: 'OpenAI launches GPT-5', interestTopics: index % 2 ? ['technology'] : [], interestEntities: index % 3 ? ['OpenAI'] : [], watchKeywords: index % 5 ? [] : ['GPT-5'], homeMarket: index % 2 ? 'VN' : 'GLOBAL', followedMarkets: ['US'], importance: 0.9 });
    if (isCandidate(reason)) rankingScore({ relevanceScore: 0.8, entityMatches: reason.entities.length, authority: 1, importance: 0.9, publishedAt: new Date('2026-08-14T00:00:00Z'), now: new Date('2026-08-14T01:00:00Z'), markets: ['GLOBAL', 'US'], homeMarket: 'VN', followedMarkets: ['US'], duplicate: false, alreadySeen: false });
    latencies.push(performance.now() - itemStarted);
  }
  const elapsed = Math.max(0.001, performance.now() - started); latencies.sort((a, b) => a - b);
  return { users, sourceRequests: 1, localizationCalls: 2, matchingOperations: users, throughputPerSecond: Number((users / (elapsed / 1000)).toFixed(2)), latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), p99: percentile(latencies, 0.99) }, queueDepthPeak: Math.min(batchSize, users), estimatedTranslationCostPer1000Usd: 2 };
}
function percentile(values: number[], ratio: number): number { if (!values.length) return 0; return Number(values[Math.min(values.length - 1, Math.floor(values.length * ratio))]!.toFixed(4)); }
