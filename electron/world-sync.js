/* Standalone World Info codec for the native file journal. */
'use strict';
const {isDeepStrictEqual}=require('node:util');
const {createFileSync,fail,publicError}=require('./sync-file');
const MAX_BYTES=32*1024*1024;

function checkDocument(value) {
  // Use the same World Info validation as the comparison preview, including
  // native UID rules and the handling of older/third-party entry settings.
  require('../js/formats');
  require('../js/world-sync');
  try { return globalThis.TAWorldSync.validate(value); }
  catch { fail('invalid'); }
}

function parseDocument(bytes) {
  try { return checkDocument(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))); }
  catch { fail('invalid'); }
}

function encodeDocument(document,original) {
  checkDocument(document);
  const text=original.toString('utf8'), indent=text.match(/\n([ \t]+)"/)?.[1] || '';
  let body;
  try {
    body=JSON.stringify(document,null,indent);
    if (Buffer.byteLength(body)>MAX_BYTES) fail('too-large');
    if (!isDeepStrictEqual(document,JSON.parse(body))) fail('invalid');
  } catch(e) { if (e.reason==='too-large') throw e; fail('invalid'); }
  if (text.includes('\r\n')) body=body.replaceAll('\n','\r\n');
  if (text.startsWith('\uFEFF')) body='\uFEFF'+body;
  if (text.endsWith('\n')) body+=text.endsWith('\r\n')?'\r\n':'\n';
  if (Buffer.byteLength(body)>MAX_BYTES) fail('too-large');
  return Buffer.from(body,'utf8');
}

const codec={kind:'world',extension:/\.json$/i,maxBytes:MAX_BYTES,field:'document',
  read:parseDocument,encode:encodeDocument,matches:isDeepStrictEqual};
module.exports={createWorldSync:(profile,io)=>createFileSync(profile,codec,io),MAX_BYTES,publicError:error=>publicError('world',error)};
