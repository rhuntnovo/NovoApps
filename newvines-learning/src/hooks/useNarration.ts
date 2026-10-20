import { useEffect, useRef, useState } from 'preact/hooks';
import type { GuidedNarrationMode, NarrationSegment } from '../types';

type Status = 'idle' | 'playing' | 'paused' | 'finished' | 'error';
type Options = {
  enabled: boolean;
  segments: NarrationSegment[];
  mode: GuidedNarrationMode;
  language: string;
  leadMs: number;
  onReveal: (blockId: string) => void;
  onComplete: () => void;
};

// One completion event advances one mapped block. No estimated-duration timers.
export function useNarration(options: Options) {
  const [status, setStatus] = useState<Status>('idle');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState('');
  const current = useRef(options);
  current.current = options;
  const run = useRef(0);
  const position = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const phase = useRef<'waiting' | 'audio' | 'speech'>('waiting');
  const paused = useRef(false);

  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  function stop() {
    run.current++;
    paused.current = false;
    clearTimer();
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    utterance.current = null;
    setStatus('idle');
    setActiveId(null);
    setNotice('');
    setUnavailable(false);
  }

  useEffect(() => {
    if (!options.enabled) stop();
    return stop;
  }, [options.enabled]);

  function next(token: number) {
    if (token !== run.current) return;
    audio.current = null;
    utterance.current = null;
    if (position.current + 1 < current.current.segments.length) {
      schedule(position.current + 1, token);
    } else {
      setStatus('finished');
      setActiveId(null);
      current.current.onComplete();
    }
  }

  function speakSegment(token: number) {
    if (token !== run.current) return;
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current = null;
    }
    if (paused.current) { phase.current = 'waiting'; return; }
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      stop();
      setUnavailable(true);
      return;
    }
    const segment = current.current.segments[position.current];
    setNotice('');
    const speech = new SpeechSynthesisUtterance(segment.text);
    speech.lang = current.current.language;
    speech.rate = .94;
    const voices = window.speechSynthesis.getVoices().filter(voice => voice.lang.startsWith(speech.lang.split('-')[0]));
    speech.voice = voices.find(voice => /natural|enhanced|premium|google us english/i.test(voice.name)) || voices[0] || null;
    speech.onend = () => next(token);
    speech.onerror = () => {
      if (token !== run.current) return;
      stop();
      setUnavailable(true);
    };
    utterance.current = speech;
    phase.current = 'speech';
    window.speechSynthesis.speak(speech);
  }

  function playSegment(token: number) {
    if (token !== run.current) return;
    const segment = current.current.segments[position.current];
    if (current.current.mode === 'marin_opus') {
      if (!segment.audio) { recordingFailed(token, 'No Marin recording is attached to this section.'); return; }
      // Reuse the media element activated by the learner's click. Creating a new
      // element after every reveal timer can lose playback permission on phones.
      const sound = player.current || (player.current = new Audio());
      sound.src = segment.audio;
      audio.current = sound;
      setNotice('');
      phase.current = 'audio';
      sound.onended = () => next(token);
      sound.onerror = () => {
        if (audio.current !== sound) return;
        recordingFailed(token, sound.error?.code === MediaError.MEDIA_ERR_NETWORK
          ? 'The Marin recording could not be downloaded. Check your connection and retry.'
          : 'This browser could not play the Marin recording. Retry or choose browser voice in the lesson options.');
      };
      sound.play().catch(error => playbackError(error, sound, token));
    } else speakSegment(token);
  }

  function recordingFailed(token: number, message: string) {
    if (token !== run.current) return;
    stop();
    setStatus('error');
    setNotice(message);
  }

  function playbackError(error: unknown, sound: HTMLAudioElement, token: number) {
    if (token !== run.current || audio.current !== sound) return;
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      paused.current = true;
      setStatus('paused');
      setNotice('Tap Resume to allow the recorded narration to play.');
    } else if (!(paused.current && error instanceof DOMException && error.name === 'AbortError')) {
      recordingFailed(token, 'The Marin recording could not be played. Retry or choose browser voice in the lesson options.');
    }
  }

  function schedule(index: number, token: number, alreadyVisible = false) {
    position.current = index;
    phase.current = 'waiting';
    const segment = current.current.segments[index];
    current.current.onReveal(segment.block_id);
    setActiveId(segment.block_id);
    clearTimer();
    if (alreadyVisible) playSegment(token);
    else timer.current = setTimeout(() => { timer.current = null; playSegment(token); }, current.current.leadMs);
  }

  function toggle() {
    if (status === 'playing') {
      paused.current = true;
      clearTimer();
      audio.current?.pause();
      if (phase.current === 'speech' && 'speechSynthesis' in window) window.speechSynthesis.pause();
      setStatus('paused');
    } else if (status === 'paused') {
      paused.current = false;
      setNotice('');
      setStatus('playing');
      if (phase.current === 'audio' && audio.current) {
        const sound = audio.current, token = run.current;
        sound.play().catch(error => playbackError(error, sound, token));
      } else if (phase.current === 'speech' && 'speechSynthesis' in window) window.speechSynthesis.resume();
      else schedule(position.current, run.current);
    } else if (current.current.enabled && current.current.segments.length) {
      stop();
      setUnavailable(false);
      setStatus('playing');
      // The first block is already visible before the user presses Narrate.
      // Start its audio in that click; subsequent blocks retain the reveal lead.
      schedule(0, run.current, true);
    }
  }

  return { status, activeId, unavailable, notice, toggle, stop };
}
