'use client';

import { useState, useEffect } from 'react';
import { KeyRound, Lock, Eye, EyeOff, Check, X, ShieldAlert, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from './ui/Toast';
import { Modal, ModalHeader } from './ui/Modal';

export function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 明文可见状态
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setShowOld(false);
      setShowNew(false);
      setShowConfirm(false);
    }
  }, [open]);

  const hasLength = newPassword.length >= 6;
  const isMatch = Boolean(newPassword && confirmPassword && newPassword === confirmPassword);
  const canSubmit = Boolean(oldPassword && hasLength && isMatch && !submitting);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      setError('请输入当前密码');
      return;
    }
    if (!hasLength) {
      setError('新密码长度不能少于 6 位');
      return;
    }
    if (!isMatch) {
      setError('两次输入的新密码不一致');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await changePassword({ oldPassword, newPassword });
      toast.push('success', '登录密码已成功更新，请妥善保管');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="修改密码" className="password-modal">
      <ModalHeader title="修改登录密码" />

      {/* 安全提示横幅 */}
      <div className={`password-security-banner ${user?.isDefaultPassword ? 'warning' : 'info'}`}>
        {user?.isDefaultPassword ? (
          <>
            <ShieldAlert className="banner-icon" aria-hidden />
            <div className="banner-text">
              <strong>检测到初始默认密码</strong>
              <span>您当前仍在使用系统默认密码（admin123），建议立即更换为专属密码。</span>
            </div>
          </>
        ) : (
          <>
            <ShieldCheck className="banner-icon" aria-hidden />
            <div className="banner-text">
              <strong>账号安全保护</strong>
              <span>请设置包含字母与数字的组合密码，修改成功后下次登录生效。</span>
            </div>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="dialog-form password-form">
        {error && (
          <div className="error-banner">
            <AlertCircle aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <div className="password-field-group">
          <div className="form-field">
            <label htmlFor="old-password">当前密码</label>
            <div className="password-input-wrapper">
              <Lock className="input-prefix-icon" aria-hidden />
              <input
                id="old-password"
                type={showOld ? 'text' : 'password'}
                className="input password-input"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入当前正在使用的密码"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowOld((prev) => !prev)}
                title={showOld ? '隐藏密码' : '显示密码'}
                aria-label={showOld ? '隐藏密码' : '显示密码'}
              >
                {showOld ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="new-password">新密码</label>
            <div className="password-input-wrapper">
              <KeyRound className="input-prefix-icon" aria-hidden />
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                className="input password-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 6 位字符"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowNew((prev) => !prev)}
                title={showNew ? '隐藏密码' : '显示密码'}
                aria-label={showNew ? '隐藏密码' : '显示密码'}
              >
                {showNew ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="confirm-password">确认新密码</label>
            <div className="password-input-wrapper">
              <KeyRound className="input-prefix-icon" aria-hidden />
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                className="input password-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirm((prev) => !prev)}
                title={showConfirm ? '隐藏密码' : '显示密码'}
                aria-label={showConfirm ? '隐藏密码' : '显示密码'}
              >
                {showConfirm ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>
        </div>

        {/* 密码强度/匹配实时状态指示器 */}
        <div className="password-checklist">
          <div className={`check-item ${hasLength ? 'valid' : ''}`}>
            {hasLength ? <Check className="check-icon" /> : <span className="check-dot" />}
            <span>密码长度至少 6 位字符</span>
          </div>
          <div className={`check-item ${isMatch ? 'valid' : ''}`}>
            {isMatch ? <Check className="check-icon" /> : <span className="check-dot" />}
            <span>两次输入的新密码一致</span>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button type="submit" className="button primary" disabled={!canSubmit}>
            {submitting ? '提交修改中...' : '确认更新密码'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
