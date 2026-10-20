import { useLayoutEffect, useRef } from 'preact/hooks';
import type { ReflectionPrompt } from '../types';

export function ReflectionDialog({ prompt, group, lastPage, onClose, onContinue }: {
  prompt: ReflectionPrompt;
  group: boolean;
  lastPage: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  return <dialog ref={dialog} class="reflection-dialog" aria-labelledby="reflection-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <button class="fac-close" aria-label="Close reflection" onClick={onClose}>×</button>
    <div class="fac-label">{group ? 'FACILITATOR PAUSE' : 'PAUSE & REFLECT'}{group && prompt.time && ` • ${prompt.time}`}</div>
    <h2 id="reflection-title">{prompt.title}</h2>
    <p>{prompt.prompt}</p>
    <button class="reflection-continue" onClick={onContinue}>{lastPage ? 'Return to page' : 'Next page →'}</button>
  </dialog>;
}
