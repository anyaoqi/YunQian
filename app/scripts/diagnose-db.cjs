// 只读诊断:直接查 SQLite,绕过两个 dev server,确认存储层损伤
const { DatabaseSync } = require('node:sqlite');

function hexOf(str) {
  const buf = Buffer.from(str, 'utf8');
  return buf.toString('hex').match(/../g).join(' ');
}

function show(dbPath, label) {
  console.log(`\n===== ${label} (${dbPath}) =====`);
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch (e) {
    console.log('open failed:', e.message);
    return;
  }
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    console.log('tables:', tables.join(', '));
    if (tables.includes('collections')) {
      const rows = db.prepare('SELECT id, name, icon, color FROM collections ORDER BY id').all();
      for (const r of rows) {
        console.log(`collection#${r.id} name="${r.name}" icon=${JSON.stringify(r.icon)} hex(name)=${hexOf(String(r.name))}`);
      }
    }
    if (tables.includes('bookmarks')) {
      const rows = db.prepare('SELECT id, title, url FROM bookmarks ORDER BY id LIMIT 8').all();
      for (const r of rows) console.log(`bookmark#${r.id} title="${r.title}" hex=${hexOf(String(r.title))}`);
      const total = db.prepare('SELECT count(*) c FROM bookmarks').get();
      console.log('bookmark count:', total.c);
    }
    if (tables.includes('tags')) {
      const rows = db.prepare('SELECT id, name FROM tags ORDER BY id LIMIT 10').all();
      for (const r of rows) console.log(`tag#${r.id} name="${r.name}" hex=${hexOf(String(r.name))}`);
    }
  } catch (e) {
    console.log('query failed:', e.message);
  } finally {
    db.close();
  }
}

show('D:/Project/Bookmark-Pool/app/data/yunqian.db', '当前库 app/data/yunqian.db');
show('D:/Project/Bookmark-Pool/server/data/yunqian.db', '旧库 server/data/yunqian.db');
