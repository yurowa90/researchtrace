/* TRACE Drive + Sheets backend. Install the personalized copy from School settings.
 * Only signed server requests are accepted; students never receive this secret.
 * No AI service is called. Google files retain their private sharing settings.
 */
const TRACE_CONFIG = __TRACE_CONFIG__;

function setupTrace() {
  const p = PropertiesService.getScriptProperties();
  if (!TRACE_CONFIG.secret || TRACE_CONFIG.secret.length < 40) throw new Error('사이트에서 설치 코드를 다시 받으세요.');
  const owner = Session.getEffectiveUser().getEmail().toLowerCase();
  if (owner !== TRACE_CONFIG.ownerEmail.toLowerCase()) throw new Error('지정한 구글 계정으로 실행하세요.');
  if (typeof Sheets === 'undefined') throw new Error('왼쪽 서비스 +에서 Google Sheets API를 추가한 뒤 다시 실행하세요.');
  Sheets.Spreadsheets.get(TRACE_CONFIG.spreadsheetId, { fields: 'spreadsheetId' });
  SpreadsheetApp.openById(TRACE_CONFIG.spreadsheetId);
  ['folderId', 'recordsFolderId', 'referencesFolderId', 'resultsFolderId', 'backupsFolderId'].forEach(k => {
    const folder = DriveApp.getFolderById(TRACE_CONFIG[k]);
    if (folder.getOwner().getEmail().toLowerCase() !== owner) throw new Error('폴더 소유자를 확인하세요.');
    if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('폴더 공유를 제한됨으로 설정하세요.');
  });
  const file = DriveApp.getFileById(TRACE_CONFIG.spreadsheetId);
  if (file.getOwner().getEmail().toLowerCase() !== owner || file.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('데이터 시트의 소유자·공유를 확인하세요.');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    const previous=JSON.parse(p.getProperty('TRACE_CONFIG')||'null');
    if(previous){
      if(previous.spreadsheetId!==TRACE_CONFIG.spreadsheetId)throw new Error('기존 데이터 시트가 다릅니다.');
      if(previous.homeSiteId&&previous.homeSiteId!==TRACE_CONFIG.homeSiteId)throw new Error('기존 학교의 기준 사이트를 변경할 수 없습니다.');
      Object.keys(previous.columns).forEach(name=>{if(JSON.stringify(previous.columns[name])!==JSON.stringify(TRACE_CONFIG.columns[name]))throw new Error('기존 열은 변경할 수 없습니다: '+name);});
      readState(previous);
    }
    installMissingSheets(TRACE_CONFIG);
    p.setProperty('TRACE_CONFIG', JSON.stringify(TRACE_CONFIG));
    readState(TRACE_CONFIG);
  } finally { if(lock.hasLock())lock.releaseLock(); }
  return '설정 완료. 웹 앱으로 배포하고 /exec 주소를 TRACE에 입력하세요.';
}
function doGet() { return jsonResponse({ ok: false, code: 'SIGNED_POST_REQUIRED' }); }
function jsonResponse(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function fail(code) { throw new Error(code); }
function constantEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    const config = JSON.parse(PropertiesService.getScriptProperties().getProperty('TRACE_CONFIG') || 'null');
    if (!config) fail('NOT_CONFIGURED');
    const raw = event && event.postData && event.postData.contents;
    if (!raw || raw.length > 32 * 1024 * 1024) fail('INVALID_REQUEST');
    const envelope = JSON.parse(raw);
    if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') fail('INVALID_SIGNATURE');
    const signature = Utilities.base64Encode(Utilities.computeHmacSha256Signature(envelope.payload, config.secret, Utilities.Charset.UTF_8));
    if (!constantEqual(signature, envelope.signature)) fail('INVALID_SIGNATURE');
    const request = JSON.parse(envelope.payload);
    if (config.homeSiteId && request.homeSiteId !== config.homeSiteId) fail('WRONG_SCHOOL');
    if (request.version !== 1 || !Number.isFinite(request.timestamp) || Math.abs(Date.now() - request.timestamp) > 180000 || !/^[a-f0-9-]{36}$/.test(request.nonce)) fail('EXPIRED_REQUEST');
    lock.waitLock(20000);
    const cache = CacheService.getScriptCache();
    if (cache.get(request.nonce)) fail('REPLAY');
    cache.put(request.nonce, 'used', 600);
    return jsonResponse({ ok: true, data: dispatch(config, request.operation, request.data || {}) });
  } catch (error) {
    const allowed = ['NOT_CONFIGURED', 'INVALID_REQUEST', 'INVALID_SIGNATURE', 'EXPIRED_REQUEST', 'REPLAY', 'CONFLICT', 'INVALID_STATE', 'MISSING_FILE', 'HASH_MISMATCH', 'UNKNOWN_OPERATION', 'SHEET_EDITED', 'STORAGE_LIMIT', 'WRONG_SCHOOL'];
    return jsonResponse({ ok: false, code: allowed.indexOf(error.message) >= 0 ? error.message : 'GOOGLE_ERROR' });
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}
function sheetsApi(config, path, method, body) {
  const response = UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/' + config.spreadsheetId + path, {
    method: method || 'get', contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: body ? JSON.stringify(body) : undefined, muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) fail('GOOGLE_ERROR');
  return JSON.parse(response.getContentText());
}
function digest(text) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8).map(x => ('0' + (x & 255).toString(16)).slice(-2)).join(''); }
function tableDigest(tables, columns) {
  return digest(JSON.stringify(Object.keys(columns).filter(name=>['guidanceEntries','schoolIdentities','identityEvents','schoolOperations'].indexOf(name)<0||(tables[name]||[]).length>0).sort().map(name => [name, (tables[name] || []).map(row => columns[name].map(key => row[key] === undefined ? null : row[key]))])));
}
function checkedResultFile(config, id) {
  const file = DriveApp.getFileById(id), parents = file.getParents(); let inside = false;
  while (parents.hasNext()) if (parents.next().getId() === config.resultsFolderId) inside = true;
  if (!inside) fail('INVALID_STATE'); return file;
}
function decodeCell(config, value) {
  if (value === '@trace:null') return null;
  if (typeof value !== 'string') return value;
  if (value.indexOf('@trace:text:') === 0) return value.slice(12);
  if (value.indexOf('@trace:file:') === 0) return checkedResultFile(config, value.slice(12)).getBlob().getDataAsString('UTF-8');
  return value;
}
function encodeCell(config, value, createdFiles) {
  if (value === null || value === undefined) return { userEnteredValue: { stringValue: '@trace:null' } };
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('INVALID_STATE'); return { userEnteredValue: { numberValue: value } }; }
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  if (typeof value !== 'string') fail('INVALID_STATE');
  if (value.length > 40000) {
    const file = DriveApp.getFolderById(config.resultsFolderId).createFile(Utilities.newBlob(value, 'text/plain', 'trace-long-text-' + Utilities.getUuid() + '.txt'));
    createdFiles.push(file.getId()); value = '@trace:file:' + file.getId();
  } else if (value.indexOf('@trace:') === 0) value = '@trace:text:' + value;
  return { userEnteredValue: { stringValue: value } }; // '=...' is never executed as a formula.
}
function readState(config) {
  const names = Object.keys(config.columns), ranges = names.concat(['_meta']);
  const path = '/values:batchGet?' + ranges.map(name => 'ranges=' + encodeURIComponent("'" + name + "'!A:Z")).join('&') + '&valueRenderOption=UNFORMATTED_VALUE';
  const result = sheetsApi(config, path).valueRanges; const tables = {};
  names.forEach((name, index) => {
    const rows = result[index].values || [], headers = config.columns[name];
    if (JSON.stringify(rows[0]) !== JSON.stringify(headers)) fail('INVALID_STATE');
    tables[name] = rows.slice(1).filter(row => row.length).map(row => Object.fromEntries(headers.map((key, i) => [key, decodeCell(config, row[i] === undefined ? '' : row[i])])));
  });
  const meta = Object.fromEntries((result[names.length].values || []).slice(1));
  const revision = Number(meta.revision || 0);
  if (revision > 0 && meta.digest !== tableDigest(tables, config.columns)) fail('SHEET_EDITED');
  return { revision: revision, tables: tables, homeSiteId: config.homeSiteId || null };
}
function writeState(config, data) {
  const current = readState(config);
  // Administrator operation history may only grow; existing events are immutable.
  if (config.columns.schoolOperations) {
    const before = current.tables.schoolOperations || [], after = data.tables && data.tables.schoolOperations;
    if (!Array.isArray(after) || after.length < before.length || before.some((row, i) => JSON.stringify(config.columns.schoolOperations.map(key => row[key])) !== JSON.stringify(config.columns.schoolOperations.map(key => after[i][key])))) fail('INVALID_STATE');
  }
  if (current.revision !== data.expectedRevision) fail('CONFLICT');
  const names = Object.keys(config.columns);
  if (!data.tables || JSON.stringify(Object.keys(data.tables).sort()) !== JSON.stringify(names.sort())) fail('INVALID_STATE');
  const sheets = sheetsApi(config, '?fields=sheets.properties').sheets.map(s => s.properties);
  const requests = [], createdFiles = [];
  try {
    names.forEach(name => {
      const headers = config.columns[name], rows = data.tables[name];
      if (!Array.isArray(rows) || rows.length > 200000) fail('STORAGE_LIMIT');
      rows.forEach(row => { if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(headers.slice().sort())) fail('INVALID_STATE'); });
      if (JSON.stringify(current.tables[name]) === JSON.stringify(rows)) return;
      const sheet = sheets.find(s => s.title === name); if (!sheet) fail('INVALID_STATE');
      const endRow = Math.max(current.tables[name].length, rows.length) + 1;
      if (sheet.gridProperties.rowCount < endRow) requests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: 'ROWS', length: endRow - sheet.gridProperties.rowCount } });
      requests.push({ updateCells: { range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: headers.length }, rows: rows.map(row => ({ values: headers.map(key => encodeCell(config, row[key], createdFiles)) })), fields: 'userEnteredValue' } });
    });
    const meta = sheets.find(s => s.title === '_meta');
    requests.push({ updateCells: { start: { sheetId: meta.sheetId, rowIndex: 1, columnIndex: 0 }, rows: [ ['revision', current.revision + 1], ['digest', tableDigest(data.tables, config.columns)] ].map(row => ({ values: row.map(value => encodeCell(config, value, createdFiles)) })), fields: 'userEnteredValue' } });
    sheetsApi(config, ':batchUpdate', 'post', { requests: requests });
    return { revision: current.revision + 1 };
  } catch (error) { /* Retain immutable overflow files if commit status is uncertain. Never delete a possibly referenced file. */ throw error; }
}
function fileIndex(config) {
  const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('_files');
  const rows = sheet.getDataRange().getValues();
  return { sheet: sheet, rows: rows.slice(1), headers: rows[0] };
}
function fileEntry(config, key) { const index = fileIndex(config); return index.rows.find(row => row[0] === key); }
function putFile(config, data) {
  if (typeof data.objectKey !== 'string' || data.objectKey.length > 500 || typeof data.base64 !== 'string') fail('INVALID_REQUEST');
  const bytes = Utilities.base64Decode(data.base64);
  if (bytes.length > 20 * 1024 * 1024) fail('STORAGE_LIMIT');
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(x => ('0' + (x & 255).toString(16)).slice(-2)).join('');
  if (hash !== data.sha256 || bytes.length !== data.sizeBytes) fail('HASH_MISMATCH');
  const prior = fileEntry(config, data.objectKey);
  if (prior) { if (prior[2] !== hash || prior[3] !== bytes.length) fail('HASH_MISMATCH'); DriveApp.getFileById(prior[1]).getSize(); return { sizeBytes: bytes.length, sha256: hash }; }
  const folderId = data.objectKey.indexOf('reference-materials/') === 0 ? config.referencesFolderId : data.objectKey.indexOf('results/') === 0 ? config.resultsFolderId : config.recordsFolderId;
  const file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, data.contentType || 'application/octet-stream', String(data.originalName || 'TRACE 파일').slice(0, 200)));
  const index = fileIndex(config);
  const cells = [data.objectKey, file.getId(), hash, bytes.length, data.originalName || 'TRACE 파일', data.contentType || 'application/octet-stream'];
  sheetsApi(config, ':batchUpdate', 'post', { requests: [{ appendCells: { sheetId: index.sheet.getSheetId(), rows: [{ values: cells.map(value => encodeCell(config, value, [])) }], fields: 'userEnteredValue' } }] });
  return { sizeBytes: bytes.length, sha256: hash };
}
function dispatch(config, operation, data) {
  if (operation === 'health') { readState(config); return { version: 1, spreadsheetId: config.spreadsheetId, folderId: config.folderId, ownerEmail: Session.getEffectiveUser().getEmail(), schemaTables:Object.keys(config.columns), schemaColumns:config.columns, homeSiteId:config.homeSiteId||null }; }
  if (operation === 'backup') return backupState(config);
  if (operation === 'read') return readState(config);
  if (operation === 'commit') return writeState(config, data);
  if (operation === 'putFile') return putFile(config, data);
  if (operation === 'checkFiles') {
    const rows = fileIndex(config).rows;
    if (!Array.isArray(data.files) || data.files.some(file => !rows.some(row => row[0] === file.objectKey && row[3] === file.sizeBytes))) fail('MISSING_FILE');
    return { checked: data.files.length };
  }
  if (operation === 'headFile' || operation === 'getFile') {
    const row = fileEntry(config, data.objectKey); if (!row) fail('MISSING_FILE');
    const file = DriveApp.getFileById(row[1]);
    if (file.getSize() !== row[3]) fail('HASH_MISMATCH');
    const result = { sizeBytes: row[3], sha256: row[2], contentType: row[5] };
    if (operation === 'getFile') { const bytes = file.getBlob().getBytes(); const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(x => ('0' + (x & 255).toString(16)).slice(-2)).join(''); if (hash !== row[2]) fail('HASH_MISMATCH'); result.base64 = Utilities.base64Encode(bytes); }
    return result;
  }
  fail('UNKNOWN_OPERATION');
}

