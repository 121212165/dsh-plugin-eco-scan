/** Multi-label segmentation. Rules score every repo on keywords, topics and
 * name patterns; a repo keeps up to N labels with a saturating confidence
 * (1 - e^-score). Manual overrides win outright and are recorded with a
 * reason. Rule files hot-reload by (mtime,size) before each scan. */
import { readFileSync, statSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { DEFAULT_RULES_YAML } from './defaults.ts';
import type { SegmentLabel } from './types.ts';
import { clamp, isRecord } from './util.ts';

export interface SegmentRule {
  id: string;
  label: string;
  weight: number;
  keywords: string[];
  topics: string[];
  namePatterns: string[];
}

export interface SegmentInput {
  id: string;
  description: string;
  topics: string[];
}

interface CompiledRule extends SegmentRule {
  keywordMatchers: { latin: RegExp | null; raw: string }[];
  patternMatchers: RegExp[];
}

export class SegmentBook {
  private rules: SegmentRule[] = [];
  private compiled: CompiledRule[] = [];
  private signature = '';
  private readonly filePath: string | null;
  private readonly maxLabels: number;

  constructor(options: { filePath?: string | null; text?: string; maxLabels?: number } = {}) {
    this.filePath = options.filePath ?? null;
    this.maxLabels = Math.max(1, options.maxLabels ?? 3);
    const fromFile = this.filePath ? readIfPresent(this.filePath) : null;
    this.load(options.text ?? fromFile ?? DEFAULT_RULES_YAML);
  }

  get ruleCount(): number {
    return this.rules.length;
  }

  labels(): Map<string, string> {
    return new Map(this.rules.map((rule) => [rule.id, rule.label]));
  }

  /** Re-reads the rules file when it changed. Returns true when reloaded. */
  maybeReload(): boolean {
    if (!this.filePath) return false;
    const stat = statSync(this.filePath, { throwIfNoEntry: false });
    if (!stat) return false;
    const next = `${stat.mtimeMs}:${stat.size}`;
    if (next === this.signature) return false;
    try {
      this.load(readFileSync(this.filePath, 'utf8'));
      return true;
    } catch {
      // A broken edit must not take the scanner down: keep the last good rules.
      return false;
    }
  }

  load(text: string): void {
    const document: unknown = parseYaml(text);
    const raw = isRecord(document) && Array.isArray(document.segments) ? document.segments : Array.isArray(document) ? document : [];
    this.rules = raw.map(parseRule).filter((rule): rule is SegmentRule => rule !== null);
    this.compiled = this.rules.map(compileRule);
    this.signature = this.filePath ? signatureOf(this.filePath) : '';
  }

  classify(repo: SegmentInput): SegmentLabel[] {
    const haystack = `${repo.id.replace(/[/-]/g, ' ')} ${repo.description}`.toLowerCase();
    const scored: { segment: string; score: number }[] = [];
    for (const rule of this.compiled) {
      let score = 0;
      for (const matcher of rule.keywordMatchers) {
        if (matcher.latin ? matcher.latin.test(haystack) : haystack.includes(matcher.raw)) score += 1;
      }
      const topics = new Set(repo.topics.map((topic) => topic.toLowerCase()));
      for (const topic of rule.topics) if (topics.has(topic.toLowerCase())) score += 1.5;
      for (const pattern of rule.patternMatchers) if (pattern.test(repo.id)) score += 2;
      score *= rule.weight;
      if (score > 0) scored.push({ segment: rule.id, score });
    }
    scored.sort((a, b) => b.score - a.score || a.segment.localeCompare(b.segment));
    const labels = scored.slice(0, this.maxLabels).map((entry) => ({
      segment: entry.segment,
      confidence: clamp(1 - Math.exp(-entry.score), 0, 1),
      source: 'rules' as const,
    }));
    if (!labels.length) labels.push({ segment: 'other', confidence: 0, source: 'rules' });
    return labels;
  }

  /** Highest-confidence label; `other` when nothing matched. */
  primary(repo: SegmentInput): SegmentLabel {
    return this.classify(repo)[0] ?? { segment: 'other', confidence: 0, source: 'rules' };
  }
}

function signatureOf(path: string): string {
  const stat = statSync(path, { throwIfNoEntry: false });
  return stat ? `${stat.mtimeMs}:${stat.size}` : '';
}

function readIfPresent(path: string): string | null {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function parseRule(value: unknown): SegmentRule | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id) return null;
  const asList = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
  return {
    id,
    label: typeof value.label === 'string' && value.label ? value.label : id,
    weight: typeof value.weight === 'number' && value.weight > 0 ? value.weight : 1,
    keywords: asList(value.keywords),
    topics: asList(value.topics),
    namePatterns: asList(value.namePatterns),
  };
}

function compileRule(rule: SegmentRule): CompiledRule {
  return {
    ...rule,
    keywordMatchers: rule.keywords.map((keyword) => {
      const ascii = /^[\x20-\x7e]+$/.test(keyword);
      if (!ascii) return { latin: null, raw: keyword.toLowerCase() };
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { latin: new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i'), raw: keyword.toLowerCase() };
    }),
    patternMatchers: rule.namePatterns.flatMap((pattern) => {
      try {
        return [new RegExp(pattern, 'i')];
      } catch {
        return [];
      }
    }),
  };
}

/** Overrides are authoritative: the override label replaces rule labels. */
export function applyOverride(labels: SegmentLabel[], override: { segment: string; reason: string | null } | null): SegmentLabel[] {
  if (!override) return labels;
  return [{ segment: override.segment, confidence: 1, source: 'override' }];
}
