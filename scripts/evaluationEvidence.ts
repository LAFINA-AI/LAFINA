import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
const root=resolve(__dirname,'..');
const recordedAt=new Date().toISOString();
const manifest=require('../evaluation/fixture-manifest-v1.json') as {version:number;files:Record<string,string>};
/** Verifies frozen regression bytes before loading the declared synthetic fixture. */
export const readFrozenFixture=<T>(name:string):T=>{
 if(!Object.prototype.hasOwnProperty.call(manifest.files,name)||name.includes('/')||name.includes('\\'))throw new Error('Unknown fixture.');
 const bytes=readFileSync(resolve(root,'evaluation',name));if(manifest.version!==1||createHash('sha256').update(bytes).digest('hex')!==manifest.files[name])throw new Error('Frozen fixture changed. Version it separately rather than relabeling results.');
 return JSON.parse(bytes.toString('utf8')) as T;
};
const sourceTreeHash=():string=>{
 const files:string[]=[];const visit=(directory:string):void=>{for(const entry of readdirSync(resolve(root,directory),{withFileTypes:true})){if(entry.name.startsWith('.'))continue;const file=`${directory}/${entry.name}`;if(entry.isDirectory())visit(file);else if(entry.isFile()&&/\.tsx?$/.test(entry.name))files.push(file);}};
 visit('src');const hash=createHash('sha256');for(const file of files.sort())hash.update(`${file}:${createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')}\n`);return hash.digest('hex');
};
/** Writes optional fresh host evidence only inside docs/reports, never overwriting an earlier result. */
export const writeEvaluationEvidence=(kind:'notes'|'intents'|'speech',metrics:Record<string,unknown>,sources:string[]):void=>{
 const output=process.env.LAFINA_EVALUATION_OUTPUT;if(!output)return;
 const destination=resolve(root,output),local=relative(root,destination).replaceAll('\\','/');
 if(isAbsolute(local)||!local.startsWith('docs/reports/')||local.includes('../')||!local.endsWith('.json')||existsSync(destination))throw new Error('Choose a new JSON evidence path inside docs/reports.');
 const sourceHashes:Record<string,string>={};for(const source of sources){if(!/^(src|scripts)\//.test(source)||source.includes('..')||source.includes('.env'))throw new Error('Invalid evaluation source.');sourceHashes[source]=createHash('sha256').update(readFileSync(resolve(root,source))).digest('hex');}
 const report={version:1,kind,recordedAt,environment:`Host Node ${process.version}, Jest and in-memory better-sqlite3; not Android timing`,fixtureHashes:manifest.files,sourceHashes,sourceTreeSha256:sourceTreeHash(),metrics,limits:'Synthetic regression only. No phone latency, WER, model NIEA, audibility, battery or memory claim.'};
 writeFileSync(destination,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
};
