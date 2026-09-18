import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { tableColumns } from "../lib/school-tables.ts";

export function scriptHarness() {
  const config={secret:"test-only-key-".repeat(5),columns:structuredClone(tableColumns),backupsFolderId:"backups",spreadsheetId:"sheet",resultsFolderId:"results",recordsFolderId:"records",referencesFolderId:"references",folderId:"folder",ownerEmail:"owner@example.test"};
  const cells=Object.fromEntries(Object.entries(tableColumns).map(([name,headers])=>[name,[[...headers]]]));
  cells._meta=[["key","value"],["revision",0],["digest",""]];cells._files=[["objectKey","driveId","sha256","sizeBytes","originalName","contentType"]];
  const properties=Object.keys(cells).map((title,sheetId)=>({title,sheetId,gridProperties:{rowCount:1000,columnCount:26}}));
  const cache=new Map(),files=new Map();let locked=false,failBatch=false;
  const cellValue=c=>c?.userEnteredValue?.stringValue??c?.userEnteredValue?.numberValue??c?.userEnteredValue?.boolValue??"";
  const resultObject=value=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(value)});
  const context=vm.createContext({console,Date,JSON,Math,Number,Object,Array,String,Error,
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>JSON.stringify(config)})},
    LockService:{getScriptLock:()=>({waitLock:()=>{locked=true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}})},
    CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value)})},
    Session:{getEffectiveUser:()=>({getEmail:()=>config.ownerEmail})},ScriptApp:{getOAuthToken:()=>"fixture-token"},
    ContentService:{MimeType:{JSON:"json"},createTextOutput:text=>({setMimeType:()=>({text})})},
    Utilities:{Charset:{UTF_8:"utf8"},DigestAlgorithm:{SHA_256:"sha256"},base64Encode:data=>Buffer.from(data).toString("base64"),base64Decode:data=>[...Buffer.from(data,"base64")],computeHmacSha256Signature:(data,key)=>[...createHmac("sha256",key).update(data).digest()],computeDigest:(_algorithm,data)=>[...createHash("sha256").update(typeof data==="string"?data:Buffer.from(data)).digest()],getUuid:randomUUID,newBlob:(data,type,name)=>({data:typeof data==="string"?Buffer.from(data):Buffer.from(data),type,name})},
    DriveApp:{Access:{PRIVATE:"private"},getFileById:id=>{const f=files.get(id);if(!f)throw new Error("missing");return f;},getFolderById:parent=>({getSharingAccess:()=>"private",createFile:blob=>{const id=randomUUID(),f={getId:()=>id,getUrl:()=>"https://drive.google.com/file/d/"+id,getSize:()=>blob.data.length,getBlob:()=>({getBytes:()=>[...blob.data],getDataAsString:()=>blob.data.toString("utf8")}),getParents:()=>{let found=false;return{hasNext:()=>!found,next:()=>{found=true;return{getId:()=>parent};}};}};files.set(id,f);return f;}})},
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>({getDataRange:()=>({getValues:()=>structuredClone(cells[name])}),getSheetId:()=>properties.find(p=>p.title===name).sheetId})})},
    UrlFetchApp:{fetch:(url,options)=>{
      const u=new URL(url);
      if(u.pathname.endsWith("values:batchGet"))return resultObject({valueRanges:u.searchParams.getAll("ranges").map(range=>({values:structuredClone(cells[range.match(/^'([^']+)'/)[1]])}))});
      if(u.pathname.includes("/values/")){const range=decodeURIComponent(u.pathname.split("/values/")[1]);const name=range.match(/^'([^']+)'/)[1];return resultObject({values:[structuredClone(cells[name][0])]});}
      if(u.pathname.endsWith(":batchUpdate")){
        if(failBatch) return{getResponseCode:()=>500};
        const requests=JSON.parse(options.payload).requests,next=structuredClone(cells);
        for(const req of requests){
          if(req.addSheet){properties.push(req.addSheet.properties);next[req.addSheet.properties.title]=[];continue;}
          const update=req.updateCells??req.appendCells;if(!update)continue;
          const locator=update.range??update.start??update, sheet=properties.find(p=>p.sheetId===locator.sheetId),name=sheet.title;
          const first=req.appendCells?next[name].length:locator.startRowIndex??locator.rowIndex??0;
          const count=locator.endRowIndex!==undefined?locator.endRowIndex-first:update.rows.length;
          for(let i=0;i<count;i++)next[name][first+i]=(update.rows[i]?.values??[]).map(cellValue);
          while(next[name].length&&next[name].at(-1).length===0)next[name].pop();
        }
        Object.assign(cells,next);return resultObject({});
      }
      return resultObject({sheets:properties.map(p=>({properties:p}))});
    }},
  });
  vm.runInContext(readFileSync(new URL("../google/Code.gs",import.meta.url),"utf8").replace("__TRACE_CONFIG__",JSON.stringify(config)),context);
  function request(operation,data={},changes={}){
    const payload=JSON.stringify({version:1,operation,data,timestamp:Date.now(),nonce:randomUUID(),...changes});
    return{postData:{contents:JSON.stringify({payload,signature:createHmac("sha256",config.secret).update(payload).digest("base64")})}};
  }
  const send=event=>JSON.parse(context.doPost(event).text);
  return{context,config,cells,files,properties,request,send,failNextBatch:()=>{failBatch=true;}};
}
