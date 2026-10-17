/**
 * Демо-панель для просмотра дизайна страниц без логики запросов к backend.
 * Видна только в режиме мока (ветка mock): мгновенный переход между экранами —
 * загрузка / обработка / результат / ошибка обработки.
 */
export type DemoTarget = 'upload' | 'processing' | 'result' | 'failed';

interface MockDemoPanelProps {
  onShow: (target: DemoTarget) => void;
}

const BUTTONS: { target: DemoTarget; label: string }[] = [
  { target: 'upload', label: 'Загрузка' },
  { target: 'processing', label: 'Обработка' },
  { target: 'result', label: 'Результат' },
  { target: 'failed', label: 'Ошибка' },
];

export function MockDemoPanel({ onShow }: MockDemoPanelProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-1 rounded-lg bg-inverse-surface/95 text-inverse-on-surface px-3 py-2 shadow-xl backdrop-blur-sm">
      <span className="font-label-sm text-label-sm uppercase tracking-wider opacity-70">
        Мок: просмотр экранов
      </span>
      <div className="flex gap-1">
        {BUTTONS.map((b) => (
          <button
            className="px-2 py-1 rounded bg-inverse-on-surface/10 hover:bg-inverse-on-surface/20 text-[12px] transition-colors"
            key={b.target}
            type="button"
            onClick={() => onShow(b.target)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
