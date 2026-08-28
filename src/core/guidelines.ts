export interface Guideline {
  category: string
  text: string
}

export interface GuidelineGroup {
  scope: 'global' | 'project'
  path: string
  guidelines: Guideline[]
}

export interface GuidelineFilters {
  scope?: 'global' | 'project'
  search?: string
}

export function filterGuidelineGroups(
  groups: GuidelineGroup[],
  filters: GuidelineFilters,
): GuidelineGroup[] {
  const query = filters.search?.trim()
  // Word-start match: "ask" hits "Ask"/"asking" but not "tasks".
  const matcher =
    query === undefined || query === ''
      ? undefined
      : new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
  return groups
    .filter((group) => filters.scope === undefined || group.scope === filters.scope)
    .map((group) =>
      matcher === undefined
        ? group
        : {
            ...group,
            guidelines: group.guidelines.filter(
              (g) => matcher.test(g.text) || matcher.test(g.category),
            ),
          },
    )
    .filter((group) => group.guidelines.length > 0 || matcher === undefined)
}
