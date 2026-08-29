/**
 * PostgreSQL 迁移端到端验证(针对本地运行的应用实例)。
 * 前置:embedded PG 已启动(.pgdata)、旧版 SQLite 夹具在 app/data/yunqian.db、
 *       应用已在 BASE_URL(默认 http://127.0.0.1:3100)以生产模式运行。
 * 用法:node scripts/e2e-pg.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.E2E_BASE || 'http://127.0.0.1:3100';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
  }
}

function extractCookie(setCookieHeader) {
  return /token=([^;]+)/.exec(setCookieHeader ?? '')?.[1];
}

async function api(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Cookie'] = `token=${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  let data = null;
  const text = await response.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, setCookie: response.headers.get('set-cookie') };
}

async function main() {
  console.log(`E2E 目标: ${BASE}\n`);

  // ---- 1. 健康检查(首次请求触发 DDL + SQLite 迁移) ----
  console.log('[1] 健康检查 & 自动迁移');
  const health = await api('GET', '/api/health');
  check('GET /api/health → 200 ok db:up', health.status === 200 && health.data?.ok === true && health.data?.db === 'up', health.data);

  // ---- 2. 迁移后的账号能登录,id 保持不变(JWT 兼容) ----
  console.log('[2] 存量用户登录(数据迁移验证)');
  const login = await api('POST', '/api/auth/login', { body: { account: 'alice', password: 'alice12345' } });
  check('alice 登录成功', login.status === 200 && login.data?.user?.username === 'alice', login.data);
  check('alice id 保持为 2(自增序列迁移正确)', login.data?.user?.id === 2, login.data?.user);
  const aliceTokenValue = extractCookie(login.setCookie);
  check('下发 HttpOnly Cookie', Boolean(aliceTokenValue));

  // 大小写不敏感登录(CITEXT)
  const loginUpper = await api('POST', '/api/auth/login', { body: { account: 'ALICE', password: 'alice12345' } });
  check('用户名大写 ALICE 也能登录(CITEXT 生效)', loginUpper.status === 200, loginUpper.data);

  // 邮箱登录
  const loginEmail = await api('POST', '/api/auth/login', { body: { account: 'alice@example.com', password: 'alice12345' } });
  check('邮箱登录成功', loginEmail.status === 200, loginEmail.data);

  // ---- 3. 迁移的书签/分类/标签(camelCase 键、CTE、聚合) ----
  console.log('[3] 迁移数据完整性');
  const list = await api('GET', '/api/bookmarks?all=true', { token: aliceTokenValue });
  check('书签列表 200', list.status === 200, list.data);
  check('alice 有 2 条未删除书签(回收站 1 条不计入)', list.data?.total === 2 && list.data?.items?.length === 2, list.data?.total);
  const github = list.data?.items?.find((b) => b.url === 'https://github.com/');
  check('书签 camelCase 字段完整(quoted alias)', Boolean(github && github.faviconUrl !== undefined && github.createdAt && github.clickCount === 42), github);
  check('github 收藏状态迁移(is_favorite=1)', github?.isFavorite === true, github?.isFavorite);
  check('书签标签迁移', Array.isArray(github?.tags) && github.tags.includes('开发'), github?.tags);
  check('分类路径 CTE 返回 camelCase', Array.isArray(github?.categoryPath) && github.categoryPath.length === 1, github?.categoryPath);

  const collections = await api('GET', '/api/collections', { token: aliceTokenValue });
  const root = collections.data?.find?.((c) => c.name === '工作');
  check('分类树:工作 → 前端开发(父子关系迁移)', collections.status === 200 && root?.children?.some((c) => c.name === '前端开发'), collections.data);
  check('分类计数为 number(聚合 SUM/COUNT 解析)', typeof root?.bookmarkCount === 'number' && root?.bookmarkCount === 1 && root?.favoriteCount === 1, root?.bookmarkCount);

  const stats = await api('GET', '/api/stats', { token: aliceTokenValue });
  check('统计:2 书签 2 分类 2 标签 1 回收站', stats.data?.bookmarks === 2 && stats.data?.collections === 2 && stats.data?.tags === 2 && stats.data?.trashed === 1, stats.data);

  const trash = await api('GET', '/api/trash', { token: aliceTokenValue });
  check('回收站含 example.com', trash.status === 200 && trash.data?.some?.((b) => b.url === 'https://example.com/' && b.deletedAt), trash.data?.length);

  // ---- 4. 新书签 CRUD ----
  console.log('[4] 增删改查');
  const created = await api('POST', '/api/bookmarks', {
    token: aliceTokenValue,
    body: { url: 'https://postgresql.org', title: 'PostgreSQL', collectionId: root.id, tags: ['数据库', '开发'], isFavorite: true },
  });
  check('创建书签 201', created.status === 201 && created.data?.id > 0, created.data);
  check('新书签含标签(含已有标签关联)', created.data?.tags?.includes('开发') && created.data?.tags?.includes('数据库'), created.data?.tags);

  const dup = await api('POST', '/api/bookmarks', { token: aliceTokenValue, body: { url: 'https://github.com/' } });
  check('重复 URL 返回 409', dup.status === 409, dup.status);

  const updated = await api('PATCH', `/api/bookmarks/${created.data.id}`, { token: aliceTokenValue, body: { title: 'PostgreSQL 官网', note: '数据库主页' } });
  check('更新书签 200 且字段生效', updated.status === 200 && updated.data?.title === 'PostgreSQL 官网' && updated.data?.note === '数据库主页', updated.data);

  const visited = await api('POST', `/api/bookmarks/${created.data.id}/visit`, { token: aliceTokenValue });
  check('访问计数 clickCount=1', visited.status === 200 && visited.data?.clickCount === 1, visited.data);

  const tagMerge = await api('GET', '/api/tags', { token: aliceTokenValue });
  const tagDev = tagMerge.data?.find?.((t) => t.name === '开发');
  const tagDb = tagMerge.data?.find?.((t) => t.name === '数据库');
  const merged = await api('POST', `/api/tags/${tagDb.id}/merge/${tagDev.id}`, { token: aliceTokenValue });
  check('标签合并 200', merged.status === 200 && typeof merged.data?.moved === 'number', merged.data);

  const del = await api('DELETE', `/api/bookmarks/${created.data.id}`, { token: aliceTokenValue });
  check('删除书签 204(进回收站)', del.status === 204, del.status);

  const exported = await api('GET', '/api/export', { token: aliceTokenValue });
  check('JSON 导出包含书签与标签', exported.status === 200 && exported.data?.bookmarks?.length === 2 && exported.data?.tags?.length === 2, exported.data?.bookmarks?.length);

  // ---- 5. 注册 & 约束 ----
  console.log('[5] 注册与唯一约束');
  const reg = await api('POST', '/api/auth/register', { body: { username: 'charlie', password: 'charlie12345', email: 'charlie@example.com' } });
  check('新用户注册 201,新 id 从 4 开始(序列正确)', reg.status === 201 && reg.data?.user?.id === 4, reg.data);

  const regDup = await api('POST', '/api/auth/register', { body: { username: 'ALICE', password: 'whatever123' } });
  check('用户名大小写不同仍判重(CITEXT 唯一索引)', regDup.status === 409 && regDup.data?.error?.code === 'USERNAME_EXISTS', regDup.data);

  const charlieLogin = await api('POST', '/api/auth/login', { body: { account: 'charlie', password: 'charlie12345' } });
  check('新用户可登录', charlieLogin.status === 200, charlieLogin.data);

  // ---- 8. admin ----
  console.log('[8] 管理员');
  const adminLogin = await api('POST', '/api/auth/login', { body: { account: 'admin', password: 'admin123' } });
  check('迁移后的 admin 可登录且提示默认密码', adminLogin.status === 200 && adminLogin.data?.user?.isDefaultPassword === true, adminLogin.data?.user);


  // ---- 6. 限流 ----
  console.log('[6] 登录限流');
  let lastStatus = 0;
  let lastCode = '';
  for (let i = 0; i < 7; i++) {
    const r = await api('POST', '/api/auth/login', { body: { account: 'bob', password: 'wrong-password' } });
    lastStatus = r.status;
    lastCode = r.data?.error?.code ?? '';
    if (r.status === 429) break;
  }
  check('连续失败后返回 429(IP 上限或账号锁定)', lastStatus === 429 && ['RATE_LIMITED', 'ACCOUNT_LOCKED'].includes(lastCode), { lastStatus, lastCode });
  const bobLocked = await api('POST', '/api/auth/login', { body: { account: 'bob', password: 'bob12345678' } });
  check('锁定期间正确密码也拒绝', bobLocked.status === 429, bobLocked.status);

  // ---- 7. 越权隔离(IDOR) ----
  console.log('[7] 数据隔离');
  const charlieToken = extractCookie(charlieLogin.setCookie);
  const aliceList = await api('GET', '/api/bookmarks?all=true', { token: aliceTokenValue });
  const firstAliceId = aliceList.data?.items?.[0]?.id;
  const cross = await api('GET', `/api/bookmarks/${firstAliceId}`, { token: charlieToken });
  check('他人书签 404(跨用户隔离保持)', cross.status === 404, cross.status);

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  if (failed > 0) {
    console.error('失败项:', failures.join(' | '));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('E2E 运行异常:', error);
  process.exit(1);
});
