'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
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
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    const item = { ...options, resolve };
    pendingRef.current = item;
    setPending(item);
  }), []);

  const settle = (value: boolean) => {
    pendingRef.current?.resolve(value);
    pendingRef.current = null;
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!pending} onClose={() => settle(false)} className={pending?.danger ? 'danger' : ''} label={pending?.title}>
        {pending && <>
          <div className="modal-header"><h2>{pending.title}</h2></div>
          {pending.body && <p className="confirm-body">{pending.body}</p>}
          <div className="modal-footer">
            <button type="button" className="button secondary" onClick={() => settle(false)}>取消</button>
            <button
              type="button"
              className={pending.danger ? 'button danger' : 'button primary'}
              autoFocus
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
