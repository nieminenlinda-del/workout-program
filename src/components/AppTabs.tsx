export function AppTabs({
  current,
  onToday,
  onDashboard,
  onLog,
}: {
  current: 'today' | 'dashboard' | 'log';
  onToday: () => void;
  onDashboard: () => void;
  onLog: () => void;
}) {
  const tabs = [
    { id: 'today' as const, label: 'Today', onClick: onToday },
    { id: 'dashboard' as const, label: 'Dashboard', onClick: onDashboard },
    { id: 'log' as const, label: 'Log', onClick: onLog },
  ];
  return (
    <nav className="dash-tabs" aria-label="Sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`dash-tab ${current === tab.id ? 'on' : ''}`}
          aria-current={current === tab.id ? 'page' : undefined}
          onClick={tab.onClick}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
