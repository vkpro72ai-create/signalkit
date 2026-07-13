/**
 * Pure discovery-brief completeness logic for the Opportunities page's "Find
 * opportunities" tab. Mirrors the backend's required-field check exactly
 * (topic/direction, audience, product type) so the client-side gate and the
 * server's 422 `opportunity_search_context_incomplete` never disagree.
 * "Any direction" / "Any format" (empty string) and whitespace-only input do
 * not count as completed — same rule as the backend.
 */

export type BriefFieldId = 'topic' | 'audience' | 'productType';

export const REQUIRED_BRIEF_FIELDS: BriefFieldId[] = ['topic', 'audience', 'productType'];

export interface BriefValues {
  direction: string;
  audienceInput: string;
  productFormat: string;
}

const isFilled = (value: string): boolean => value.trim().length > 0;

export function briefFieldComplete(field: BriefFieldId, values: BriefValues): boolean {
  switch (field) {
    case 'topic':
      return isFilled(values.direction);
    case 'audience':
      return isFilled(values.audienceInput);
    case 'productType':
      return isFilled(values.productFormat);
  }
}

export function missingBriefFields(values: BriefValues): BriefFieldId[] {
  return REQUIRED_BRIEF_FIELDS.filter((field) => !briefFieldComplete(field, values));
}

export function briefCompletedCount(values: BriefValues): number {
  return REQUIRED_BRIEF_FIELDS.length - missingBriefFields(values).length;
}

export function isBriefComplete(values: BriefValues): boolean {
  return missingBriefFields(values).length === 0;
}

/**
 * Resolves which Research/Search Context (Project) an Opportunities page load
 * should scope to. Honors an explicit `?project=` id (e.g. the redirect right
 * after creating a new Opportunity Search) over an arbitrary first-project
 * fallback — this is what keeps opportunities from a different search from
 * ever being shown, and what makes a brand-new search land on its own brief
 * instead of whichever project happened to be first in the list.
 */
export function resolveActiveProjectId(projects: { id: string }[], requestedId: string | null): string | null {
  if (requestedId) {
    const matched = projects.find((p) => p.id === requestedId);
    if (matched) return matched.id;
  }
  return projects[0]?.id ?? null;
}
