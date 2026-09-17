"use client";
import * as React from "react";
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from "@/components/ui/table";

// Render a small, safe Markdown subset as React nodes. Raw HTML is never run.
export function LinkedMarkdown({value,onInternal}:{value:string;onInternal?:(target:string)=>void}){
  const inline=(text:string):React.ReactNode[]=>{
    const parts:React.ReactNode[]=[];const regex=/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;let from=0;let match:RegExpExecArray|null;
    while((match=regex.exec(text))){if(match.index>from)parts.push(text.slice(from,match.index));const key=match.index;
      if(match[5])parts.push(<strong key={key}>{match[5]}</strong>);
      else if(match[6])parts.push(<code key={key} className="rounded bg-slate-100 px-1">{match[6]}</code>);
      else {const target=match[1]??match[4],label=match[2]??match[3]??match[1];if(/^https?:\/\//i.test(target))parts.push(<a key={key} className="break-all text-[#2457d6] underline" href={target} target="_blank" rel="noreferrer">{label}</a>);else if(!/^(?:javascript|data|file):/i.test(target)&&onInternal)parts.push(<button key={key} type="button" className="trace-inline-link text-left text-[#2457d6] underline underline-offset-2" onClick={()=>onInternal(target)}>{label}</button>);else parts.push(label);}
      from=regex.lastIndex;
    }if(from<text.length)parts.push(text.slice(from));return parts;
  };
  const lines=value.split("\n"),out:React.ReactNode[]=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(line.includes("|")&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]??"")){
      const cells=(v:string)=>v.trim().replace(/^\|/ ,"").replace(/\|$/,"").split("|").map(x=>x.trim());const header=cells(line),rows:string[][]=[];const key=i;i+=2;while(i<lines.length&&lines[i].includes("|")){rows.push(cells(lines[i]));i++;}i--;
      out.push(<div key={key} className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow>{header.map((c,j)=><TableHead key={j}>{inline(c)}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((r,j)=><TableRow key={j}>{r.map((c,k)=><TableCell key={k} className="whitespace-normal align-top">{inline(c)}</TableCell>)}</TableRow>)}</TableBody></Table></div>);continue;
    }
    if(/^#{1,6} /.test(line)){out.push(<h3 key={i} className="pt-4 text-xl font-semibold text-[#17345e]">{inline(line.replace(/^#{1,6} /,""))}</h3>);continue;}
    if(/^[-*] |^\d+\. /.test(line)){const key=i,items:string[]=[];while(i<lines.length&&/^[-*] |^\d+\. /.test(lines[i])){items.push(lines[i].replace(/^[-*] |^\d+\. /,""));i++;}i--;out.push(<ul key={key} className="list-disc space-y-2 pl-5">{items.map((t,j)=><li key={j}>{inline(t)}</li>)}</ul>);continue;}
    if(line.startsWith("> "))out.push(<blockquote key={i} className="border-l-4 border-slate-200 pl-4">{inline(line.slice(2))}</blockquote>);
    else if(line.trim())out.push(<p key={i} className="whitespace-pre-wrap break-words">{inline(line)}</p>);
  }
  return <div className="space-y-3 text-base leading-7 text-[#43566f]">{out}</div>;
}
