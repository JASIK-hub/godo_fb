/** Подвал в стиле Reference_1. */
export function AppFooter() {
  return (
    <footer className="w-full bg-surface-container-lowest border-t border-outline-variant/30 py-2">
      <div className="w-full max-w-7xl mx-auto px-6 flex items-center justify-between text-secondary font-label-sm text-label-sm">
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px] text-primary">verified_user</span>
          <span>Forte Review • Внутренний контур контроля видеозаписей</span>
        </div>
        <div className="text-secondary/70 font-body-sm text-body-sm">
          Конфиденциально • Режим верификации
        </div>
      </div>
    </footer>
  );
}
