import type { DatabaseSync } from 'node:sqlite';
import { getDb, inTransaction, now } from '../db/index';
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

const DEFAULT_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';

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

/**
 * 确保默认管理员账户存在。如果 users 表为空，则初始化管理员 admin (id=1)。
 */
export function ensureAdminUserExists(db: DatabaseSync): void {
  const admin = db.prepare('SELECT id FROM users WHERE id = 1').get() as { id: number } | undefined;
  if (!admin) {
    const timestamp = now();
    const passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, nickname, status, created_at, updated_at)
      VALUES (1, 'admin', NULL, ?, 'admin', '系统管理员', 'active', ?, ?)
    `).run(passwordHash, timestamp, timestamp);
  }
}

export function registerUser(input: RegisterInput): { user: User; token: string } {
  if (process.env.ALLOW_REGISTRATION === 'false') {
    throw new AppError(403, 'REGISTRATION_DISABLED', '系统当前已关闭自由注册');
  }

  const username = input.username.trim();
  const email = input.email?.trim() || null;
  const nickname = input.nickname?.trim() || null;

  const existingName = getDb().prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingName) {
    throw new AppError(409, 'USERNAME_EXISTS', '该用户名已被注册');
  }

  if (email) {
    const existingEmail = getDb().prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      throw new AppError(409, 'EMAIL_EXISTS', '该邮箱已被绑定');
    }
  }

  const timestamp = now();
  const passwordHash = hashPassword(input.password);

  const id = inTransaction(() => {
    const result = getDb().prepare(`
      INSERT INTO users (username, email, password_hash, role, nickname, status, created_at, updated_at)
      VALUES (?, ?, ?, 'user', ?, 'active', ?, ?)
    `).run(username, email, passwordHash, nickname, timestamp, timestamp);
    return Number(result.lastInsertRowid);
  });

  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
  const user = toUser(row);
  const token = signJwt({ userId: user.id, username: user.username, role: user.role });

  return { user, token };
}

export function loginUser(input: LoginInput): { user: User; token: string } {
  const account = input.account.trim();
  const row = getDb().prepare(`
    SELECT * FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)
  `).get(account, account) as UserRow | undefined;

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
  const token = signJwt({ userId: user.id, username: user.username, role: user.role });

  return { user, token };
}

export function getUserById(id: number): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row) return null;
  const isDefaultPassword = row.id === 1 && verifyPassword('admin123', row.password_hash);
  return toUser(row, isDefaultPassword);
}

export function changePassword(userId: number, oldPassword: string, newPassword: string): void {
  const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
  if (!row) throw notFound('用户');

  const isValid = verifyPassword(oldPassword, row.password_hash);
  if (!isValid) {
    throw new AppError(400, 'INVALID_OLD_PASSWORD', '当前密码不正确');
  }

  const newHash = hashPassword(newPassword);
  getDb().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, now(), userId);
}

export function updateUserProfile(
  userId: number,
  input: { nickname?: string | null; email?: string | null; avatarUrl?: string | null },
): User {
  const current = getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!current) throw notFound('用户');

  const email = input.email === undefined ? current.email : input.email?.trim() || null;
  if (email && email !== current.email) {
    const existing = getDb().prepare('SELECT id FROM users WHERE email = ? AND id <> ?').get(email, userId);
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', '该邮箱已被其他账户绑定');
    }
  }

  const nickname = input.nickname === undefined ? current.nickname : input.nickname?.trim() || null;
  const avatarUrl = input.avatarUrl === undefined ? current.avatar_url : input.avatarUrl?.trim() || null;

  getDb().prepare(`
    UPDATE users SET nickname = ?, email = ?, avatar_url = ?, updated_at = ? WHERE id = ?
  `).run(nickname, email, avatarUrl, now(), userId);

  return getUserById(userId)!;
}
