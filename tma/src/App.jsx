import { useEffect, useState } from 'react';
import { api } from './api';
import { getAuthHeader, tgUserLang } from './telegram';
import { useT } from './i18n';
import Loader from './components/Loader';
import Card from './components/Card';
import TabBar from './components/TabBar';
import RegisterScreen from './screens/RegisterScreen';
import PendingScreen from './screens/PendingScreen';

const notInTelegram = getAuthHeader() === '';

export default function App() {
  const [me, setMe] = useState(undefined); // undefined=жүктелуде, null=тіркелмеген
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const lang = me?.lang ?? tgUserLang();
  const t = useT(lang);

  const load = () => {
    setError(false);
    api('/me')
      .then((r) => setMe(r.student))
      .catch(() => setError(true));
  };
  useEffect(() => {
    if (!notInTelegram) load();
  }, []);

  if (notInTelegram) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 p-6 text-center">
        <p>{t.notInTelegram}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-900 text-slate-100 p-6">
        <p>{t.errorGeneric}</p>
        <button onClick={load} className="px-6 py-2 rounded-xl bg-sky-500 font-semibold">{t.retry}</button>
      </div>
    );
  }

  if (me === undefined) return <Loader />;

  if (me === null) {
    return <RegisterScreen onRegistered={setMe} />;
  }

  if (me.status === 'pending') {
    return <PendingScreen lang={me.lang} onApproved={setMe} />;
  }

  // status === 'approved' — таб қабығы
  const isAdmin = me.role === 'admin';
  const tabs = [
    { key: 'play', label: t.tabPlay, icon: '🎮' },
    { key: 'battles', label: t.tabBattles, icon: '⚔️' },
    { key: 'rating', label: t.tabRating, icon: '🏆' },
    { key: 'profile', label: t.tabProfile, icon: '👤' },
    ...(isAdmin ? [{ key: 'admin', label: t.tabAdmin, icon: '🛠' }] : []),
  ];
  const defaultTab = isAdmin && me.class_id === null ? 'admin' : 'play';
  const active = activeTab ?? defaultTab;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-md mx-auto p-4 pb-20">
        {active === 'play' && <Card>{t.tabPlay}…</Card>}
        {active === 'battles' && <Card>{t.tabBattles}…</Card>}
        {active === 'rating' && <Card>{t.tabRating}…</Card>}
        {active === 'profile' && <Card>{t.tabProfile}…</Card>}
        {active === 'admin' && <Card>{t.tabAdmin}…</Card>}
      </div>
      <TabBar tabs={tabs} active={active} onChange={setActiveTab} />
    </div>
  );
}
