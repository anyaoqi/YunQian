import type { Bookmark, Folder } from '../types'
import { getDomain } from './url'
import { ruleCategory, UNCATEGORIZED } from './domains'
import { uid } from './id'

export interface CategorizeResult {
  folders: Folder[]
  bookmarks: Bookmark[]
}

/**
 * 本地规则自动分组：
 * 为每条书签确定一个顶层分类（域名字典 + 关键词），
 * 生成对应的顶层文件夹并把书签的 folderId 指过去。
 * 完全替换现有文件夹结构（重新整理）。
 */
export function categorizeByRules(bookmarks: Bookmark[]): CategorizeResult {
  const folderByName = new Map<string, Folder>()
  let order = 0

  const ensureFolder = (name: string): Folder => {
    let f = folderByName.get(name)
    if (!f) {
      f = { id: uid('f_'), name, parentId: null, order: order++ }
      folderByName.set(name, f)
    }
    return f
  }

  const out: Bookmark[] = bookmarks.map((b) => {
    const domain = getDomain(b.url)
    const category = ruleCategory(domain, b.title, b.url) ?? UNCATEGORIZED
    const folder = ensureFolder(category)
    return { ...b, folderId: folder.id }
  })

  // 把"未分类"排到最后
  const folders = [...folderByName.values()].sort((a, b) => {
    if (a.name === UNCATEGORIZED) return 1
    if (b.name === UNCATEGORIZED) return -1
    return a.order - b.order
  })
  folders.forEach((f, i) => (f.order = i))

  return { folders, bookmarks: out }
}

/**
 * 按 AI 返回的 url->分类 映射建树。未覆盖到的归入"未分类"。
 */
export function categorizeByMap(
  bookmarks: Bookmark[],
  categoryByUrl: Map<string, string>,
): CategorizeResult {
  const folderByName = new Map<string, Folder>()
  let order = 0
  const ensureFolder = (name: string): Folder => {
    let f = folderByName.get(name)
    if (!f) {
      f = { id: uid('f_'), name, parentId: null, order: order++ }
      folderByName.set(name, f)
    }
    return f
  }

  const out: Bookmark[] = bookmarks.map((b) => {
    const category = (categoryByUrl.get(b.url) || '').trim() || UNCATEGORIZED
    const folder = ensureFolder(category)
    return { ...b, folderId: folder.id }
  })

  const folders = [...folderByName.values()].sort((a, b) => {
    if (a.name === UNCATEGORIZED) return 1
    if (b.name === UNCATEGORIZED) return -1
    return a.order - b.order
  })
  folders.forEach((f, i) => (f.order = i))

  return { folders, bookmarks: out }
}
