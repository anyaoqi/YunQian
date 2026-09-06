'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserPlus, KeyRound, User as UserIcon, Mail, Smile, AlertCircle } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { safeRedirectTarget } from '@/lib/safeRedirect';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="auth-page-loading">加载中...</div>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = safeRedirectTarget(searchParams.get('redirect'));
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().length < 3) {
      setError('用户名长度至少为 3 位字符');
      return;
    }
    if (password.length < 6) {
      setError('密码长度至少为 6 位字符');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await register({
        username: username.trim(),
        password,
        nickname: nickname.trim() || null,
        email: email.trim() || null,
      });
      // replace 避免在历史栈留下 /register,防止回退键重新触发鉴权页回环
      router.replace(redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请重试');
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
          <p className="auth-subtitle">创建你的专属云书签工作区</p>
        </div>

        {error && (
          <div className="error-banner">
            <AlertCircle aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-field">
            <label htmlFor="username">用户名 <span className="field-required">*</span></label>
            <div className="auth-input-wrapper">
              <UserIcon className="auth-input-icon" aria-hidden />
              <input
                id="username"
                type="text"
                className="input auth-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="3~30 位字母、数字或字符"
                autoComplete="username"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="nickname">用户昵称</label>
            <div className="auth-input-wrapper">
              <Smile className="auth-input-icon" aria-hidden />
              <input
                id="nickname"
                type="text"
                className="input auth-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="展示昵称（可选）"
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="email">邮箱地址</label>
            <div className="auth-input-wrapper">
              <Mail className="auth-input-icon" aria-hidden />
              <input
                id="email"
                type="email"
                className="input auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com（可选）"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="password">设置密码 <span className="field-required">*</span></label>
            <div className="auth-input-wrapper">
              <KeyRound className="auth-input-icon" aria-hidden />
              <input
                id="password"
                type="password"
                className="input auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位字符"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="confirmPassword">确认密码 <span className="field-required">*</span></label>
            <div className="auth-input-wrapper">
              <KeyRound className="auth-input-icon" aria-hidden />
              <input
                id="confirmPassword"
                type="password"
                className="input auth-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <button type="submit" className="button primary auth-submit-btn" disabled={submitting}>
            <UserPlus />
            <span>{submitting ? '注册中...' : '注 册 账 户'}</span>
          </button>
        </form>

        <div className="auth-footer">
          <span>已有账号？</span>
          <Link href={`/login${redirectPath !== '/' ? `?redirect=${encodeURIComponent(redirectPath)}` : ''}`} className="auth-link">
            返回登录
          </Link>
        </div>
      </div>
    </div>
  );
}
