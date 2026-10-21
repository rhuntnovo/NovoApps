import { useEffect, useState } from 'preact/hooks';
import { appUpdates } from '../pwa/updates';

export function UpdateNotice() {
  const [update, setUpdate] = useState(appUpdates.getState);
  useEffect(() => appUpdates.subscribe(setUpdate), []);
  if (!update.available) return null;
  return <span class="update-notice">
    <button class="update-button" disabled={update.phase !== 'idle'}
      title="A new version is downloaded. Save your place and restart with the update."
      aria-label="Update available. Save your place and restart the app."
      onClick={() => void appUpdates.apply()}>
      {update.phase === 'saving' ? 'Saving…' : update.phase === 'updating' ? 'Updating…' : '↻ Update'}
    </button>
    {update.error && <span class="update-error" role="alert">{update.error}</span>}
  </span>;
}
