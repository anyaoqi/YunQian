/**
 * Next.js 服务启动时执行一次(nodejs runtime)。
 * 在这里做生产环境关键配置的兜底校验:缺配置直接终止进程(fail-fast),
 * 让部署平台的健康检查/重启策略立刻发现问题,而不是带病运行返回 500。
 */
function fail(messages: string[]): never {
  for (const message of messages) console.error(`[startup] ${message}`);
  process.exit(1);
}

export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;

  const problems: string[] = [];

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    problems.push(
      '生产环境必须配置 JWT_SECRET 环境变量(至少 32 个字符)。' +
        '生成方式: node -e "console.log(require(\'node:crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }

  if (!process.env.DATABASE_URL) {
    problems.push(
      '生产环境必须配置 DATABASE_URL(PostgreSQL 连接串)。' +
        'Railway 部署: 为服务添加 PostgreSQL 插件并引用 ${{Postgres.DATABASE_URL}}。',
    );
  }

  if (problems.length > 0) fail(problems);
}
