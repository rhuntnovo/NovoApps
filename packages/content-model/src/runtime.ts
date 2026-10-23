// Type-only entry: learner imports erase completely; Zod stays out of the runtime bundle.
export type Course = import('./index').PublishedCourse;
export type CoursePage = import('./index').CoursePage;
export type TemplateType = NonNullable<CoursePage['template']>;
export type ContentBlock = CoursePage['blocks'][number];
export type BlockImage = NonNullable<ContentBlock['image']>;
export type GuidedPresentation = NonNullable<CoursePage['guided']>;
export type NarrationSegment = NonNullable<GuidedPresentation['segments']>[number];
export type ReflectionPrompt = NonNullable<CoursePage['reflection']>;
export type GuidedNarrationMode = NonNullable<GuidedPresentation['narration_mode']>;
export type GuidedCue = {label:string;at:number};
export type SourceIssue = Course['source_issues'][number];