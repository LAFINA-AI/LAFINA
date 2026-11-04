import {spawnSync} from 'node:child_process';

it.each([
 ['-m','unittest','backend.tests.test_event_time_contract_isolated','backend.tests.test_deployment_health_isolated'],
 ['-m','unittest','discover','-s','scripts/tests','-p','test_backend_health.py'],
])('verifies deployment contracts without application settings: %j',(...args:string[])=>{
 const result=spawnSync(process.platform==='win32'?'python':'python3',['-X','utf8',...args],{encoding:'utf8',timeout:20000});
 expect({status:result.status,error:result.error?.message,output:result.stderr}).toEqual({status:0,error:undefined,output:expect.stringContaining('OK')});
});
