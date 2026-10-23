/** Text remains editable/translatable in one field. Tabs delimit columns; newlines delimit rows. */
export function parseTable(text:string){
  const rows=text.split('\n').filter(row=>row.trim()).map(row=>row.split('\t').map(cell=>cell.trim()));
  const width=Math.max(0,...rows.map(row=>row.length));
  if(width<2||width>10||rows.length>200)return null;
  const hasHeader=rows[0][0]===''||/^Investment$/i.test(rows[0][0]);
  const padded=rows.map(row=>Array.from({length:width},(_,index)=>row[index]||''));
  return {header:hasHeader?padded[0]:null,rows:hasHeader?padded.slice(1):padded};
}
// Dot leaders belong to the slide's column layout, not its words. Keep them in stored text.
export function tableCell(text:string){return text.replace(/[.…]{3,}\s*$/u,'').trimEnd();}
