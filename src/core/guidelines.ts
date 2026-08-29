export interface Guideline {
  category: string
  text: string
}

export interface GuidelineFile {
  path: string
  scope: 'global' | 'project'
  /** True for the file PAI owns (CLAUDE.pai.md), false for hand-written ones. */
  managed: boolean
}

export interface GuidelineGroup {
  scope: 'global' | 'project'
  path: string
  /** True for the file PAI owns (CLAUDE.pai.md), false for hand-written ones. */
  managed?: boolean
  guidelines: Guideline[]
}

export interface GuidelineFilters {
  scope?: 'global' | 'project'
  search?: string
}

export const HEADING = /^#{1,6}\s+(.+?)\s*$/
export const BULLET = /^\s*[-*]\s+(.+?)\s*$/

export function parseGuidelines(markdown: string): Guideline[] {
  const guidelines: Guideline[] = []
  let category = 'General'
  // A BOM (Windows editors) would otherwise hide the first heading.
  for (const line of markdown.replace(/^﻿/, '').split('\n')) {
    const heading = HEADING.exec(line)
    if (heading?.[1]) {
      category = heading[1]
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet?.[1]) {
      guidelines.push({ category, text: bullet[1] })
    }
  }
  return guidelines
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
