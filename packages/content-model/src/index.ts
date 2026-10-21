import { z } from 'zod';

const id = z.string().min(1).max(150);
const mediaPath = (prefix: string) => z.string().refine(value => {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith(prefix) && !decoded.includes('\\') &&
      !decoded.split('/').includes('..') && !/[?#\u0000]/.test(decoded);
  } catch { return false; }
}, 'Use a safe published media path');
export const templateSchema = z.enum(['title', 'teaching', 'scripture', 'concepts', 'steps', 'question', 'exercise', 'prayer']);
export const reflectionSchema = z.looseObject({
  title: z.string().min(1), prompt: z.string().min(1), time: z.string().optional()
});
export const blockSchema = z.looseObject({
  id, type: z.string().min(1), text: z.string(), localization_policy: z.string().min(1),
  icon: z.string().optional(),
  image: z.looseObject({
    src: mediaPath('/assets/'), small_src: mediaPath('/assets/').optional(),
    alt: z.string().min(1), width: z.number().positive(), height: z.number().positive(),
    localization_policy: z.string().optional()
  }).optional()
});
export const pageSchema = z.looseObject({
  id, source_slide: z.number().int(), title: z.string().min(1), layout: z.string(),
  template: templateSchema.optional(), blocks: z.array(blockSchema).min(1),
  presentation: z.record(z.string(), z.unknown()).optional(),
  reflection: reflectionSchema.optional(),
  guided: z.looseObject({
    narration: z.string(), narration_mode: z.enum(['browser_tts', 'marin_opus']).optional(),
    segments: z.array(z.looseObject({ block_id: id, text: z.string().min(1), audio: mediaPath('/audio/').optional() })).optional(),
    facilitator: reflectionSchema.optional()
  }).optional()
}).superRefine((page, context) => {
  const ids = new Set<string>();
  for (const block of page.blocks) {
    if (ids.has(block.id)) context.addIssue({ code: 'custom', message: 'Duplicate block ID: ' + block.id });
    ids.add(block.id);
  }
  const mapped = new Set<string>();
  for (const segment of page.guided?.segments || []) {
    if (!page.blocks.some(block => block.id === segment.block_id && block.type !== 'title'))
      context.addIssue({ code: 'custom', message: 'Narration references an unknown body block: ' + segment.block_id });
    if (mapped.has(segment.block_id)) context.addIssue({ code: 'custom', message: 'Duplicate narration mapping' });
    mapped.add(segment.block_id);
  }
  if (page.presentation?.reveal_blocks && !page.blocks.some(block => block.type !== 'title'))
    context.addIssue({ code: 'custom', message: 'A section page needs a body block' });
  if (page.presentation?.reveal_blocks && page.guided?.segments &&
      page.blocks.filter(block => block.type !== 'title').some(block => !mapped.has(block.id)))
    context.addIssue({ code: 'custom', message: 'Narration must cover every revealed block' });
});
export const courseSchema = z.looseObject({
  schema_version: z.literal('0.3'), course_id: id, title: z.string().min(1), track: z.string(),
  language: z.string().min(1), country: z.string().min(1),
  presentation_version: z.string().optional(),
  guided_presentation: z.record(z.string(), z.unknown()).optional(),
  module: z.looseObject({ id, number: z.number().int().positive(), title: z.string(), pages: z.array(pageSchema).min(1) }),
  source_issues: z.array(z.looseObject({ id, source_slide: z.number().int(), type: z.string(), status: z.string(), note: z.string() }))
}).superRefine((course, context) => {
  const ids = new Set<string>();
  for (const page of course.module.pages) {
    for (const value of [page.id, ...page.blocks.map(block => block.id)]) {
      if (ids.has(value)) context.addIssue({ code: 'custom', message: 'Duplicate published ID: ' + value });
      ids.add(value);
    }
  }
});
export type PublishedCourse = z.infer<typeof courseSchema>;
export type CoursePage = z.infer<typeof pageSchema>;
export type ModuleDraft = {
  id: string; course: PublishedCourse;
  pages: { id: string; canonicalId: string; revision: number; wordingReviewRequired: boolean }[];
};
export const savePageSchema = z.object({
  expectedRevision: z.number().int().positive(),
  allowWordingChanges: z.boolean().default(false),
  page: pageSchema
});
export function wordingChanged(before: CoursePage, after: CoursePage): boolean {
  return before.title !== after.title || before.blocks.some(block =>
    after.blocks.find(item => item.id === block.id)?.text !== block.text);
}
export function sameBlockIds(before: CoursePage, after: CoursePage): boolean {
  return before.id === after.id && before.blocks.length === after.blocks.length &&
    before.blocks.every(block => after.blocks.some(item => item.id === block.id));
}
