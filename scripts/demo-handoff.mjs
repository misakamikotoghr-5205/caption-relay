// A real local CLI workflow for judges without requiring browser automation.
// Human decisions must be supplied explicitly; no model response is invented.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadBackend } from '../tests/backend-loader.mjs';
const [input, output='outputs/cli-demo', acceptId] = process.argv.slice(2);
if (!input) { console.error('Usage: node scripts/demo-handoff.mjs input.srt [output-directory] [accept-cue-id]');process.exit(1); }
const backend=await loadBackend();
try {
 const format=input.toLowerCase().endsWith('.vtt')?'vtt':'srt';
 const original=backend.captions.parseSubtitles(await readFile(input,'utf8'),format);
 const glossary={'人工智能体':'AI Agent','caption relay':'Caption Relay'};
 const issues=backend.captions.auditCues(original,glossary);
 console.log('INPUT:',input,'CUES:',original.length,'HEURISTIC FLAGS:',issues.length);
 const review=await backend.agent.reviewCaptions(original,glossary);
 console.log('MODEL RESULT:',JSON.stringify(review,null,2));
 const decisions=review.proposals.map(proposal=>({proposal,accepted:proposal.cueId===acceptId,at:new Date().toISOString(),source:'Explicit CLI accept-cue-id argument; other proposals retained.'}));
 const current=original.map(c=>{const d=decisions.find(d=>d.accepted&&d.proposal.cueId===c.id);return d?{...c,text:d.proposal.text}:{...c};});
 const timingChanged=current.some((c,i)=>c.startMs!==original[i].startMs||c.endMs!==original[i].endMs);
 if(timingChanged)throw new Error('Timing invariant failed.');
 const handoff={schemaVersion:1,createdAt:new Date().toISOString(),original,current,originalIssues:issues,remainingIssues:backend.captions.auditCues(current,glossary),glossary,agent:review,decisions,timingChanged,scope:'Actual local CLI walkthrough; this does not certify a browser round trip or subtitle quality.'};
 await mkdir(output,{recursive:true});
 await writeFile(`${output}/reviewed.${format}`,backend.captions.exportSubtitles(current,format));
 await writeFile(`${output}/handoff.json`,JSON.stringify(handoff,null,2)+'\n');
 console.log('OUTPUT:',output,'ACCEPTED:',decisions.filter(d=>d.accepted).length,'TIMING_CHANGED:',timingChanged);
 if(review.mode!=='ai')process.exitCode=2;
} finally {await backend.cleanup();}
