type SaveBeforeUpdate = () => void | Promise<void>;
export type UpdateState = { available: boolean; phase: 'idle' | 'saving' | 'updating'; error: string };

// Save callbacks must resolve only after local writes/transactions have committed.
// Cloud synchronization is separate; a downloaded update can be applied offline.
export function createUpdateManager(container: ServiceWorkerContainer | undefined,
  online: () => boolean, reload: () => void) {
  let state: UpdateState = { available: false, phase: 'idle', error: '' };
  let registration: ServiceWorkerRegistration | undefined;
  let installed: ServiceWorker | null = null;
  let controller = container?.controller;
  let changedController = false;
  let checking: Promise<void> | null = null;
  let activated: (() => void) | null = null;
  const listeners = new Set<(value: UpdateState) => void>();
  const saves = new Set<SaveBeforeUpdate>();
  const watched = new WeakSet<ServiceWorker>();
  const publish = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener(state));
  };
  const discover = () => {
    if (registration?.waiting && container?.controller) {
      installed = registration.waiting;
      publish({ available: true });
    }
    const worker = registration?.installing;
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && container?.controller) {
        installed = worker;
        publish({ available: true });
      }
    });
  };
  container?.addEventListener('controllerchange', () => {
    const previous = controller;
    controller = container.controller;
    // First installation is not an update and must never reload the lesson.
    if (!previous || previous === controller) return;
    changedController = true;
    if (activated) activated();
    else publish({ available: true }); // Another window applied it; this one keeps its lesson.
  });

  return {
    getState: () => state,
    subscribe(listener: (value: UpdateState) => void) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
    beforeUpdate(save: SaveBeforeUpdate) {
      saves.add(save);
      return () => { saves.delete(save); };
    },
    check(): Promise<void> {
      if (!container || !online()) return Promise.resolve();
      if (checking) return checking;
      checking = (async () => {
        try {
          if (!registration) {
            registration = await container.register('/sw.js', { updateViaCache: 'none' });
            registration.addEventListener('updatefound', discover);
          } else {
            await registration.update();
          }
          discover();
        } catch {
          // Update-server failures never interrupt an available offline lesson.
        }
      })().finally(() => { checking = null; });
      return checking;
    },
    async apply(): Promise<void> {
      if (!state.available || state.phase !== 'idle') return;
      publish({ phase: 'saving', error: '' });
      let activationTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        for (const save of [...saves]) await save();
        publish({ phase: 'updating' });
        if (!changedController) {
          // Re-read waiting: a newer release might have arrived while saving.
          const worker = registration?.waiting || installed;
          if (!worker || worker.state === 'redundant') throw new Error('Update no longer ready');
          await new Promise<void>((resolve, reject) => {
            activated = resolve;
            activationTimer = setTimeout(() => reject(new Error('Activation timed out')), 10000);
            worker.postMessage({ type: 'ACTIVATE_UPDATE' });
          });
        }
        reload();
      } catch {
        publish({ phase: 'idle', error: 'Could not save or apply the update. Your app is still open. Please try again.' });
      } finally {
        clearTimeout(activationTimer);
        activated = null;
      }
    }
  };
}
