/* Desktop remote imports use public HTTPS, pinned DNS and bounded redirects. */
const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const { normalizeUrl, safeUrl, filename, MAX_BYTES, TIMEOUT, error } = require('../js/link-import');
const blocked = new net.BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(ip,bits,'ipv4');
blocked.addSubnet('2001::',23,'ipv6'); blocked.addSubnet('2001:db8::',32,'ipv6'); blocked.addSubnet('2002::',16,'ipv6');
function isPublicAddress(address) {
  const family = net.isIP(address);
  return family === 4 ? !blocked.check(address,'ipv4') : family === 6 && /^[23]/i.test(address) && !blocked.check(address,'ipv6');
}
function createDownloader({ lookup = dns.lookup.bind(dns), request = https.request } = {}) {
  return async function downloadRemote(input, { signal } = {}) {
    const controller = new AbortController(); let timedOut = false;
    if (signal?.aborted) throw error('cancelled');
    const cancel = () => controller.abort(); signal?.addEventListener('abort',cancel,{once:true});
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT);
    const get = async (value, redirects = 0) => {
      if (controller.signal.aborted) throw error('cancelled');
      const url = new URL(normalizeUrl(value)), host = url.hostname.replace(/^\[|\]$/g,'');
      const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await new Promise((resolve,reject) => {
        const aborted = () => reject(error('cancelled'));
        controller.signal.addEventListener('abort',aborted,{once:true});
        Promise.resolve().then(() => lookup(host,{all:true,verbatim:true})).then(resolve,reject).finally(() => controller.signal.removeEventListener('abort',aborted));
      });
      if (controller.signal.aborted) throw error('cancelled');
      if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) throw error('private-url');
      for (let index=0;index<addresses.length;index++) {
        if (controller.signal.aborted) throw error('cancelled');
        const chosen=addresses[index];
        try { return await new Promise((resolve,reject) => {
        let req;
        const headerTimer=setTimeout(()=>{reject(error('network'));req?.destroy?.();},Math.min(6000,Math.floor(TIMEOUT/(addresses.length+1))));
        const fail=(err)=>{clearTimeout(headerTimer);reject(err);};
        try { req = request(url, { method:'GET', signal:controller.signal, agent:false, headers:{Accept:'application/json,image/png,application/octet-stream;q=0.9','Accept-Encoding':'identity','User-Agent':'Quilvori/0.1'}, lookup: (_host, options, callback) => options?.all ? callback(null,[chosen]) : callback(null,chosen.address,chosen.family) }, (res) => {
          clearTimeout(headerTimer);
          const status = res.statusCode || 0;
          if ([301,302,303,307,308].includes(status)) {
            res.resume(); if (redirects >= 5 || !res.headers.location) { reject(error('redirect')); return; }
            let next; try { next = normalizeUrl(new URL(res.headers.location,url).href); } catch (err) { reject(err); return; }
            get(next,redirects+1).then(resolve,reject); return;
          }
          if (status < 200 || status >= 300) { res.resume(); reject(error(`http-${status}`)); return; }
          if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { res.resume(); reject(error('encoding')); return; }
          if (Number(res.headers['content-length']) > MAX_BYTES) { res.destroy(); reject(error('too-large')); return; }
          const chunks=[];let size=0;
          res.on('data',chunk=>{ size+=chunk.length;if(size>MAX_BYTES){reject(error('too-large'));res.destroy();return;}chunks.push(chunk); });
          res.on('aborted',()=>reject(error('network'))); res.on('error',()=>reject(error('network')));
          res.on('end',()=>resolve({ bytes:new Uint8Array(Buffer.concat(chunks)), url:safeUrl(url.href), contentType:String(res.headers['content-type']||''), filename:filename(url.href) }));
        });
        req.on('error',()=>fail(error('network')));req.end();
        } catch (_) { fail(error('network')); }
      }); }
      catch (err) { if(err.code!=='network'||index===addresses.length-1)throw err; }
      }
    };
    try { return await get(input); }
    catch (err) { if(controller.signal.aborted) throw error(timedOut?'timeout':'cancelled');throw err.code && !/^E[A-Z]+$/.test(err.code)?err:error('network'); }
    finally { clearTimeout(timer);signal?.removeEventListener('abort',cancel); }
  };
}
module.exports = { isPublicAddress, createDownloader, downloadRemote:createDownloader() };
