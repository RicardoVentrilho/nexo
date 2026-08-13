import type { Discriminator } from "./funnel.js";

export interface DiscriminatorCandidate {
  description: string;
  year_text?: string | null;
}

interface AttributePartition {
  attribute: string;
  values: Array<{ value: string; remainingCount: number }>;
  reduction: number;
}

const QUESTION_BUDGET = 2;

export function selectDiscriminator(candidates: DiscriminatorCandidate[]): Discriminator | undefined {
  if (candidates.length <= 1) return undefined;
  const partitions = [
    tokenPartition(candidates),
    yearPartition(candidates)
  ].filter((partition): partition is AttributePartition => partition !== undefined && partition.reduction > 0);

  return partitions.sort((left, right) => {
    if (right.reduction !== left.reduction) return right.reduction - left.reduction;
    return left.values.length - right.values.length;
  })[0];
}

function tokenPartition(candidates: DiscriminatorCandidate[]): AttributePartition | undefined {
  const tokenSets = candidates.map((candidate) => tokenize(candidate.description));
  const common = new Set([...(tokenSets[0]?.keys() ?? [])].filter((token) => tokenSets.every((tokens) => tokens.has(token))));
  const counts = new Map<string, { label: string; remainingCount: number }>();

  for (const tokens of tokenSets) {
    for (const [folded, label] of tokens) {
      if (common.has(folded)) continue;
      const current = counts.get(folded);
      counts.set(folded, { label, remainingCount: (current?.remainingCount ?? 0) + 1 });
    }
  }

  const values = [...counts.values()]
    .filter((entry) => candidates.length <= QUESTION_BUDGET + 1 || entry.remainingCount > 1)
    .map((entry) => ({ value: entry.label, remainingCount: entry.remainingCount }))
    .sort((left, right) => left.value.localeCompare(right.value));
  return buildPartition("description_token", candidates.length, values);
}

function yearPartition(candidates: DiscriminatorCandidate[]): AttributePartition | undefined {
  const concreteYears = new Set<string>();
  for (const candidate of candidates) {
    const year = normalizeYear(candidate.year_text);
    if (year) concreteYears.add(year);
  }
  const values = [...concreteYears]
    .map((value) => ({
      value,
      remainingCount: candidates.filter((candidate) => {
        const year = normalizeYear(candidate.year_text);
        return year === undefined || year === value;
      }).length
    }))
    .sort((left, right) => left.value.localeCompare(right.value));
  return buildPartition("year", candidates.length, values);
}

function buildPartition(attribute: string, total: number, values: Array<{ value: string; remainingCount: number }>): AttributePartition | undefined {
  if (values.length <= 1) return undefined;
  return {
    attribute,
    values,
    reduction: total - Math.min(...values.map((value) => value.remainingCount))
  };
}

function tokenize(description: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const token of description.split(/[^\p{L}\p{N}]+/u)) {
    if (!token) continue;
    tokens.set(fold(token), token);
  }
  return tokens;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizeYear(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return fold(text).startsWith("todos") ? undefined : text;
}
