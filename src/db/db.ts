import Dexie, { type Table } from 'dexie'
import type { Bookmark, Folder } from '../types'

// IndexedDB 持久化：两张表 + 一个简单的 meta 表存 AI 设置等。
export class BookmarkDB extends Dexie {
  bookmarks!: Table<Bookmark, string>
  folders!: Table<Folder, string>

  constructor() {
    super('bookmark-organizer')
    this.version(1).stores({
      bookmarks: 'id, folderId, normalizedUrl',
      folders: 'id, parentId',
    })
  }
}

export const db = new BookmarkDB()

/** 全量覆盖保存当前工作集（整理类操作会重建结构，简单可靠）。 */
export async function persistAll(bookmarks: Bookmark[], folders: Folder[]): Promise<void> {
  await db.transaction('rw', db.bookmarks, db.folders, async () => {
    await db.bookmarks.clear()
    await db.folders.clear()
    if (folders.length) await db.folders.bulkPut(folders)
    if (bookmarks.length) await db.bookmarks.bulkPut(bookmarks)
  })
}

export async function loadAll(): Promise<{ bookmarks: Bookmark[]; folders: Folder[] }> {
  const [bookmarks, folders] = await Promise.all([db.bookmarks.toArray(), db.folders.toArray()])
  return { bookmarks, folders }
}
