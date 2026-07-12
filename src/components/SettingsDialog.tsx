import { useState } from 'react'
import { useStore } from '../state/store'
import { defaultSettings } from '../lib/ai'
import type { AIProvider } from '../types'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const ai = useStore((s) => s.ai)
  const setAI = useStore((s) => s.setAI)
  const [draft, setDraft] = useState(ai)

  const changeProvider = (provider: AIProvider) => {
    // 切换提供方时带出该提供方的默认 baseUrl/model，但保留已填的 key
    const d = defaultSettings(provider)
    setDraft({ ...d, apiKey: draft.apiKey })
  }

  const save = () => {
    setAI(draft)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>AI 设置</h2>

        <div className="field">
          <label>提供方</label>
          <select value={draft.provider} onChange={(e) => changeProvider(e.target.value as AIProvider)}>
            <option value="claude">Claude (Anthropic)</option>
            <option value="openai">OpenAI 兼容（含本地 Ollama 等）</option>
          </select>
        </div>

        <div className="field">
          <label>API Key</label>
          <input
            type="password"
            value={draft.apiKey}
            placeholder="sk-..."
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Base URL</label>
          <input
            value={draft.baseUrl}
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
          />
        </div>

        <div className="field">
          <label>模型</label>
          <input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
        </div>

        <p className="hint">
          Key 仅保存在本机浏览器（localStorage），整理时直接由浏览器调用对应接口，不经过任何服务器。
          不填 Key 也可使用「本地整理」。
        </p>

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
