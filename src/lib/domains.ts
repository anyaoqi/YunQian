// 内置 域名/关键词 -> 分类 规则，供本地自动分组使用。
// 分类名为中文，便于直接作为文件夹名。

export const UNCATEGORIZED = '未分类'

/** 域名关键片段 -> 分类。命中即归类（子串匹配主域名）。 */
export const DOMAIN_CATEGORY: Record<string, string> = {
  // 开发
  'github.com': '开发',
  'gitlab.com': '开发',
  'stackoverflow.com': '开发',
  'stackexchange.com': '开发',
  'developer.mozilla.org': '开发',
  'npmjs.com': '开发',
  'pypi.org': '开发',
  'docker.com': '开发',
  'kubernetes.io': '开发',
  'juejin.cn': '开发',
  'csdn.net': '开发',
  'segmentfault.com': '开发',
  'leetcode.com': '开发',
  'leetcode.cn': '开发',
  'readthedocs.io': '开发',
  'devdocs.io': '开发',

  // 视频
  'youtube.com': '视频',
  'youtu.be': '视频',
  'bilibili.com': '视频',
  'netflix.com': '视频',
  'iqiyi.com': '视频',
  'youku.com': '视频',
  'twitch.tv': '视频',
  'douyu.com': '视频',
  'v.qq.com': '视频',

  // 社交
  'twitter.com': '社交',
  'x.com': '社交',
  'facebook.com': '社交',
  'instagram.com': '社交',
  'weibo.com': '社交',
  'zhihu.com': '社交',
  'reddit.com': '社交',
  'linkedin.com': '社交',
  'douban.com': '社交',
  'tieba.baidu.com': '社交',
  'discord.com': '社交',
  't.me': '社交',

  // 购物
  'taobao.com': '购物',
  'tmall.com': '购物',
  'jd.com': '购物',
  'amazon.com': '购物',
  'amazon.cn': '购物',
  'pinduoduo.com': '购物',
  'ebay.com': '购物',
  'aliexpress.com': '购物',
  'apple.com': '购物',

  // 资讯
  'news.ycombinator.com': '资讯',
  'sina.com.cn': '资讯',
  'qq.com': '资讯',
  '163.com': '资讯',
  'sohu.com': '资讯',
  'bbc.com': '资讯',
  'cnn.com': '资讯',
  'nytimes.com': '资讯',
  'theverge.com': '资讯',
  '36kr.com': '资讯',
  'ifanr.com': '资讯',

  // 工具 / 效率
  'notion.so': '工具',
  'figma.com': '工具',
  'canva.com': '工具',
  'trello.com': '工具',
  'translate.google.com': '工具',
  'wolframalpha.com': '工具',
  'tinypng.com': '工具',

  // AI
  'openai.com': 'AI',
  'chatgpt.com': 'AI',
  'claude.ai': 'AI',
  'anthropic.com': 'AI',
  'huggingface.co': 'AI',
  'midjourney.com': 'AI',
  'kimi.moonshot.cn': 'AI',
  'tongyi.aliyun.com': 'AI',

  // 学习 / 文档
  'wikipedia.org': '学习',
  'coursera.org': '学习',
  'udemy.com': '学习',
  'bilibili.com/cheese': '学习',
  'mooc.cn': '学习',
  'zh.wikipedia.org': '学习',

  // 搜索引擎
  'google.com': '搜索',
  'bing.com': '搜索',
  'baidu.com': '搜索',
  'duckduckgo.com': '搜索',
}

/** 标题/URL 关键词 -> 分类，作为域名未命中时的补充判断。 */
export const KEYWORD_CATEGORY: { keywords: string[]; category: string }[] = [
  { keywords: ['docs', '文档', 'documentation', 'api reference', 'manual'], category: '开发' },
  { keywords: ['blog', '博客'], category: '资讯' },
  { keywords: ['tutorial', '教程', 'course', '课程'], category: '学习' },
  { keywords: ['shop', 'store', '商城', '购买'], category: '购物' },
]

/** 给定域名、标题，返回分类名；都未命中返回 null。 */
export function ruleCategory(domain: string, title: string, url: string): string | null {
  if (domain) {
    for (const key of Object.keys(DOMAIN_CATEGORY)) {
      if (domain === key || domain.endsWith('.' + key) || domain.includes(key)) {
        return DOMAIN_CATEGORY[key]
      }
    }
  }
  const hay = `${title} ${url}`.toLowerCase()
  for (const rule of KEYWORD_CATEGORY) {
    if (rule.keywords.some((k) => hay.includes(k.toLowerCase()))) return rule.category
  }
  return null
}
