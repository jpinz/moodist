import { useEffect, useMemo } from 'react';

import { sounds as soundCategories } from '@/data/sounds';
import { useOutputStore } from '@/stores/output';
import { useSettingsStore } from '@/stores/settings';
import { useSoundStore } from '@/stores/sound';

const SESSION_KEY = 'moodist-output-session';

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function OutputController() {
  const available = useOutputStore(state => state.available);
  const selectedOutputs = useOutputStore(state => state.selected);
  const refresh = useOutputStore(state => state.refresh);
  const isPlaying = useSoundStore(state => state.isPlaying);
  const selectedSounds = useSoundStore(state => state.sounds);
  const globalVolume = useSettingsStore(state => state.globalVolume);

  const soundPaths = useMemo(
    () =>
      Object.fromEntries(
        soundCategories.categories
          .flatMap(category => category.sounds)
          .map(sound => [sound.id, sound.src]),
      ),
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!available) return;

    const timeout = window.setTimeout(() => {
      const selected = Object.entries(selectedSounds)
        .filter(([, sound]) => sound.isSelected)
        .map(([id, sound]) => ({
          path: soundPaths[id],
          volume: sound.volume * globalVolume,
        }));

      fetch(`api/sessions/${getSessionId()}`, {
        body: JSON.stringify({
          outputs: selectedOutputs,
          playing: isPlaying && selected.length > 0,
          sounds: selected,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      }).catch(() => {});
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [
    available,
    globalVolume,
    isPlaying,
    selectedOutputs,
    selectedSounds,
    soundPaths,
  ]);

  return null;
}
