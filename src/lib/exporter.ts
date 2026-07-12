import type { Bookmark, Folder } from '../types'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 生成标准 Netscape 书签 HTML，可被 Chrome/Edge/Firefox「导入书签」识别。
 * 文件夹按树结构嵌套输出；无文件夹（folderId=null）的书签放在根层。
 */
export function exportNetscape(bookmarks: Bookmark[], folders: Folder[]): string {
  const childFolders = new Map<string | null, Folder[]>()
  for (const f of folders) {
    const key = f.parentId
    if (!childFolders.has(key)) childFolders.set(key, [])
    childFolders.get(key)!.push(f)
  }
  for (const list of childFolders.values()) list.sort((a, b) => a.order - b.order)

  const bmByFolder = new Map<string | null, Bookmark[]>()
  for (const b of bookmarks) {
    const key = b.folderId
    if (!bmByFolder.has(key)) bmByFolder.set(key, [])
    bmByFolder.get(key)!.push(b)
  }

  const lines: string[] = []
  lines.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
  lines.push('<!-- This is an automatically generated file. -->')
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">')
  lines.push('<TITLE>Bookmarks</TITLE>')
  lines.push('<H1>Bookmarks</H1>')
  lines.push('<DL><p>')

  const writeBookmark = (b: Bookmark, indent: string) => {
    const date = b.dateAdded ? ` ADD_DATE="${b.dateAdded}"` : ''
    const icon = b.icon ? ` ICON="${esc(b.icon)}"` : ''
    lines.push(`${indent}<DT><A HREF="${esc(b.url)}"${date}${icon}>${esc(b.title)}</A>`)
  }

  const writeFolder = (folder: Folder, indent: string) => {
    lines.push(`${indent}<DT><H3>${esc(folder.name)}</H3>`)
    lines.push(`${indent}<DL><p>`)
    const inner = indent + '    '
    for (const b of bmByFolder.get(folder.id) ?? []) writeBookmark(b, inner)
    for (const child of childFolders.get(folder.id) ?? []) writeFolder(child, inner)
    lines.push(`${indent}</DL><p>`)
  }

  const indent = '    '
  // 根层书签
  for (const b of bmByFolder.get(null) ?? []) writeBookmark(b, indent)
  // 顶层文件夹
  for (const f of childFolders.get(null) ?? []) writeFolder(f, indent)

  lines.push('</DL><p>')
  return lines.join('\n')
}

/** 触发浏览器下载 */
export function downloadHtml(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
