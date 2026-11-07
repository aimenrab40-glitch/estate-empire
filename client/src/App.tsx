import { useEffect } from 'react';
import { SessionProvider, useSession } from './context/SessionContext';
import Home from './pages/Home';
import RoomPage from './pages/RoomPage';
import LoginPage from './pages/LoginPage';
import Toast from './components/Toast';

function Shell() {
  const { room, toast, dismissToast, user, authLoading } = useSession();
  const toastId = toast?.id;

  useEffect(() => {
    if (!toastId) return;
    const t = window.setTimeout(dismissToast, 5000);
    return () => window.clearTimeout(t);
  }, [toastId, dismissToast]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-slate-400">
        <div className="animate-fade text-center">
          <img src="/supernova-favicon.svg" alt="SUPER NOVA" className="sn-logo-glow mx-auto mb-3 h-14 w-14 rounded-2xl" />
          <div>Connecting to SUPER NOVA…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-full">
      {room ? <RoomPage /> : <Home />}
      {toast && <Toast text={toast.text} kind={toast.kind} onDismiss={dismissToast} />}
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
