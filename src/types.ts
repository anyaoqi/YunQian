// 统一数据模型

export interface Bookmark {
  id: string
  title: string
  url: string
  /** 归一化后的 URL，仅用于去重比较 */
  normalizedUrl: string
  /** 所属文件夹 id；null 表示根目录（未分类外的顶层） */
  folderId: string | null
  /** 原书签添加时间（unix 秒），可选 */
  dateAdded?: number
  /** favicon data URI，可选 */
  icon?: string
  /** 来源列表（文件名 + 浏览器猜测），合并重复时取并集 */
  sources: string[]
  tags?: string[]
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  order: number
}

/** 导入解析出的中间结构（尚未分配最终 folderId） */
export interface ParsedBookmark {
  title: string
  url: string
  dateAdded?: number
  icon?: string
  /** 原始文件夹路径，如 ["书签栏", "开发"] */
  path: string[]
}

export interface ImportResult {
  source: string
  bookmarks: ParsedBookmark[]
}

export type AIProvider = 'claude' | 'openai'

export interface AISettings {
  provider: AIProvider
  apiKey: string
  baseUrl: string
  model: string
}
