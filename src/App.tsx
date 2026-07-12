import { useEffect, useState } from 'react'
import { useStore } from './state/store'
import { Toolbar } from './components/Toolbar'
import { FolderTree } from './components/FolderTree'
import { BookmarkList } from './components/BookmarkList'
import { SettingsDialog } from './components/SettingsDialog'

export default function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const status = useStore((s) => s.status)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) {
    return (
      <div className="app">
        <div className="empty">加载中…</div>
      </div>
    )
  }

  return (
    <div className="app">
      <Toolbar onOpenSettings={() => setShowSettings(true)} />
      <div className="status">{status}</div>
      <div className="main">
        <FolderTree />
        <BookmarkList />
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  )
}
