import { db, now } from '../db/index';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { AppError, notFound } from '../lib/errors';
import { signJwt } from '../lib/jwt';
import type { User } from '../types';

export type UserRow = {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  role: 'admin' | 'user';
  nickname: string | null;
  avatar_url: string | null;
  status: 'active' | 'disabled';
  token_version: number;
  created_at: string;
  updated_at: string;
};

export type RegisterInput = {
  username: string;
  password: string;
  email?: string | null;
  nickname?: string | null;
};

export type LoginInput = {
  account: string;
  password: string;
};

function toUser(row: UserRow, isDefaultPassword = false): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status,
    isDefaultPassword,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** PostgreSQL 唯一约束冲突(23505)→ 业务友好的 409;按约束名区分用户名/邮箱。 */
function mapUniqueViolation(error: unknown): never {
  const pgError = error as { code?: string; constraint?: string };
  if (pgError?.code === '23505') {
    if (pgError.constraint === 'idx_users_email') {
      throw new AppError(409, 'EMAIL_EXISTS', '该邮箱已被绑定');
    }
    throw new AppError(409, 'USERNAME_EXISTS', '该用户名已被注册');
  }
  throw error;
}

export async function registerUser(input: RegisterInput): Promise<{ user: User; token: string }> {
  if (process.env.ALLOW_REGISTRATION === 'false') {
    throw new AppError(403, 'REGISTRATION_DISABLED', '系统当前已关闭自由注册');
  }

  const username = input.username.trim();
  const email = input.email?.trim() || null;
  const nickname = input.nickname?.trim() || null;
  const timestamp = now();
  const passwordHash = hashPassword(input.password);

  // 唯一性靠数据库约束兜底(避免并发注册时的检查-写入竞态);RETURNING 必然返回一行
  const row = (await db.get<UserRow>(
    `INSERT INTO users (username, email, password_hash, role, nickname, status, created_at, updated_at)
     VALUES (?, ?, ?, 'user', ?, 'active', ?, ?)
     RETURNING *`,
    [username, email, passwordHash, nickname, timestamp, timestamp],
  ).catch(mapUniqueViolation))!;

  const user = toUser(row);
  const token = signJwt({ userId: user.id, username: user.username, role: user.role, ver: row.token_version ?? 0 });

  return { user, token };
}

export async function loginUser(input: LoginInput): Promise<{ user: User; token: string }> {
  const account = input.account.trim();
  // username/email 为 CITEXT,天然大小写不敏感,对应原 SQLite 的 COLLATE NOCASE
  const row = await db.get<UserRow>(`
    SELECT * FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)
  `, [account, account]);

  if (!row) {
    throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }

  if (row.status === 'disabled') {
    throw new AppError(403, 'USER_DISABLED', '该账户已被禁用，请联系管理员');
  }

  const isValid = verifyPassword(input.password, row.password_hash);
  if (!isValid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }

  const isDefaultPassword = row.id === 1 && verifyPassword('admin123', row.password_hash);
  const user = toUser(row, isDefaultPassword);
  const token = signJwt({ userId: user.id, username: user.username, role: user.role, ver: row.token_version ?? 0 });

  return { user, token };
}

export async function getUserById(id: number): Promise<User | null> {
  const row = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return null;
  const isDefaultPassword = row.id === 1 && verifyPassword('admin123', row.password_hash);
  return toUser(row, isDefaultPassword);
}

export async function changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
  const row = await db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!row) throw notFound('用户');

  const isValid = verifyPassword(oldPassword, row.password_hash);
  if (!isValid) {
    throw new AppError(400, 'INVALID_OLD_PASSWORD', '当前密码不正确');
  }

  const newHash = hashPassword(newPassword);
  // 递增 token_version:改密后所有已签发的旧 token(含可能泄露的)立即失效
  await db.run('UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?', [newHash, now(), userId]);
}

export async function updateUserProfile(
  userId: number,
  input: { nickname?: string | null; email?: string | null; avatarUrl?: string | null },
): Promise<User> {
  const current = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
  if (!current) throw notFound('用户');

  const email = input.email === undefined ? current.email : input.email?.trim() || null;
  if (email && email !== current.email) {
    const existing = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ? AND id <> ?', [email, userId]);
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', '该邮箱已被其他账户绑定');
    }
  }

  const nickname = input.nickname === undefined ? current.nickname : input.nickname?.trim() || null;
  const avatarUrl = input.avatarUrl === undefined ? current.avatar_url : input.avatarUrl?.trim() || null;

  await db.run(`
    UPDATE users SET nickname = ?, email = ?, avatar_url = ?, updated_at = ? WHERE id = ?
  `, [nickname, email, avatarUrl, now(), userId]);

  return (await getUserById(userId))!;
}
