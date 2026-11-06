import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import s from './toast.module.css';

type Toast = { id: number; text: string; tone: 'success' | 'error' };
const Ctx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      {createPortal(
        <div className={s.stack} aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`${s.toast} ${t.tone === 'error' ? s.err : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
              {t.tone === 'error' ? <IconAlertCircle size={18} /> : <IconCircleCheck size={18} />}
              <span>{t.text}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
