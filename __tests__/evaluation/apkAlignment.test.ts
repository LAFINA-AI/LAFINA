import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

it('validates the APK ELF auditor with synthetic encodings and malformed ZIPs',()=>{
  const run=spawnSync(process.platform==='win32'?'python':'python3',[
    '-X','utf8','-m','unittest','discover','-s','scripts/tests','-p','test_apk_alignment.py',
  ],{cwd:resolve(__dirname,'../..'),encoding:'utf8',timeout:20000});
  expect({status:run.status,error:run.error?.message,output:run.stderr}).toEqual({
    status:0,error:undefined,output:expect.stringContaining('OK'),
  });
});
