import { useEffect } from 'react';

import { Checkbox } from '@/components/checkbox';
import {
  Modal,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from '@/components/modal';
import { useOutputStore } from '@/stores/output';

import styles from './output.module.css';

interface OutputModalProps {
  onClose: () => void;
  show: boolean;
}

export function OutputModal({ onClose, show }: OutputModalProps) {
  const available = useOutputStore(state => state.available);
  const browser = useOutputStore(state => state.browser);
  const error = useOutputStore(state => state.error);
  const loading = useOutputStore(state => state.loading);
  const refresh = useOutputStore(state => state.refresh);
  const selected = useOutputStore(state => state.selected);
  const setBrowser = useOutputStore(state => state.setBrowser);
  const targets = useOutputStore(state => state.targets);
  const toggleTarget = useOutputStore(state => state.toggleTarget);

  useEffect(() => {
    if (show) refresh();
  }, [refresh, show]);

  return (
    <Modal show={show} onClose={onClose}>
      <ModalHeader>
        <div>
          <ModalTitle>Audio output</ModalTitle>
          <ModalDescription>
            Choose one or more places to play your soundscape.
          </ModalDescription>
        </div>
      </ModalHeader>

      <div className={styles.list}>
        <label className={styles.option}>
          <Checkbox
            checked={browser}
            disabled={browser && selected.length === 0}
            onChange={setBrowser}
          />
          <span>
            <strong>This browser</strong>
            <small>The device where Moodist is open</small>
          </span>
        </label>

        {available && targets.length > 0 && (
          <>
            <p className={styles.heading}>Home Assistant</p>
            {targets.map(target => {
              const checked = selected.includes(target.entityId);
              return (
                <label className={styles.option} key={target.entityId}>
                  <Checkbox
                    checked={checked}
                    disabled={
                      checked && !browser && selected.length === 1
                    }
                    onChange={() => toggleTarget(target.entityId)}
                  />
                  <span>
                    <strong>{target.name}</strong>
                    <small>
                      {target.kind === 'group' ? 'Speaker group' : 'Speaker'}
                    </small>
                  </span>
                </label>
              );
            })}
          </>
        )}
      </div>

      {loading && <p className={styles.message}>Finding speakers…</p>}
      {!loading && available && targets.length === 0 && (
        <p className={styles.message}>
          No Home Assistant speakers or speaker groups were found.
        </p>
      )}
      {!loading && error && <p className={styles.message}>{error}</p>}
    </Modal>
  );
}
