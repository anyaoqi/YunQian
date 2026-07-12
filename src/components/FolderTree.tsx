import { useState } from 'react'
import { useStore } from '../state/store'
import type { Folder } from '../types'

export function FolderTree() {
  const folders = useStore((s) => s.folders)
  const bookmarks = useStore((s) => s.bookmarks)
  const selected = useStore((s) => s.selectedFolderId)
  const setSelected = useStore((s) => s.setSelectedFolder)
  const createFolder = useStore((s) => s.createFolder)
  const renameFolder = useStore((s) => s.renameFolder)
  const deleteFolder = useStore((s) => s.deleteFolder)
  const moveBookmarks = useStore((s) => s.moveBookmarks)
  const moveFolder = useStore((s) => s.moveFolder)
  const [dropTarget, setDropTarget] = useState<string | null | 'NONE'>('NONE')

  const countFor = (id: string | null) => bookmarks.filter((b) => b.folderId === id).length
  const childrenOf = (parentId: string | null) =>
    folders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order)

  // 统一处理放置：书签拖入 → moveBookmarks；分组拖入 → moveFolder（改父级）
  const handleDrop = (folderId: string | null) => (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget('NONE')
    const bmIds = e.dataTransfer.getData('text/bookmark-ids')
    if (bmIds) {
      moveBookmarks(bmIds.split(','), folderId)
      return
    }
    const srcFolderId = e.dataTransfer.getData('text/folder-id')
    if (srcFolderId) moveFolder(srcFolderId, folderId)
  }
  const allowDrop = (key: string | null) => (e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes('text/bookmark-ids') ||
      e.dataTransfer.types.includes('text/folder-id')
    ) {
      e.preventDefault()
      setDropTarget(key)
    }
  }

  const addFolder = (parentId: string | null) => {
    const name = prompt(parentId ? '子分组名称' : '新分组名称')?.trim()
    if (name) createFolder(name, parentId)
  }
  const rename = (id: string, cur: string) => {
    const name = prompt('重命名分组', cur)?.trim()
    if (name) renameFolder(id, name)
  }
  const remove = (id: string, name: string) => {
    if (confirm(`删除分组「${name}」及其子分组？其中的书签会移到上级。`)) deleteFolder(id)
  }

  const renderNode = (folder: Folder, depth: number) => {
    const children = childrenOf(folder.id)
    return (
      <div key={folder.id}>
        <div
          className={`folder ${selected === folder.id ? 'active' : ''} ${dropTarget === folder.id ? 'drop' : ''}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            e.dataTransfer.setData('text/folder-id', folder.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onClick={() => setSelected(folder.id)}
          onDragOver={allowDrop(folder.id)}
          onDragLeave={() => setDropTarget('NONE')}
          onDrop={handleDrop(folder.id)}
        >
          <span className="name">
            {depth === 0 ? '📁 ' : '↳ '}
            {folder.name}
          </span>
          <span className="count">{countFor(folder.id)}</span>
          <span className="acts">
            <button
              className="ghost"
              title="新建子分组"
              onClick={(e) => {
                e.stopPropagation()
                addFolder(folder.id)
              }}
            >
              ＋
            </button>
            <button
              className="ghost"
              onClick={(e) => {
                e.stopPropagation()
                rename(folder.id, folder.name)
              }}
            >
              改名
            </button>
            <button
              className="ghost"
              onClick={(e) => {
                e.stopPropagation()
                remove(folder.id, folder.name)
              }}
            >
              删除
            </button>
          </span>
        </div>
        {children.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <span>分组</span>
        <button className="ghost" onClick={() => addFolder(null)} title="新建顶层分组">
          ＋
        </button>
      </div>

      <div
        className={`folder ${selected === 'ALL' ? 'active' : ''}`}
        onClick={() => setSelected('ALL')}
      >
        <span className="name">📚 全部书签</span>
        <span className="count">{bookmarks.length}</span>
      </div>

      <div
        className={`folder ${selected === null ? 'active' : ''} ${dropTarget === null ? 'drop' : ''}`}
        onClick={() => setSelected(null)}
        onDragOver={allowDrop(null)}
        onDragLeave={() => setDropTarget('NONE')}
        onDrop={handleDrop(null)}
      >
        <span className="name">🗂 未分组</span>
        <span className="count">{countFor(null)}</span>
      </div>

      {childrenOf(null).map((f) => renderNode(f, 0))}
    </div>
  )
}
