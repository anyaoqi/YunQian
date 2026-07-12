import { create } from 'zustand'
import type { Bookmark, Folder, ImportResult, AISettings } from '../types'
import { normalizeUrl } from '../lib/url'
import { dedupe } from '../lib/dedup'
import { categorizeByRules, categorizeByMap } from '../lib/categorize'
import { loadAll, persistAll } from '../db/db'
import { uid } from '../lib/id'
import { defaultSettings } from '../lib/ai'

const AI_KEY = 'bookmark-organizer-ai'

function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return defaultSettings('claude')
}

interface State {
  bookmarks: Bookmark[]
  folders: Folder[]
  selectedFolderId: string | null | 'ALL'
  search: string
  status: string
  ready: boolean
  ai: AISettings

  init: () => Promise<void>
  addImport: (result: ImportResult) => void
  addImportKeepStructure: (result: ImportResult) => void
  runDedupe: () => void
  organizeByRules: () => void
  organizeByMap: (categoryByUrl: Map<string, string>) => void

  createFolder: (name: string, parentId?: string | null) => void
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  mergeFolder: (srcId: string, dstId: string) => void
  moveFolder: (folderId: string, newParentId: string | null) => void

  moveBookmarks: (ids: string[], folderId: string | null) => void
  updateBookmark: (id: string, patch: Partial<Pick<Bookmark, 'title' | 'url'>>) => void
  deleteBookmarks: (ids: string[]) => void

  clearAll: () => void
  importBackup: (data: { bookmarks: Bookmark[]; folders: Folder[] }) => void
  setSearch: (s: string) => void
  setSelectedFolder: (id: string | null | 'ALL') => void
  setStatus: (s: string) => void
  setAI: (ai: AISettings) => void
}

