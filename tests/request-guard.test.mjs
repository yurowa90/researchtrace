import assert from 'node:assert/strict';
import test from 'node:test';
import {rejectCrossSiteWrite} from '../lib/request-guard.ts';
import {GET,POST} from '../app/api/school-access/route.ts';

test('write boundary rejects cross-site and malformed origins while permitting same-site forms',()=>{
 const url='https://school.example/api/student-records';
 for(const headers of [{Origin:'https://other.example'},{Origin:'null'},{Origin:'https://school.example','Sec-Fetch-Site':'cross-site'}])assert.equal(rejectCrossSiteWrite(new Request(url,{method:'POST',headers})).status,403);
 assert.equal(rejectCrossSiteWrite(new Request(url,{method:'POST',headers:{Origin:'https://school.example','Sec-Fetch-Site':'same-origin'}})),null);
 assert.equal(rejectCrossSiteWrite(new Request(url,{method:'POST'})),null);
});
test('identity endpoints require authenticated account and reject forged cross-site review before writes',async()=>{
 assert.equal((await GET()).status,401);
 assert.equal((await POST(new Request('https://school.example/api/school-access',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}))).status,403);
 assert.equal((await POST(new Request('https://school.example/api/school-access',{method:'POST',headers:{Origin:'https://school.example'},body:'{}'}))).status,401);
});
