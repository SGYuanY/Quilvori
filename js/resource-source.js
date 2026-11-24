/* Public attribution only. Download credentials and local file details are never exported. */
(function (root) {
  'use strict';
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const text = (value, limit) => typeof value === 'string' && value.length <= limit
    ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : '';
  function privateHost(host) {
    if (host === 'localhost' || /\.(localhost|local|internal|lan|home)$/.test(host)) return true;
    if (host.startsWith('[')) {
      const address = host.slice(1, -1), halves = address.split('::');
      const left = halves[0] ? halves[0].split(':') : [];
      const right = halves[1] ? halves[1].split(':') : [];
      const words = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right].map(part => parseInt(part, 16));
      return words[0] < 0x2000 || words[0] >= 0x4000 || words[0] === 0x2002
        || words[0] === 0x2001 && (words[1] <= 0x1ff || words[1] === 0xdb8)
        || words[0] >= 0x3ff0;
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b, c] = host.split('.').map(Number);
      return a === 0 || a === 10 || a === 127 || a >= 224
        || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254
        || a === 172 && b >= 16 && b <= 31
        || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2))
        || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)
        || a === 203 && b === 0 && c === 113;
    }
    return !host.includes('.');
  }
  function sourceUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    const input = value.trim();
    if (!input || /[\u0000-\u0020\u007f\\]/.test(input)) return null;
    let url;
    try { url = new URL(input); } catch (_) { return null; }
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || privateHost(host)) return null;
    url.hostname = host;
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (/token|secret|password|credential|signature/.test(normalized)
        || /^(?:key|apikey|accesskey|accesskeyid|awsaccesskeyid|authkey|auth|authorization|session|sessionid|cookie|jwt|bearer|sig|ex|is|hm|code|state|oauthverifier|oauthconsumerkey)$/.test(normalized)
        || /^(?:xamz|xgoog|utm)/.test(normalized)) url.searchParams.delete(key);
    }
    // Fragments can carry OAuth credentials and are unnecessary for canonical source links.
    url.hash = '';
    return url.href.length <= 2048 ? url.href : null;
  }
  function clean(value) {
    if (!object(value) || !object(value.author)) return null;
    const name = text(value.author.name, 160), postUrl = sourceUrl(value.postUrl);
    if (!name || !postUrl) return null;
    const result = { author: { name }, postUrl, license: { status: 'unknown' } };
    const catalogId = text(value.catalogId, 128);
    if (/^[a-z0-9][a-z0-9._:-]*$/i.test(catalogId)) result.catalogId = catalogId;
    const profileUrl = sourceUrl(value.author.profileUrl);
    if (profileUrl) result.author.profileUrl = profileUrl;
    if (object(value.license)) {
      if (['unknown', 'personal', 'redistributable'].includes(value.license.status)) result.license.status = value.license.status;
      const note = text(value.license.note, 4000), evidenceUrl = sourceUrl(value.license.evidenceUrl);
      if (note) result.license.note = note;
      if (evidenceUrl) result.license.evidenceUrl = evidenceUrl;
    }
    return result;
  }
  const api = { clean, sourceUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAResourceSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
