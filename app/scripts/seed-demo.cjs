/**
 * 重建演示数据：清空并重新写入分类 / 标签 / 书签（UTF-8 安全写入）。
 * 用法：node app/scripts/seed-demo.cjs
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = process.argv[2] || path.resolve(__dirname, '../data/yunqian.db');
const db = new DatabaseSync(dbPath);

const now = () => new Date().toISOString();
const ts = now();

const collections = [
  { name: '工作', icon: '💼', color: '#4f7cff', sort: 0 },
  { name: '学习阅读', icon: '📚', color: '#22b573', sort: 1 },
  { name: '设计与灵感', icon: '🎨', color: '#9b59b6', sort: 2 },
  { name: '生活娱乐', icon: '🏠', color: '#e67e22', sort: 3 },
];

const tags = [
  { name: '前端', color: '#e74c3c' },
  { name: '开发', color: '#3498db' },
  { name: '文档', color: '#1abc9c' },
  { name: '设计', color: '#9b59b6' },
  { name: '效率', color: '#2ecc71' },
  { name: '学习', color: '#f39c12' },
  { name: '资源', color: '#16a085' },
  { name: '资讯', color: '#95a5a6' },
];

const bookmarks = [
  { url: 'https://github.com', title: 'GitHub', description: '代码托管与协作平台', collection: '工作', tags: ['开发', '效率'], favorite: true },
  { url: 'https://developer.mozilla.org', title: 'MDN Web Docs', description: 'Web 开发权威文档', collection: '学习阅读', tags: ['文档', '前端'] },
  { url: 'https://stackoverflow.com', title: 'Stack Overflow', description: '程序员问答社区', collection: '工作', tags: ['开发', '效率'] },
  { url: 'https://www.figma.com', title: 'Figma', description: '在线协作设计工具', collection: '设计与灵感', tags: ['设计', '效率'] },
  { url: 'https://dribbble.com', title: 'Dribbble', description: '设计师作品分享社区', collection: '设计与灵感', tags: ['设计', '资源'] },
  { url: 'https://coolors.co', title: 'Coolors', description: '配色方案生成器', collection: '设计与灵感', tags: ['设计', '资源'] },
  { url: 'https://fonts.google.com', title: 'Google Fonts', description: '免费开源字体库', collection: '设计与灵感', tags: ['设计', '资源'] },
  { url: 'https://www.ruanyifeng.com/blog/', title: '阮一峰的网络日志', description: '科技博客与技术随笔', collection: '学习阅读', tags: ['学习', '前端'] },
  { url: 'https://juejin.cn', title: '掘金', description: '中文技术内容社区', collection: '工作', tags: ['前端', '资讯'] },
  { url: 'https://news.ycombinator.com', title: 'Hacker News', description: '极客新闻与讨论', collection: '工作', tags: ['资讯'] },
  { url: 'https://arxiv.org', title: 'arXiv', description: '学术预印本库', collection: '学习阅读', tags: ['学习'] },
  { url: 'https://web.dev', title: 'web.dev', description: '现代 Web 开发指南', collection: '学习阅读', tags: ['前端', '文档'] },
  { url: 'https://www.bilibili.com', title: '哔哩哔哩', description: '视频与直播平台', collection: '生活娱乐', tags: ['资讯'] },
  { url: 'https://www.zhihu.com', title: '知乎', description: '中文问答社区', collection: '生活娱乐', tags: ['学习', '资讯'] },
];

db.exec('PRAGMA foreign_keys = OFF;');
db.exec(`
  DELETE FROM bookmark_tags;
  DELETE FROM bookmarks;
  DELETE FROM tags;
  DELETE FROM collections;
  DELETE FROM sqlite_sequence;
`);
db.exec('PRAGMA foreign_keys = ON;');

const collIds = {};
for (const c of collections) {
  const r = db.prepare(
    'INSERT INTO collections (name, icon, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(c.name, c.icon, c.color, c.sort, ts, ts);
  collIds[c.name] = Number(r.lastInsertRowid);
}

const tagIds = {};
for (const t of tags) {
  const r = db.prepare('INSERT INTO tags (name, color, created_at) VALUES (?, ?, ?)').run(t.name, t.color, ts);
  tagIds[t.name] = Number(r.lastInsertRowid);
}

for (const b of bookmarks) {
  const r = db.prepare(
    `INSERT INTO bookmarks (collection_id, url, title, description, is_favorite, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(collIds[b.collection], b.url, b.title, b.description, b.favorite ? 1 : 0, ts, ts);
  const bid = Number(r.lastInsertRowid);
  for (const t of b.tags) {
    db.prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)').run(bid, tagIds[t]);
  }
}

const textCols = [
  'SELECT name FROM collections',
  'SELECT name FROM tags',
  'SELECT url, title, COALESCE(description, \'\') FROM bookmarks',
];
let bad = 0;
for (const sql of textCols) {
  for (const row of db.prepare(sql).all()) {
    for (const v of Object.values(row)) {
      if (typeof v === 'string' && v.includes('\uFFFD')) { bad++; console.log('CORRUPT:', sql, v); }
    }
  }
}

const c = db.prepare('SELECT COUNT(*) n FROM collections').get().n;
const t = db.prepare('SELECT COUNT(*) n FROM tags').get().n;
const b = db.prepare('SELECT COUNT(*) n FROM bookmarks').get().n;
const bt = db.prepare('SELECT COUNT(*) n FROM bookmark_tags').get().n;
console.log(`collections=${c} tags=${t} bookmarks=${b} bookmark_tags=${bt}`);
console.log(bad === 0 ? 'OK: no U+FFFD replacement characters' : `FAIL: ${bad} corrupted values`);
db.close();
process.exit(bad === 0 ? 0 : 1);
