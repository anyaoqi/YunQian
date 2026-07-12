import type { ParsedBookmark, ImportResult } from '../types'

/**
 * 根据文件名/内容猜测来源浏览器（仅用于 source 标签展示）。
 */
function guessBrowser(filename: string, html: string): string {
  const f = filename.toLowerCase()
  if (f.includes('firefox') || html.includes('PERSONAL_TOOLBAR_FOLDER')) return 'Firefox'
  if (f.includes('edge')) return 'Edge'
  if (f.includes('chrome')) return 'Chrome'
  if (f.includes('safari')) return 'Safari'
  return '浏览器'
}

/**
 * 解析 Netscape 书签 HTML（Chrome/Edge/Firefox 等导出格式通用）。
 * 递归遍历 <DL>，<H3> 为文件夹，<A> 为书签，记录文件夹路径。
 */
export function parseNetscape(html: string, filename: string): ImportResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const bookmarks: ParsedBookmark[] = []

  const walk = (dl: Element, path: string[]) => {
    // 直接子 <DT> 元素
    for (const dt of Array.from(dl.children)) {
      if (dt.tagName !== 'DT') continue
      const h3 = dt.querySelector(':scope > h3') as HTMLElement | null
      const a = dt.querySelector(':scope > a') as HTMLAnchorElement | null

      if (h3) {
        const name = (h3.textContent || '未命名文件夹').trim()
        // 子 <DL> 可能在 DT 内部（Firefox/手写格式），也可能是 DT 的下一个兄弟节点
        // （Chrome/Edge 真实导出格式：<DT><H3>x</H3>\n<DL>...</DL>，DL 与 DT 平级）
        let childDl = dt.querySelector(':scope > dl')
        if (!childDl) {
          const next = dt.nextElementSibling
          if (next && next.tagName === 'DL') childDl = next
        }
        if (childDl) walk(childDl, [...path, name])
      } else if (a) {
        const url = a.getAttribute('href') || ''
        if (!url) continue
        const addDate = a.getAttribute('add_date')
        const icon = a.getAttribute('icon') || undefined
        bookmarks.push({
          title: (a.textContent || url).trim(),
          url,
          dateAdded: addDate ? Number(addDate) : undefined,
          icon,
          path,
        })
      }
    }
  }

  // 顶层可能有多个 DL；从每个根 DL 开始
  const rootDls = Array.from(doc.querySelectorAll('body > dl, body > dt > dl'))
  if (rootDls.length === 0) {
    // 退化处理：直接抓所有 <a>
    for (const a of Array.from(doc.querySelectorAll('a'))) {
      const url = (a as HTMLAnchorElement).getAttribute('href') || ''
      if (url) bookmarks.push({ title: (a.textContent || url).trim(), url, path: [] })
    }
  } else {
    for (const dl of rootDls) walk(dl, [])
  }

  const browser = guessBrowser(filename, html)
  const source = `${filename}（${browser}）`
  return { source, bookmarks }
}
