// Synthetic host evidence only. This runner never opens an installed app database.
const {spawnSync}=require('node:child_process');
const {existsSync}=require('node:fs');
const path=require('node:path');
const args=process.argv.slice(2),kind=args.shift();
const suites={intents:'intentBenchmark',notes:'notesBenchmark',speech:'speechContractBenchmark'};
if(!Object.prototype.hasOwnProperty.call(suites,kind)||args.length&&!(args.length===2&&args[0]==='--output'))throw new Error('Usage: node scripts/run-evaluation.cjs intents|notes|speech [--output docs/reports/new.json]');
const root=path.resolve(__dirname,'..'),output=path.resolve(root,args[1]||`docs/reports/${kind}-eight-followups-2026-11-04.json`),local=path.relative(root,output).replaceAll('\\','/');
if(path.isAbsolute(local)||!local.startsWith('docs/reports/')||local.includes('../')||!local.endsWith('.json')||existsSync(output))throw new Error('Choose a new JSON evidence file inside docs/reports; existing results are never overwritten.');
const result=spawnSync(process.execPath,[path.join(root,'node_modules/jest/bin/jest.js'),'--runInBand','--runTestsByPath',`__tests__/evaluation/${suites[kind]}.test.ts`],{cwd:root,stdio:'inherit',env:{...process.env,LAFINA_EVALUATION_OUTPUT:output}});
process.exitCode=result.status??1;
