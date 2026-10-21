/// <reference types="vite/client" />
import { startUpdateChecks } from './pwa/updates';


// Development safeguard:
// Service workers are intentionally disabled during local Vite development.
// If an older localhost build registered one, remove it so stale PWA assets
// cannot interfere with visual review.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  startUpdateChecks();
}

import { render } from 'preact';
import { App } from './App';
import './styles.css';
render(<App />, document.getElementById('app')!);
