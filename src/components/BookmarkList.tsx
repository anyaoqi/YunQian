import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import type { Bookmark } from '../types'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function faviconUrl(b: Bookmark): string {
  if (b.icon) return b.icon
  const host = hostOf(b.url)
  return host ? `https://www.google.com/s2/favicons?sz=32&domain=${host}` : ''
}

function EditDialog({
  bookmark,
  onClose,
}: {
  bookmark: Bookmark
  onClose: () => void
}) {
  const folders = useStore((s) => s.folders)
  const updateBookmark = useStore((s) => s.updateBookmark)
  const moveBookmarks = useStore((s) => s.moveBookmarks)
  const [title, setTitle] = useState(bookmark.title)
  const [url, setUrl] = useState(bookmark.url)
  const [folderId, setFolderId] = useState<string>(bookmark.folderId ?? '__none')

  const save = () => {
    const patch: { title: string; url?: string } = { title: title.trim() || bookmark.title }
    if (url.trim() && url !== bookmark.url) patch.url = url.trim()
    updateBookmark(bookmark.id, patch)
    const target = folderId === '__none' ? null : folderId
    if (target !== bookmark.folderId) moveBookmarks([bookmark.id], target)
    onClose()
  }

  const sorted = [...folders].sort((a, b) => a.order - b.order)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>编辑书签</h2>

        <div className="field">
          <label>标题</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div className="field">
          <label>网址</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>

        <div className="field">
          <label>所属分组</label>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="__none">未分组</option>
            {sorted.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

export function BookmarkList() {
  const bookmarks = useStore((s) => s.bookmarks)
  const folders = useStore((s) => s.folders)
  const selectedFolderId = useStore((s) => s.selectedFolderId)
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const deleteBookmarks = useStore((s) => s.deleteBookmarks)
  const moveBookmarks = useStore((s) => s.moveBookmarks)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastIdx, setLastIdx] = useState<number>(-1)
  const [editing, setEditing] = useState<Bookmark | null>(null)

  const folderName = (id: string | null) =>
    id ? folders.find((f) => f.id === id)?.name ?? '已删除' : '未分组'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bookmarks.filter((b) => {
      if (selectedFolderId !== 'ALL' && b.folderId !== selectedFolderId) return false
      if (!q) return true
      return b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
    })
  }, [bookmarks, selectedFolderId, search, folders])

  const toggle = (id: string, idx: number, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastIdx >= 0 && lastIdx !== idx) {
        const [a, b] = idx < lastIdx ? [idx, lastIdx] : [lastIdx, idx]
        for (let i = a; i <= b; i++) next.add(filtered[i].id)
      } else if (shiftKey) {
        // shift 同一位置：不动
      } else {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      return next
    })
    if (!shiftKey) setLastIdx(idx)
  }

  const allChecked = filtered.length > 0 && filtered.every((b) => selected.has(b.id))
  const someChecked = filtered.some((b) => selected.has(b.id))

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allChecked) filtered.forEach((b) => next.delete(b.id))
      else filtered.forEach((b) => next.add(b.id))
      return next
    })
  }

  const selectedIds = useMemo(
    () => filtered.filter((b) => selected.has(b.id)).map((b) => b.id),
    [filtered, selected],
  )

  const onDragStart = (e: React.DragEvent, id: string) => {
    const ids = selected.has(id) ? selectedIds : [id]
    e.dataTransfer.setData('text/bookmark-ids', ids.join(','))
    e.dataTransfer.effectAllowed = 'move'
  }

  const moveSelTo = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value
    if (!selectedIds.length) return
    moveBookmarks(selectedIds, v === '__none' ? null : v)
    setSelected(new Set())
    e.target.value = ''
  }

  const delSel = () => {
    if (!selectedIds.length) return
    if (confirm(`删除选中的 ${selectedIds.length} 条书签？`)) {
      deleteBookmarks(selectedIds)
      setSelected(new Set())
    }
  }

  const delOne = (b: Bookmark) => {
    if (confirm(`删除「${b.title}」？`)) {
      deleteBookmarks([b.id])
      setSelected((prev) => {
        const n = new Set(prev)
        n.delete(b.id)
        return n
      })
    }
  }

  const sorted = [...folders].sort((a, b) => a.order - b.order)

  return (
    <div className="content">
      <div className="content-head">
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = !allChecked && someChecked
          }}
          onChange={toggleAll}
          title="全选"
        />
        <input
          type="search"
          placeholder="搜索标题或网址…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="sel-info">
          {filtered.length} 条{selectedIds.length ? ` · 已选 ${selectedIds.length}` : ''}
        </span>
        <div className="spacer" style={{ flex: 1 }} />
        {selectedIds.length > 0 && (
          <>
            <select value="" onChange={moveSelTo} title="移动选中到分组">
              <option value="" disabled>
                移动到…
              </option>
              <option value="__none">未分组</option>
              {sorted.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button onClick={delSel}>删除选中</button>
          </>
        )}
      </div>

      <div className="list">
        {filtered.length === 0 ? (
          <div className="empty">
            {bookmarks.length === 0 ? '还没有书签。点击上方「导入」添加浏览器导出的书签文件。' : '没有匹配的书签。'}
          </div>
        ) : (
          filtered.map((b, idx) => {
            const checked = selected.has(b.id)
            return (
              <div
                key={b.id}
                className={`row ${checked ? 'selected' : ''}`}
                draggable
                onDragStart={(e) => onDragStart(e, b.id)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(b.id, idx, false)}
                  onClick={(e) => {
                    e.stopPropagation()
                    // Shift 点击：阻止默认切换，改做范围选择，避免与 onChange 重复触发
                    if (e.shiftKey) {
                      e.preventDefault()
                      toggle(b.id, idx, true)
                    }
                  }}
                />
                <img
                  className="favicon"
                  src={faviconUrl(b)}
                  alt=""
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
                  }}
                />
                <div className="info">
                  <div className="title">{b.title || b.url}</div>
                  <div className="url">
                    {b.url}
                    {selectedFolderId === 'ALL' && (
                      <span className="src"> · {folderName(b.folderId)}</span>
                    )}
                  </div>
                </div>
                <div className="acts">
                  <button onClick={() => setEditing(b)}>编辑</button>
                  <button onClick={() => delOne(b)}>删除</button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {editing && <EditDialog bookmark={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
