export type LessonState = {
  schema: 1;
  pageId: string;
  mode: 'self-paced' | 'guided';
  audience: 'individual' | 'group';
  presenting: boolean;
  blockId: string | null;
  showAll: boolean;
  showPrompt: boolean;
  reflected: boolean;
  voiceOverride: 'browser_tts' | 'marin_opus' | null;
};
