export type EmailBlock = { kind:'text'; text:string } | { kind:'field'; label:string; value:string };

const labels = new Map([
  ['position','Position'], ['job title','Job title'], ['role','Role'],
  ['location','Location'], ['locations','Locations'], ['work location','Work location'],
  ['work setting','Work setting'], ['duration','Duration'], ['contract duration','Contract duration'],
  ['company','Company'], ['client','Client'], ['rate','Rate'], ['pay','Pay'], ['salary','Salary'],
  ['employment type','Employment type'], ['job type','Job type'], ['start date','Start date'],
  ['interview process','Interview process'],
]);
const labelFor = (line:string) => labels.get(line.trim().replace(/:$/, '').trim().toLowerCase());

/** Rejoin metadata cells split by HTML-to-text conversion; keep prose and requirements. */
export function formatEmailBody(body:string):EmailBlock[] {
  const lines=body.replace(/\r\n?/g,'\n').split('\n');
  const blocks:EmailBlock[]=[];
  let prose:string[]=[];
  const flush=()=>{ const text=prose.join('\n').trim(); if(text) blocks.push({kind:'text',text}); prose=[]; };
  for(let i=0;i<lines.length;i++) {
    const inline=lines[i].match(/^\s*([^:\n]+):\s*(\S.*)$/);
    const inlineLabel=inline ? labelFor(inline[1]) : undefined;
    if(inline && inlineLabel) {
      flush();blocks.push({kind:'field',label:inlineLabel,value:inline[2].trim()});continue;
    }
    const label=labelFor(lines[i]);
    if(label) {
      let next=i+1;
      while(next<lines.length && !lines[next].trim()) next++;
      const value=lines[next]?.trim();
      // A second label or section heading is not a missing field's value.
      if(value && !labelFor(value) && !/^(?:job description|required skills|requirements|responsibilities)\s*:?$/i.test(value) && !(value.includes(':') && labelFor(value.split(':')[0]))) {
        flush();blocks.push({kind:'field',label,value});i=next;continue;
      }
    }
    prose.push(lines[i]);
  }
  flush();return blocks;
}

export type BodyPart = { text:string; url:boolean };

/** Separate URLs from prose so the viewer can show each one on a single truncated line. */
export function splitUrls(text:string):BodyPart[] {
  const parts:BodyPart[]=[];
  let last=0;
  for(const match of text.matchAll(/\bhttps?:\/\/[^\s<>"]+/gi)) {
    // Sentence punctuation after a URL belongs to the prose, not the link.
    const url=match[0].replace(/[.,;:!?)\]]+$/,'');
    if(match.index>last) parts.push({text:text.slice(last,match.index),url:false});
    parts.push({text:url,url:true});
    last=match.index+url.length;
  }
  if(last<text.length) parts.push({text:text.slice(last),url:false});
  return parts;
}
