'use client';

import { useState, useRef, useEffect } from 'react';
import { User, KeyRound, LogOut, Shield, ChevronUp, UserCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from './ui/ConfirmDialog';
import { PasswordDialog } from './PasswordDialog';
import { ProfileDialog } from './ProfileDialog';

export function UserMenu({ collapsed }: { collapsed?: boolean }) {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuOpen]);

  if (!user) return null;

  const displayName = user.nickname || user.username;
  const initial = (displayName[0] || 'U').toUpperCase();

  const handleLogout = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: '确认退出登录？',
      body: '退出后需要重新输入密码登录。',
      confirmText: '退出登录',
      danger: true,
    });
    if (ok) {
      await logout();
    }
  };

  return (
    <div className="user-menu-wrapper" ref={menuRef}>
      {menuOpen && (
        <div className="user-popup-menu" role="menu">
          <div className="user-popup-header">
            <div className="user-avatar">{initial}</div>
            <div className="user-info">
              <span className="user-name">{displayName}</span>
              <span className="user-sub">@{user.username}</span>
            </div>
            {user.role === 'admin' && <span className="user-role-badge">Admin</span>}
          </div>
          <div className="divider" />
          <button
            type="button"
            className="user-menu-item"
            onClick={() => {
              setMenuOpen(false);
              setProfileOpen(true);
            }}
          >
            <UserCheck />
            <span>个人资料</span>
          </button>
          <button
            type="button"
            className="user-menu-item"
            onClick={() => {
              setMenuOpen(false);
              setPasswordOpen(true);
            }}
          >
            <KeyRound />
            <span>修改密码</span>
          </button>
          <div className="divider" />
          <button type="button" className="user-menu-item danger" onClick={handleLogout}>
            <LogOut />
            <span>退出登录</span>
          </button>
        </div>
      )}

      <button
        type="button"
        className={`user-bar-btn ${menuOpen ? 'active' : ''} ${collapsed ? 'collapsed' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((prev) => !prev);
        }}
        title={collapsed ? `${displayName} (@${user.username})` : undefined}
      >
        <div className="user-avatar">{initial}</div>
        {!collapsed && (
          <>
            <div className="user-bar-details">
              <span className="user-bar-name">{displayName}</span>
              <span className="user-bar-role">{user.role === 'admin' ? '系统管理员' : '标准用户'}</span>
            </div>
            <ChevronUp className={`user-bar-arrow ${menuOpen ? 'open' : ''}`} />
          </>
        )}
      </button>

      <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
