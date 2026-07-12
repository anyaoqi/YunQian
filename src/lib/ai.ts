import type { Bookmark, AISettings } from '../types'

const DEFAULTS: Record<AISettings['provider'], { baseUrl: string; model: string }> = {
  claude: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022' },
  openai: { baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
}

export function defaultSettings(provider: AISettings['provider']): AISettings {
  const d = DEFAULTS[provider]
  return { provider, apiKey: '', baseUrl: d.baseUrl, model: d.model }
}

const SYSTEM_PROMPT =
  '你是一个书签整理助手。给定一组书签（标题 + 网址），为每条书签分配一个简洁的中文分类名' +
  '（如：开发、视频、社交、购物、资讯、工具、学习、AI、搜索等，可按需新建合理分类）。' +
  '尽量复用已有分类、控制分类总数在合理范围。只返回 JSON，不要任何解释。'

interface BatchItem {
  i: number
  title: string
  url: string
}

function buildUserPrompt(items: BatchItem[]): string {
  const list = items.map((it) => `${it.i}. ${it.title} — ${it.url}`).join('\n')
  return (
    '为下面每条书签分配分类。返回 JSON 对象，形如 ' +
    '{"assignments":[{"i":0,"category":"开发"}, ...]}，i 与输入序号一一对应。\n\n' +
    list
  )
}

/** 从模型返回文本里稳健地抽取 JSON。 */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('模型未返回 JSON')
  return JSON.parse(raw.slice(start, end + 1))
}

async function callClaude(s: AISettings, items: BatchItem[]): Promise<Map<number, string>> {
  const res = await fetch(`${s.baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': s.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: s.model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(items) }],
    }),
  })
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
  return parseAssignments(text)
}

async function callOpenAI(s: AISettings, items: BatchItem[]): Promise<Map<number, string>> {
  const res = await fetch(`${s.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify({
      model: s.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(items) },
      ],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  return parseAssignments(text)
}

function parseAssignments(text: string): Map<number, string> {
  const obj = extractJson(text) as { assignments?: { i: number; category: string }[] }
  const map = new Map<number, string>()
  for (const a of obj.assignments ?? []) {
    if (typeof a.i === 'number' && typeof a.category === 'string') {
      map.set(a.i, a.category.trim())
    }
  }
  return map
}

const BATCH_SIZE = 80

export interface AIProgress {
  done: number
  total: number
}

/**
 * 调用 AI 对书签分类，返回 url -> 分类名 的映射。
 * 分批请求，任一批失败抛错（调用方可回退到本地规则）。
 */
export async function aiCategorize(
  bookmarks: Bookmark[],
  settings: AISettings,
  onProgress?: (p: AIProgress) => void,
): Promise<Map<string, string>> {
  if (!settings.apiKey) throw new Error('未配置 API Key')
  const result = new Map<string, string>()
  const call = settings.provider === 'claude' ? callClaude : callOpenAI

  for (let start = 0; start < bookmarks.length; start += BATCH_SIZE) {
    const slice = bookmarks.slice(start, start + BATCH_SIZE)
    const items: BatchItem[] = slice.map((b, idx) => ({ i: idx, title: b.title, url: b.url }))
    const assigned = await call(settings, items)
    slice.forEach((b, idx) => {
      const cat = assigned.get(idx)
      if (cat) result.set(b.url, cat)
    })
    onProgress?.({ done: Math.min(start + BATCH_SIZE, bookmarks.length), total: bookmarks.length })
  }
  return result
}
