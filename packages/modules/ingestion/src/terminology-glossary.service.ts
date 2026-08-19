import { Injectable } from '@nestjs/common';
import { TerminologyEntry } from '@prisma/client';
import { isKnownLocale } from '@nora/common';
import { PrismaService } from '@nora/database';
import { TERMINOLOGY_SEED_V1, TerminologySeedEntry } from './terminology-seed';

export interface ResolvedTerminology {
  sourceTerm: string;
  preferredTerm: string;
  shortTerm?: string;
  protected: boolean;
  domain: string;
  version: string;
}

@Injectable()
export class TerminologyGlossaryService {
  constructor(private readonly prisma: PrismaService) {}

  async seedV1() {
    return this.importEntries(TERMINOLOGY_SEED_V1);
  }

  async importJson(json: string) {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new Error('GLOSSARY_JSON_INVALID');
    }
    if (!Array.isArray(value)) throw new Error('GLOSSARY_JSON_INVALID');
    return this.importEntries(value.map(validateEntry));
  }

  async importEntries(entries: readonly TerminologySeedEntry[]) {
    const selected = deterministicEntries(entries.map(validateEntry));
    for (const item of selected.entries) {
      const normalizedSourceTerm = normalizeTerminologyTerm(item.sourceTerm);
      await this.prisma.terminologyEntry.upsert({
        where: {
          sourceLanguage_targetLocale_normalizedSourceTerm_domain_version: {
            sourceLanguage: item.sourceLanguage,
            targetLocale: item.targetLocale,
            normalizedSourceTerm,
            domain: item.domain,
            version: item.version,
          },
        },
        update: {
          sourceTerm: item.sourceTerm,
          preferredTerm: item.preferredTerm,
          shortTerm: item.shortTerm,
          protected: item.protected,
        },
        create: { ...item, normalizedSourceTerm },
      });
    }
    return { imported: selected.entries.length, conflicts: selected.conflicts };
  }

  async exportJson(filter: { targetLocale?: string; version?: string } = {}): Promise<string> {
    const entries = await this.prisma.terminologyEntry.findMany({
      where: filter,
      orderBy: [
        { sourceLanguage: 'asc' },
        { targetLocale: 'asc' },
        { domain: 'asc' },
        { normalizedSourceTerm: 'asc' },
        { version: 'asc' },
      ],
    });
    return JSON.stringify(entries.map(exportEntry), null, 2);
  }

  async resolve(
    sourceTerm: string,
    input: {
      sourceLanguage: string;
      targetLocale: string;
      domains: readonly string[];
      version: string;
    },
  ): Promise<ResolvedTerminology | null> {
    const candidates = await this.prisma.terminologyEntry.findMany({
      where: {
        sourceLanguage: input.sourceLanguage,
        targetLocale: input.targetLocale,
        normalizedSourceTerm: normalizeTerminologyTerm(sourceTerm),
        version: input.version,
        domain: { in: [...new Set([...input.domains, 'general-news'])] },
      },
    });
    const domainPriority = new Map(input.domains.map((domain, index) => [domain, index]));
    const winner = candidates.sort((left, right) => {
      const leftDomain = domainPriority.get(left.domain) ?? 10_000;
      const rightDomain = domainPriority.get(right.domain) ?? 10_000;
      return (
        leftDomain - rightDomain ||
        Number(right.protected) - Number(left.protected) ||
        left.preferredTerm.localeCompare(right.preferredTerm, 'vi') ||
        left.id.localeCompare(right.id)
      );
    })[0];
    return winner ? resolvedEntry(winner) : null;
  }
}

export function normalizeTerminologyTerm(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
}

export function deterministicEntries(entries: readonly TerminologySeedEntry[]): {
  entries: TerminologySeedEntry[];
  conflicts: number;
} {
  const groups = new Map<string, TerminologySeedEntry[]>();
  for (const item of entries) {
    const key = [
      item.sourceLanguage,
      item.targetLocale,
      normalizeTerminologyTerm(item.sourceTerm),
      item.domain,
      item.version,
    ].join('|');
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  let conflicts = 0;
  const selected = [...groups.values()].map((group) => {
    if (group.length > 1) conflicts += group.length - 1;
    return group.sort(
      (left, right) =>
        Number(right.protected) - Number(left.protected) ||
        left.preferredTerm.localeCompare(right.preferredTerm, 'vi') ||
        (left.shortTerm ?? '').localeCompare(right.shortTerm ?? '', 'vi'),
    )[0]!;
  });
  return {
    entries: selected.sort((left, right) =>
      [
        left.sourceLanguage,
        left.targetLocale,
        left.domain,
        normalizeTerminologyTerm(left.sourceTerm),
        left.version,
      ]
        .join('|')
        .localeCompare(
          [
            right.sourceLanguage,
            right.targetLocale,
            right.domain,
            normalizeTerminologyTerm(right.sourceTerm),
            right.version,
          ].join('|'),
        ),
    ),
    conflicts,
  };
}

function validateEntry(value: unknown): TerminologySeedEntry {
  if (!record(value)) throw new Error('GLOSSARY_ENTRY_INVALID');
  const sourceLanguage = requiredString(value, 'sourceLanguage');
  const targetLocale = requiredString(value, 'targetLocale');
  const sourceTerm = requiredString(value, 'sourceTerm');
  const preferredTerm = requiredString(value, 'preferredTerm');
  const domain = requiredString(value, 'domain');
  const version = requiredString(value, 'version');
  if (!isKnownLocale(sourceLanguage) || !isKnownLocale(targetLocale))
    throw new Error('GLOSSARY_LOCALE_INVALID');
  if (typeof value.protected !== 'boolean') throw new Error('GLOSSARY_ENTRY_INVALID');
  return {
    sourceLanguage,
    targetLocale,
    sourceTerm,
    preferredTerm,
    ...(typeof value.shortTerm === 'string' && value.shortTerm.trim()
      ? { shortTerm: value.shortTerm.trim() }
      : {}),
    protected: value.protected,
    domain,
    version,
  };
}

function exportEntry(item: TerminologyEntry): TerminologySeedEntry {
  return {
    sourceLanguage: item.sourceLanguage,
    targetLocale: item.targetLocale,
    sourceTerm: item.sourceTerm,
    preferredTerm: item.preferredTerm,
    ...(item.shortTerm ? { shortTerm: item.shortTerm } : {}),
    protected: item.protected,
    domain: item.domain,
    version: item.version,
  };
}

function resolvedEntry(item: TerminologyEntry): ResolvedTerminology {
  return {
    sourceTerm: item.sourceTerm,
    preferredTerm: item.preferredTerm,
    ...(item.shortTerm ? { shortTerm: item.shortTerm } : {}),
    protected: item.protected,
    domain: item.domain,
    version: item.version,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const item = value[field];
  if (typeof item !== 'string' || !item.trim()) throw new Error('GLOSSARY_ENTRY_INVALID');
  return item.trim();
}
