'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Shield, Calendar, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from './ui/Toast';
import { Modal, ModalHeader } from './ui/Modal';

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && open) {
      setNickname(user.nickname ?? '');
      setEmail(user.email ?? '');
      setError('');
    }
  }, [user, open]);

  if (!user) return null;

  const displayName = user.nickname || user.username;
  const initial = (displayName[0] || 'U').toUpperCase();
  const createdDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');
      await updateProfile({
        nickname: nickname.trim() || null,
        email: email.trim() || null,
      });
      toast.push('success', '个人资料已成功保存');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新资料失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="个人资料" className="profile-modal">
      <ModalHeader title="个人资料与设置" />

      {/* 头部身份卡片 */}
      <div className="profile-hero-card">
        <div className="profile-hero-avatar">
          <span>{initial}</span>
        </div>
        <div className="profile-hero-main">
          <div className="profile-hero-name-row">
            <span className="profile-hero-name">{displayName}</span>
            <span className={`profile-role-pill ${user.role === 'admin' ? 'admin' : 'user'}`}>
              <Shield aria-hidden />
              <span>{user.role === 'admin' ? '系统管理员' : '标准用户'}</span>
            </span>
          </div>
          <div className="profile-hero-meta">
            <span className="profile-meta-item">
              <User aria-hidden />
              <span className="mono">@{user.username}</span>
            </span>
            <span className="profile-meta-item">
              <Calendar aria-hidden />
              <span>注册于 {createdDate}</span>
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="dialog-form profile-form">
        {error && (
          <div className="error-banner">
            <AlertCircle aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <div className="profile-field-group">
          <div className="form-field">
            <label className="field-label-with-icon">
              <Lock aria-hidden />
              <span>用户名（登录账号）</span>
            </label>
            <div className="input-with-icon disabled">
              <input
                type="text"
                className="input"
                value={user.username}
                disabled
                readOnly
              />
              <span className="input-lock-tag">不可修改</span>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="profile-nickname" className="field-label-with-icon">
              <User aria-hidden />
              <span>显示昵称</span>
            </label>
            <input
              id="profile-nickname"
              type="text"
              className="input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="请输入您希望展示的昵称"
              maxLength={50}
            />
          </div>

          <div className="form-field">
            <label htmlFor="profile-email" className="field-label-with-icon">
              <Mail aria-hidden />
              <span>绑定邮箱</span>
            </label>
            <input
              id="profile-email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com（可选）"
              maxLength={100}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button type="submit" className="button primary" disabled={submitting}>
            {submitting ? '保存中...' : '保存更改'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
