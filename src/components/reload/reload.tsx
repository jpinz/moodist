import { useEffect, useState } from 'react';

import { ReloadModal } from './reload-modal';

export function Reload() {
  const [isBrowser, setIsBrowser] = useState(false);

  useEffect(() => setIsBrowser(true), []);

  if (
    isBrowser &&
    window.location.pathname.startsWith('/api/hassio_ingress/')
  ) {
    return null;
  }

  return isBrowser ? <ReloadModal /> : null;
}
