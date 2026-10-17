/** Шапка в стиле Reference_1: фиксированная, светлая, Material Symbols. */
export function AppHeader() {
  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-surface-container-lowest border-b border-outline-variant/30">
      <div className="h-14 w-full max-w-7xl mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-[18px]">verified_user</span>
          </div>
          <span className="font-headline-md text-headline-md text-on-surface tracking-tight">
            Forte Review
          </span>
          <div className="h-4 w-px bg-outline-variant/50" />
          <span className="font-label-md text-label-md text-secondary tracking-tight">
            Контроль видеозаписей
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-1 bg-surface-container-low px-3 py-1 rounded border border-outline-variant/20">
            <span className="w-2 h-2 rounded-full bg-tertiary-container animate-pulse" />
            <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">
              Система контроля видеозаписей
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="font-label-md text-label-md text-on-surface">АРМ Контролера №4</div>
              <div className="font-label-sm text-label-sm text-secondary">Операционный зал ЦО</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
