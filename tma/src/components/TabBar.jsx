import { haptic } from '../telegram';

export default function TabBar({ tabs, active, onChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-800/95 border-t border-slate-700 backdrop-blur pb-safe">
      <div
        className="max-w-md mx-auto grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (tab.key !== active) haptic('light');
                onChange(tab.key);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-sky-400' : 'text-slate-400'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
