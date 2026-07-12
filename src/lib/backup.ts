import type { Bookmark, Folder } from '../types'

/** 本工具专用的 JSON 备份格式，完整保留 sources/tags/folders 结构，用于数据备份与迁移。 */
export interface BackupData {
  version: number
  exportedAt: string
  bookmarks: Bookmark[]
  folders: Folder[]
}

/** 将当前工作集序列化为 JSON 字符串。 */
export function serializeBackup(bookmarks: Bookmark[], folders: Folder[]): string {
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), bookmarks, folders },
    null,
    2,
  )
}

/** 解析并校验备份 JSON，失败时抛出可读错误。 */
export function parseBackup(text: string): BackupData {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error('JSON 解析失败，文件可能已损坏')
  }
  const d = obj as Partial<BackupData>
  if (!d || !Array.isArray(d.bookmarks) || !Array.isArray(d.folders)) {
    throw new Error('备份文件格式不正确（缺少 bookmarks 或 folders 数组）')
  }
  return {
    version: typeof d.version === 'number' ? d.version : 1,
    exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : '',
    bookmarks: d.bookmarks as Bookmark[],
    folders: d.folders as Folder[],
  }
}

/** 触发浏览器下载 JSON 备份文件。 */
export function downloadBackup(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
