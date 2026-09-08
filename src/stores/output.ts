import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface OutputTarget {
  entityId: string;
  kind: 'device' | 'group';
  name: string;
}

interface OutputStore {
  available: boolean;
  browser: boolean;
  error: string | null;
  loading: boolean;
  selected: string[];
  setBrowser: (enabled: boolean) => void;
  targets: OutputTarget[];
  toggleTarget: (entityId: string) => void;
  refresh: () => Promise<void>;
}

export const useOutputStore = create<OutputStore>()(
  persist(
    (set, get) => ({
      available: false,
      browser: true,
      error: null,
      loading: false,
      selected: [],

      setBrowser(enabled) {
        if (!enabled && get().selected.length === 0) return;
        set({ browser: enabled });
      },

      targets: [],

      toggleTarget(entityId) {
        const { browser, selected, targets } = get();
        if (!targets.some(target => target.entityId === entityId)) return;

        const isSelected = selected.includes(entityId);
        if (isSelected && !browser && selected.length === 1) return;

        set({
          selected: isSelected
            ? selected.filter(value => value !== entityId)
            : [...selected, entityId],
        });
      },

      async refresh() {
        set({ error: null, loading: true });

        try {
          const response = await fetch('api/outputs', {
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error('Home Assistant is unavailable.');

          const data = (await response.json()) as {
            available: boolean;
            targets: OutputTarget[];
          };
          const availableIds = new Set(
            data.targets.map(target => target.entityId),
          );
          const selected = get().selected.filter(entityId =>
            availableIds.has(entityId),
          );

          set({
            available: data.available,
            browser: get().browser || selected.length === 0,
            loading: false,
            selected,
            targets: data.targets,
          });
        } catch {
          set({
            available: false,
            browser: true,
            error: 'Home Assistant outputs are available in the add-on.',
            loading: false,
            selected: [],
            targets: [],
          });
        }
      },
    }),
    {
      name: 'moodist-output',
      partialize: state => ({
        browser: state.browser,
        selected: state.selected,
      }),
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      version: 0,
    },
  ),
);
