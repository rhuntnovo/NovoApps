import type { LessonState as LessonResume } from '../../../packages/content-runtime/src/state';
import type { Course } from '../types';
export type { LessonState as LessonResume } from '../../../packages/content-runtime/src/state';

export function lessonResumeIdentity(course:Pick<Course,'provider'|'course_id'|'country'|'module'>){
  return [course.provider?.id||'new-vines',course.course_id,course.module.id,course.country.toLowerCase()].join(':');
}

const key = (courseId: string, language: string) => `novoapps:update-resume:${courseId}:${language}`;

export function saveLessonResume(courseId: string, language: string, resume: LessonResume,
  storage: Storage = sessionStorage) {
  // Deliberately let storage failures abort the update instead of losing the place.
  storage.setItem(key(courseId, language), JSON.stringify(resume));
}

export function takeLessonResume(courseId: string, language: string,
  storage: Storage = sessionStorage): LessonResume | null {
  try {
    const name = key(courseId, language);
    const raw = storage.getItem(name);
    if (!raw) return null;
    const resume = JSON.parse(raw);
    storage.removeItem(name); // One-time handoff, not a progress/history store.
    if (resume.schema !== 1 || typeof resume.pageId !== 'string' ||
      !['self-paced', 'guided'].includes(resume.mode) || !['individual', 'group'].includes(resume.audience) ||
      !['presenting', 'showAll', 'showPrompt', 'reflected'].every(field => typeof resume[field] === 'boolean') ||
      !(resume.blockId === null || typeof resume.blockId === 'string') ||
      ![null, 'browser_tts', 'marin_opus'].includes(resume.voiceOverride)) return null;
    return resume;
  } catch {
    return null;
  }
}
