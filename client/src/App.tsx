import { useEffect } from 'react';
import { SessionProvider, useSession } from './context/SessionContext';
import Home from './pages/Home';
import RoomPage from './pages/RoomPage';
import Toast from './components/Toast';

function Shell() {
  const { room, toast, dismissToast } = useSession();
  const toastId = toast?.id;

  useEffect(() => {
    if (!toastId) return;
    const t = window.setTimeout(dismissToast, 5000);
    return () => window.clearTimeout(t);
  }, [toastId, dismissToast]);

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