// Existing headers and rows remain intact. Only absent, allowlisted tabs are added.
function installMissingSheets(config) {
  const sheets=sheetsApi(config,'?fields=sheets.properties').sheets.map(s=>s.properties);
  const headers=Object.assign({},config.columns,{_meta:['key','value'],_files:['objectKey','driveId','sha256','sizeBytes','originalName','contentType']});
  const requests=[];let id=Math.max(0,...sheets.map(s=>s.sheetId))+1;
  Object.keys(headers).forEach(name=>{
    const prior=sheets.find(s=>s.title===name);
    if(prior){
      const first=sheetsApi(config,'/values/'+encodeURIComponent("'"+name+"'!A1:Z1")).values;
      if(JSON.stringify((first||[])[0])!==JSON.stringify(headers[name]))fail('INVALID_STATE');
      return;
    }
    const sheetId=id++;
    requests.push({addSheet:{properties:{sheetId:sheetId,title:name,gridProperties:{rowCount:1000,columnCount:26}}}});
    requests.push({updateCells:{start:{sheetId:sheetId,rowIndex:0,columnIndex:0},rows:[{values:headers[name].map(v=>({userEnteredValue:{stringValue:v}}))}],fields:'userEnteredValue'}});
  });
  if(requests.length)sheetsApi(config,':batchUpdate','post',{requests:requests});
}
function backupState(config){
  const state=readState(config),files=fileIndex(config).rows;
  const body=JSON.stringify({format:'trace-private-backup-v1',createdAt:new Date().toISOString(),revision:state.revision,columns:config.columns,tables:state.tables,fileIndex:files,contentDigest:tableDigest(state.tables,config.columns)});
  const folder=DriveApp.getFolderById(config.backupsFolderId);
  if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)fail('INVALID_STATE');
  const file=folder.createFile(Utilities.newBlob(body,'application/json','TRACE-data-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'));
  return {url:file.getUrl(),revision:state.revision};
}
