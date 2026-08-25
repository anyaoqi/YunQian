'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, KeyRound, User as UserIcon, AlertCircle } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-page-loading">加载中...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';
  const { login } = useAuth();

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account.trim()) {
      setError('请输入用户名或邮箱');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await login({ account: account.trim(), password });
      router.push(redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查账号密码');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-row">
            <Logo size={36} className="brand-mark" />
            <span className="auth-brand-title">云签 YunQian</span>
          </div>
          <p className="auth-subtitle">跨浏览器云书签与链接导航</p>
        </div>

        {error && (
          <div className="error-banner">
            <AlertCircle aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-field">
            <label htmlFor="account">账号</label>
            <div className="auth-input-wrapper">
              <UserIcon className="auth-input-icon" aria-hidden />
              <input
                id="account"
                type="text"
                className="input auth-input"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="用户名 或 绑定的邮箱"
                autoComplete="username"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="password">密码</label>
            <div className="auth-input-wrapper">
              <KeyRound className="auth-input-icon" aria-hidden />
              <input
                id="password"
                type="password"
                className="input auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="登录密码"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <button type="submit" className="button primary auth-submit-btn" disabled={submitting}>
            <LogIn />
            <span>{submitting ? '登录中...' : '登 录'}</span>
          </button>
        </form>

        <div className="auth-footer">
          <span>还没有账号？</span>
          <Link href={`/register${redirectPath !== '/' ? `?redirect=${encodeURIComponent(redirectPath)}` : ''}`} className="auth-link">
            立即注册
          </Link>
        </div>
      </div>
    </div>
  );
}
