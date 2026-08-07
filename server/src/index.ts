import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { errorHandler } from './lib/errors.js';
import { apiRouter } from './routes/api.js';
import './db/index.js';
import { purgeExpiredTrash } from './services/bookmarks.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

app.disable('x-powered-by');
app.use(cors({ origin: ['http://127.0.0.1:5178', 'http://localhost:5178'] }));
app.use(express.json({ limit: '20mb' }));
app.use('/api', apiRouter);

const webDist = resolve(process.env.WEB_DIST ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist'));
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('/{*splat}', (_req, res) => res.sendFile(resolve(webDist, 'index.html')));
}

app.use(errorHandler);

app.listen(port, host, () => {
  console.log(`LinkNest API listening at http://${host}:${port}`);
});

// 每 24 小时清理超过 30 天的回收站条目
setInterval(() => {
  try {
    const { deleted } = purgeExpiredTrash(30);
    if (deleted > 0) console.log(`Trash cleanup: purged ${deleted} expired items`);
  } catch (error) {
    console.error('Trash cleanup failed:', error);
  }
}, 24 * 60 * 60 * 1000);
