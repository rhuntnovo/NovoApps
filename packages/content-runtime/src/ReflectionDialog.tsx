import { useLayoutEffect, useRef } from 'preact/hooks';
import type { ReflectionPrompt } from './types';
import { labels } from './labels';

export function ReflectionDialog({ prompt, group, lastPage, onClose, onContinue, language = 'en' }: {
  prompt: ReflectionPrompt;
  language?: string;
  group: boolean;
  lastPage: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const t = labels(language);
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
    <button class="fac-close" aria-label={t.closeReflection} onClick={onClose}>×</button>
    <div class="fac-label">{group ? t.facilitator : t.pauseReflect}</div>
    <h2 id="reflection-title">{prompt.title}</h2>
    <p>{prompt.prompt}</p>
    {prompt.time&&<p class="reflection-time">{prompt.time}</p>}
    <button class="reflection-continue" onClick={onContinue}>{lastPage ? t.returnPage : t.continueNext}</button>
  </dialog>;
}
