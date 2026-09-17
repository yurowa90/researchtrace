import assert from 'node:assert/strict';
import test from 'node:test';
import { schoolSite, roleAllowedOnSite } from '../lib/site-runtime.ts';
import { getStorageConnection } from '../lib/google-bridge.ts';

test('secondary sites require explicit shared storage and never silently use an empty local database', async () => {
  const env=globalThis.__portalTestEnv;
  env.TRACE_PORTAL_MODE='student';
  assert.throws(()=>schoolSite(),/기준 사이트/);
  env.TRACE_HOME_SITE_ID='existing-home';
  assert.equal(schoolSite().isHome,false);
  await assert.rejects(()=>getStorageConnection(),/공통 구글/);
  env.TRACE_SHARED_GOOGLE_CONNECTION=JSON.stringify({homeSiteId:'wrong-home',secret:'a'.repeat(64),endpoint:'https://script.google.com/macros/s/'+'a'.repeat(24)+'/exec'});
  await assert.rejects(()=>getStorageConnection(),/기준 사이트/);
  env.TRACE_SHARED_GOOGLE_CONNECTION=JSON.stringify({homeSiteId:'existing-home',secret:'a'.repeat(64),endpoint:'https://script.google.com/macros/s/'+'a'.repeat(24)+'/exec'});
  const connection=await getStorageConnection();assert.equal(connection.state,'google');assert.equal(connection.ownerAuthUserId,'');
  delete env.TRACE_PORTAL_MODE;delete env.TRACE_HOME_SITE_ID;delete env.TRACE_SHARED_GOOGLE_CONNECTION;
});
test('portal roles separate staff and students while administrators retain access', () => {
  assert.equal(roleAllowedOnSite('student','teacher'),false);assert.equal(roleAllowedOnSite('teacher','student'),false);
  assert.equal(roleAllowedOnSite('student','student'),true);assert.equal(roleAllowedOnSite('teacher','teacher'),true);
  for(const mode of ['unified','student','teacher','admin'])assert.equal(roleAllowedOnSite('admin',mode),true);
});