export const useStore = create<State>((set, get) => {
  // 持久化当前工作集
  const commit = (bookmarks: Bookmark[], folders: Folder[], status?: string) => {
    set((s) => ({ bookmarks, folders, status: status ?? s.status }))
    void persistAll(bookmarks, folders)
  }

  return {
    bookmarks: [],
    folders: [],
    selectedFolderId: 'ALL',
    search: '',
    status: '',
    ready: false,
    ai: loadAISettings(),

    init: async () => {
      const { bookmarks, folders } = await loadAll()
      set({ bookmarks, folders, ready: true })
    },

    addImport: (result) => {
      const { bookmarks } = get()
      const added: Bookmark[] = result.bookmarks.map((p) => ({
        id: uid('b_'),
        title: p.title,
        url: p.url,
        normalizedUrl: normalizeUrl(p.url),
        folderId: null,
        dateAdded: p.dateAdded,
        icon: p.icon,
        sources: [result.source],
      }))
      commit([...bookmarks, ...added], get().folders, `已导入 ${added.length} 条（来源：${result.source}）`)
    },

    addImportKeepStructure: (result) => {
      const { bookmarks: existing, folders: existingFolders } = get()
      const folderByPath = new Map<string, Folder>()
      const newFolders: Folder[] = []
      let order = existingFolders.length
      const ensureFolder = (path: string[]): Folder | null => {
        if (path.length === 0) return null
        const key = path.join('/')
        const cached = folderByPath.get(key)
        if (cached) return cached
        const parent = ensureFolder(path.slice(0, -1))
        const f: Folder = {
          id: uid('f_'),
          name: path[path.length - 1],
          parentId: parent?.id ?? null,
          order: order++,
        }
        folderByPath.set(key, f)
        newFolders.push(f)
        return f
      }
      const added: Bookmark[] = result.bookmarks.map((p) => {
        const folder = ensureFolder(p.path)
        return {
          id: uid('b_'),
          title: p.title,
          url: p.url,
          normalizedUrl: normalizeUrl(p.url),
          folderId: folder?.id ?? null,
          dateAdded: p.dateAdded,
          icon: p.icon,
          sources: [result.source],
        }
      })
      commit(
        [...existing, ...added],
        [...existingFolders, ...newFolders],
        `已导入 ${added.length} 条（保留原始结构，来源：${result.source}）`,
      )
    },

    runDedupe: () => {
      const { bookmarks, folders } = get()
      const { bookmarks: deduped, mergedCount } = dedupe(bookmarks)
      // 删除已不再被任何书签引用的空文件夹
      const usedFolderIds = new Set(deduped.map((b) => b.folderId).filter(Boolean) as string[])
      const keptFolders = folders.filter((f) => usedFolderIds.has(f.id))
      commit(deduped, keptFolders, `去重完成，合并了 ${mergedCount} 条重复书签`)
    },

    organizeByRules: () => {
      const { bookmarks } = get()
      const { folders, bookmarks: out } = categorizeByRules(bookmarks)
      commit(out, folders, `已按本地规则整理为 ${folders.length} 个分类`)
    },

    organizeByMap: (categoryByUrl) => {
      const { bookmarks } = get()
      const { folders, bookmarks: out } = categorizeByMap(bookmarks, categoryByUrl)
      commit(out, folders, `已按 AI 结果整理为 ${folders.length} 个分类`)
    },

    createFolder: (name, parentId = null) => {
      const { folders } = get()
      const order = folders.filter((f) => f.parentId === parentId).length
      const folder: Folder = { id: uid('f_'), name, parentId, order }
      commit(get().bookmarks, [...folders, folder])
    },

    renameFolder: (id, name) => {
      const folders = get().folders.map((f) => (f.id === id ? { ...f, name } : f))
      commit(get().bookmarks, folders)
    },

    deleteFolder: (id) => {
      const { folders, bookmarks } = get()
      // 递归收集所有后代分组
      const toDelete = new Set<string>([id])
      let grew = true
      while (grew) {
        grew = false
        for (const f of folders) {
          if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
            toDelete.add(f.id)
            grew = true
          }
        }
      }
      // 后代分组的书签移到被删分组的父级
      const target = folders.find((f) => f.id === id)?.parentId ?? null
      const next = bookmarks.map((b) =>
        b.folderId && toDelete.has(b.folderId) ? { ...b, folderId: target } : b,
      )
      const kept = folders.filter((f) => !toDelete.has(f.id))
      commit(next, kept, `已删除分组（含 ${toDelete.size} 个子分组），书签移至上级`)
    },

    mergeFolder: (srcId, dstId) => {
      if (srcId === dstId) return
      const bookmarks = get().bookmarks.map((b) =>
        b.folderId === srcId ? { ...b, folderId: dstId } : b,
      )
      const folders = get().folders.filter((f) => f.id !== srcId)
      commit(bookmarks, folders, '已合并分类')
    },

    moveFolder: (folderId, newParentId) => {
      if (folderId === newParentId) return
      const { folders } = get()
      // 防止把分组移到自己的后代下（会形成环）
      const descendants = new Set<string>([folderId])
      let grew = true
      while (grew) {
        grew = false
        for (const f of folders) {
          if (f.parentId && descendants.has(f.parentId) && !descendants.has(f.id)) {
            descendants.add(f.id)
            grew = true
          }
        }
      }
      if (newParentId && descendants.has(newParentId)) return
      const updated = folders.map((f) =>
        f.id === folderId ? { ...f, parentId: newParentId } : f,
      )
      // 在目标父级下重排，被移动的放到末尾
      const sibs = updated
        .filter((f) => f.parentId === newParentId)
        .sort((a, b) => (a.id === folderId ? 1 : b.id === folderId ? -1 : a.order - b.order))
      const sibOrder = new Map<string, number>()
      sibs.forEach((f, i) => sibOrder.set(f.id, i))
      const final = updated.map((f) =>
        sibOrder.has(f.id) ? { ...f, order: sibOrder.get(f.id)! } : f,
      )
      commit(get().bookmarks, final)
    },

    moveBookmarks: (ids, folderId) => {
      const idset = new Set(ids)
      const bookmarks = get().bookmarks.map((b) => (idset.has(b.id) ? { ...b, folderId } : b))
      commit(bookmarks, get().folders)
    },

    updateBookmark: (id, patch) => {
      const bookmarks = get().bookmarks.map((b) => {
        if (b.id !== id) return b
        const next = { ...b, ...patch }
        if (patch.url) next.normalizedUrl = normalizeUrl(patch.url)
        return next
      })
      commit(bookmarks, get().folders)
    },

    deleteBookmarks: (ids) => {
      const idset = new Set(ids)
      const bookmarks = get().bookmarks.filter((b) => !idset.has(b.id))
      commit(bookmarks, get().folders, `已删除 ${ids.length} 条书签`)
    },

    clearAll: () => commit([], [], '已清空全部数据'),

    importBackup: (data) =>
      commit(
        data.bookmarks,
        data.folders,
        `已恢复备份：${data.bookmarks.length} 条书签，${data.folders.length} 个分组`,
      ),

    setSearch: (search) => set({ search }),
    setSelectedFolder: (selectedFolderId) => set({ selectedFolderId }),
    setStatus: (status) => set({ status }),
    setAI: (ai) => {
      localStorage.setItem(AI_KEY, JSON.stringify(ai))
      set({ ai })
    },
  }
})
