import type { ContentBlock, CoursePage } from '../types';
import { Inline, VisualIcon } from './templates/TemplateRenderer';

function BlockText({ block }: { block: ContentBlock }) {
  if (block.type === 'list') return <ul class="section-list">{block.text.split('\n').filter(line => line.trim()).map((line, i) => <li key={i}><Inline text={line}/></li>)}</ul>;
  // Source-indented items remain verbatim in JSON; render them as semantic bullets.
  if (block.type === 'step' && /\n\t/.test(block.text)) {
    const lines = block.text.split('\n');
    const firstItem = lines.findIndex(line => line.startsWith('\t'));
    return <><Inline text={lines.slice(0, firstItem).join('\n')}/><ul class="section-list step-items">{lines.slice(firstItem).map((line, i) => <li key={i}><Inline text={line.replace(/^\t/, '')}/></li>)}</ul></>;
  }
  return <Inline text={block.text}/>;
}

export function revealBlocks(page: CoursePage) {
  return page.presentation?.reveal_blocks ? page.blocks.filter(block => block.type !== 'title') : [];
}

export function LessonBlocks({ blocks, revealed, activeId }: {
  blocks: ContentBlock[];
  revealed: number;
  activeId: string | null;
}) {
  return <div class="lesson-blocks">
    {blocks.slice(0, revealed).map((block, index) => <div
      key={block.id}
      id={block.id}
      data-block-id={block.id}
      class={`lesson-block block-${block.type} ${block.type === 'scripture' ? 'persistent-scripture' : ''} ${activeId === block.id ? 'active' : ''}`}
    >
      <span class="section-number" aria-hidden="true">{block.type === 'step' ? block.text.match(/^Step\s+(\d+):/)?.[1] || index + 1 : index + 1}</span>
      <div class={`lesson-block-content ${block.image ? 'has-image' : ''}`}>
        <div>{block.icon && <VisualIcon kind={block.icon}/>}<div class="block">
          <BlockText block={block}/>
        </div></div>
        {block.image && <img class="lesson-illustration" src={block.image.small_src || block.image.src}
          srcSet={block.image.small_src ? `${block.image.small_src} 384w, ${block.image.src} 768w` : undefined}
          sizes="(min-width: 1000px) 340px, (min-width: 700px) 300px, 240px"
          width={block.image.width} height={block.image.height} alt={block.image.alt} loading="lazy" decoding="async"
          onError={event => { event.currentTarget.hidden = true; event.currentTarget.closest('.lesson-block-content')?.classList.remove('has-image'); }}/ >}
      </div>
    </div>)}
  </div>;
}
