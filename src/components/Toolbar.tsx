import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { parseNetscape } from '../lib/parser'
import { exportNetscape, downloadHtml } from '../lib/exporter'
import { aiCategorize } from '../lib/ai'
import { serializeBackup, parseBackup, downloadBackup } from '../lib/backup'

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const bookmarks = useStore((s) => s.bookmarks)
  const folders = useStore((s) => s.folders)
  const ai = useStore((s) => s.ai)
  const addImport = useStore((s) => s.addImport)
  const addImportKeepStructure = useStore((s) => s.addImportKeepStructure)
  const runDedupe = useStore((s) => s.runDedupe)
  const organizeByRules = useStore((s) => s.organizeByRules)
  const organizeByMap = useStore((s) => s.organizeByMap)
  const clearAll = useStore((s) => s.clearAll)
  const importBackup = useStore((s) => s.importBackup)
  const setStatus = useStore((s) => s.setStatus)

  const fileRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [keepStructure, setKeepStructure] = useState(false)

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      let total = 0
      for (const file of Array.from(files)) {
        const text = await file.text()
        const result = parseNetscape(text, file.name)
        if (keepStructure) addImportKeepStructure(result)
        else addImport(result)
        total += result.bookmarks.length
      }
      setStatus(`已导入 ${files.length} 个文件，共 ${total} 条书签${keepStructure ? '（保留原始结构）' : ''}`)
    } catch (e) {
      setStatus(`导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onDedupe = () => {
    if (!bookmarks.length) return
    runDedupe()
  }

  const onLocal = () => {
    if (!bookmarks.length) return
    organizeByRules()
  }

  const onAI = async () => {
    if (!bookmarks.length || busy) return
    setBusy(true)
    setStatus('AI 整理中…')
    try {
      const map = await aiCategorize(
        bookmarks,
        ai,
        (p) => setStatus(`AI 整理中… ${p.done}/${p.total}`),
      )
      organizeByMap(map)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`AI 整理失败（${msg}），已回退本地规则`)
      organizeByRules()
    } finally {
      setBusy(false)
    }
  }

  const onExport = () => {
    if (!bookmarks.length) return
    const html = exportNetscape(bookmarks, folders)
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    downloadHtml(html, `bookmarks-${stamp}.html`)
    setStatus('已导出书签文件')
  }

  const onBackup = () => {
    if (!bookmarks.length && !folders.length) return
    const json = serializeBackup(bookmarks, folders)
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    downloadBackup(json, `bookmarks-backup-${stamp}.json`)
    setStatus('已导出 JSON 备份')
  }

  const onRestore = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      const text = await files[0].text()
      const data = parseBackup(text)
      importBackup(data)
    } catch (e) {
      setStatus(`恢复失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      if (jsonRef.current) jsonRef.current.value = ''
    }
  }

  const onClear = () => {
    if (!bookmarks.length && !folders.length) return
    if (confirm('清空全部书签与分组？此操作不可撤销。')) clearAll()
  }

  return (
    <div className="topbar">
      <h1>🔖 书签整合整理工具</h1>

      <input
        ref={fileRef}
        type="file"
        accept=".html,.htm,text/html"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => onFiles(e.target.files)}
      />
      <button className="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
        导入
      </button>
      <label className="keep-struct" title="导入时保留原始书签的文件夹层级，而非全部放入未分组">
        <input
          type="checkbox"
          checked={keepStructure}
          onChange={(e) => setKeepStructure(e.target.checked)}
        />
        保留结构
      </label>
      <button onClick={onDedupe} disabled={busy || !bookmarks.length} title="按网址归一化合并重复">
        去重
      </button>
      <button onClick={onLocal} disabled={busy || !bookmarks.length} title="按域名/关键词规则自动分类">
        本地整理
      </button>
      <button onClick={onAI} disabled={busy || !bookmarks.length} title="调用 AI 智能分类（需在设置中填 Key）">
        AI 整理
      </button>
      <button onClick={onExport} disabled={!bookmarks.length} title="导出为浏览器可导入的书签 HTML">
        导出
      </button>
      <input
        ref={jsonRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => onRestore(e.target.files)}
      />
      <button onClick={onBackup} disabled={!bookmarks.length && !folders.length} title="导出 JSON 备份（完整保留分组/来源/标签）">
        备份
      </button>
      <button onClick={() => jsonRef.current?.click()} disabled={busy} title="从 JSON 备份恢复（替换当前数据）">
        恢复
      </button>

      <div className="spacer" />

      <button onClick={onClear} disabled={!bookmarks.length && !folders.length} title="清空全部数据">
        清空
      </button>
      <button className="ghost" onClick={onOpenSettings} title="AI 设置">
        ⚙ 设置
      </button>
    </div>
  )
}
