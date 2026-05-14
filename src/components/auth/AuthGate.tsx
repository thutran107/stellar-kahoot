import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const init = useAuthStore((s) => s.init);
  useEffect(() => { init(); }, [init]);
  return <>{children}</>;
}
