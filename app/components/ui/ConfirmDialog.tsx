'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmText?: string;
  danger?: boolean;
};

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  // 队列:并发调用 confirm() 时依次展示,先前的 await 不会因被覆盖而永久挂起
  const [queue, setQueue] = useState<PendingConfirm[]>([]);
  const pending = queue[0] ?? null;

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setQueue((old) => [...old, { ...options, resolve }]);
  }), []);

  const settle = (value: boolean) => {
    setQueue((old) => {
      const [first, ...rest] = old;
      first?.resolve(value);
      return rest;
    });
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!pending} onClose={() => settle(false)} className={pending?.danger ? 'danger' : ''} label={pending?.title}>
        {pending && <>
          <div className="modal-header"><h2>{pending.title}</h2></div>
          {pending.body && <p className="confirm-body">{pending.body}</p>}
          <div className="modal-footer">
            {/* 默认焦点放在「取消」上:危险操作不能因手滑 Enter 直接执行 */}
            <button type="button" className="button secondary" autoFocus onClick={() => settle(false)}>取消</button>
            <button
              type="button"
              className={pending.danger ? 'button danger' : 'button primary'}
              onClick={() => settle(true)}
            >
              {pending.confirmText ?? '确认'}
            </button>
          </div>
        </>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
