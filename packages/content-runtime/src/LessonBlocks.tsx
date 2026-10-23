import type { ContentBlock, CoursePage } from './types';
import { Inline, VisualIcon } from './templates/TemplateRenderer';
import { parseTable,tableCell } from './tabular';

function BlockText({ block }: { block: ContentBlock }) {
  if(block.type==='table'){
    const table=parseTable(block.text);
    if(table)return <table class="content-table">
      {table.header&&<thead><tr>{table.header.map((cell,index)=><th scope="col" key={index}><Inline text={cell}/></th>)}</tr></thead>}
      <tbody>{table.rows.map((row,index)=><tr key={index}>{row.map((cell,column)=>column===0?<th scope="row" key={column}><Inline text={tableCell(cell)}/></th>:<td key={column}><Inline text={cell}/></td>)}</tr>)}</tbody>
    </table>;
  }
  if(block.type==='flow'){
    const groups=block.text.split(/\n\s*\n/).filter(Boolean);
    return <div class="fund-flow"><div class="flow-heading"><Inline text={groups[0]||''}/></div>
      <div class="flow-cards">{groups.slice(1,-1).map((group,index)=>{const [heading,...lines]=group.split('\n');return <div class="flow-card" key={index}><strong><Inline text={heading}/></strong>{lines.length>0&&<div><Inline text={lines.join('\n')}/></div>}</div>;})}</div>
      {groups.length>1&&<div class="flow-heading"><Inline text={groups.at(-1)!}/></div>}</div>;
  }
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
      <span class="section-number" aria-hidden="true">{block.type === 'step' ? block.text.match(/^(?:Step|Paso)\s+(\d+):/i)?.[1] || index + 1 : index + 1}</span>
      <div class={`lesson-block-content ${block.image ? 'has-image' : ''}`}>
        <div>{block.icon && <VisualIcon kind={block.icon}/>}<div class="block">
          <BlockText block={block}/>
        </div></div>
        {block.image && <BlockIllustration image={block.image}/>}
      </div>
    </div>)}
  </div>;
}


export function BlockIllustration({image}:{image:NonNullable<ContentBlock['image']>}){return <img class="lesson-illustration" src={image.small_src||image.src}
  srcSet={image.small_src?`${image.small_src} 384w, ${image.src} 768w`:undefined}
  sizes="(min-width: 1000px) 340px, (min-width: 700px) 300px, 240px" width={image.width} height={image.height}
  alt={image.alt} loading="lazy" decoding="async"
  onError={event=>{event.currentTarget.hidden=true;event.currentTarget.closest('.lesson-block-content')?.classList.remove('has-image');}}/>;}
