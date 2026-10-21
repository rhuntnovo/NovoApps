import { createUpdateManager } from './updateManager';

export const appUpdates = createUpdateManager(
  'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  () => navigator.onLine !== false,
  () => location.reload()
);

export function startUpdateChecks() {
  let lastCheck = 0;
  const check = (force = false) => {
    if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
    if (!force && Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    void appUpdates.check();
  };
  window.addEventListener('load', () => check(true));
  window.addEventListener('online', () => check(true));
  window.addEventListener('focus', () => check());
  document.addEventListener('visibilitychange', () => check());
  // Timers may be suspended in background/mobile apps; foreground events catch up.
  window.setInterval(() => check(), 15 * 60 * 1000);
}
