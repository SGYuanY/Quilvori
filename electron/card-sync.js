/* Character PNG and JSON files use the same private journal as World Info, in a separate grant namespace. */
'use strict';
const {types}=require('node:util');
const {createFileSync,fail,publicError}=require('./sync-file');

const MAX_BYTES=64*1024*1024;
function read(bytes,filename) {
  globalThis.TAResourceSource ||= require('../js/resource-source');
  require('../js/png');
  require('../js/formats');
  require('../js/world-sync');
  require('../js/card-sync');
  try { globalThis.TACardSync.decode(bytes,filename); }
  catch { fail('invalid'); }
  return new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
}

const codec={
  kind:'card',extension:/\.(?:png|json)$/i,maxBytes:MAX_BYTES,field:'bytes',read,
  matches:(original,input)=>Buffer.compare(original,input)===0,
  encode(bytes,original,filename){read(bytes,filename);return bytes;},
};

function createCardSync(profile,io) {
  const service=createFileSync(profile,codec,io);
  return {...service,async write(target,hash,bytes,operationId) {
    // Take ownership of a bounded copy before enqueueing. A caller may reuse its byte buffer.
    if (!types.isUint8Array(bytes) || !bytes.byteLength) {
      throw Object.assign(new Error('card-sync-invalid'),{code:'card-sync-invalid'});
    }
    if (bytes.byteLength>MAX_BYTES) {
      throw Object.assign(new Error('card-sync-too-large'),{code:'card-sync-too-large'});
    }
    return service.write(target,hash,Buffer.from(bytes),operationId);
  }};
}
module.exports={createCardSync,MAX_BYTES,publicError:error=>publicError('card',error)};
