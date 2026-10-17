export type TemplateType='title'|'teaching'|'scripture'|'concepts'|'steps'|'question'|'exercise'|'prayer';
export type ContentBlock={type:string;text:string;localization_policy:string};
export type GuidedNarrationMode='browser_tts'|'marin_opus';
export type GuidedCue={label:string;at:number};
export type GuidedPresentation={
 narration:string;
 narration_segments?:string[];
 audio_segments?:string[];
 narration_mode?:GuidedNarrationMode;
 browser_tts_available?:boolean;
 estimated_seconds?:number;
 cues?:GuidedCue[];
 facilitator?:{title:string;prompt:string;time?:string};
 auto_advance?:boolean;
};
export type CoursePage={id:string;source_slide:number;title:string;layout:string;template?:TemplateType;blocks:ContentBlock[];presentation?:Record<string,unknown>;guided?:GuidedPresentation};
export type SourceIssue={id:string;source_slide:number;type:string;status:string;note:string};
export type Course={schema_version?:string;course_id:string;title:string;track:string;language:string;country:string;presentation_version?:string;guided_presentation?:Record<string,unknown>;module:{number:number;title:string;pages:CoursePage[]};source_issues:SourceIssue[]};
