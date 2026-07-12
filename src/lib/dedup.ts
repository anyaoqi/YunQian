import type { Bookmark } from '../types'

/** 标题优劣评分：非空、非纯 URL、更长者更优 */
function titleScore(title: string, url: string): number {
  const t = (title || '').trim()
  if (!t) return -1
  if (t === url) return 0
  if (/^https?:\/\//i.test(t)) return 0
  return t.length
}

export interface DedupResult {
  bookmarks: Bookmark[]
  /** 被合并掉的重复条数 */
  mergedCount: number
}

/**
 * 按 normalizedUrl 合并重复书签：
 * - 保留评分最高的标题
 * - sources / tags 取并集
 * - dateAdded 取最早，icon 取首个可用
 * 空 normalizedUrl（无效 url）的条目原样保留，不参与合并。
 */
export function dedupe(bookmarks: Bookmark[]): DedupResult {
  const map = new Map<string, Bookmark>()
  const passthrough: Bookmark[] = []
  let mergedCount = 0

  for (const b of bookmarks) {
    if (!b.normalizedUrl) {
      passthrough.push(b)
      continue
    }
    const existing = map.get(b.normalizedUrl)
    if (!existing) {
      map.set(b.normalizedUrl, { ...b, sources: [...new Set(b.sources)], tags: b.tags ? [...b.tags] : undefined })
      continue
    }
    mergedCount++
    // 标题
    if (titleScore(b.title, b.url) > titleScore(existing.title, existing.url)) {
      existing.title = b.title
      existing.url = b.url
    }
    // sources / tags 并集
    existing.sources = [...new Set([...existing.sources, ...b.sources])]
    if (b.tags?.length) existing.tags = [...new Set([...(existing.tags ?? []), ...b.tags])]
    // 最早时间
    if (b.dateAdded && (!existing.dateAdded || b.dateAdded < existing.dateAdded)) {
      existing.dateAdded = b.dateAdded
    }
    // 图标
    if (!existing.icon && b.icon) existing.icon = b.icon
  }

  return { bookmarks: [...map.values(), ...passthrough], mergedCount }
}
