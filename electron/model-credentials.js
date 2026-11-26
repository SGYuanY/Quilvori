/* OS-backed encryption for the desktop model registry. Only trusted application frames call this module. */
'use strict';

function credentialVault(safeStorage, platform = process.platform) {
  async function available() {
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('credential-unavailable');
    if (platform === 'linux' && ['basic_text','unknown'].includes(safeStorage.getSelectedStorageBackend())) {
      throw new Error('credential-unavailable');
    }
  }
  function profile(value) {
    if (typeof value !== 'string' || !value || value.length > 512) throw new Error('invalid-profile');
    return value;
  }
  async function seal(id, key) {
    id = profile(id);
    if (typeof key !== 'string' || !key || key.length > 65536) throw new Error('invalid-key');
    await available();
    const data = JSON.stringify({type:'quilvori.model-key.v1',id,key});
    const encrypted = await safeStorage.encryptStringAsync(data);
    return encrypted.toString('base64');
  }
  async function open(id, blob) {
    id = profile(id);
    if (typeof blob !== 'string' || blob.length > 600000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(blob)) throw new Error('invalid-key');
    await available();
    const {result} = await safeStorage.decryptStringAsync(Buffer.from(blob,'base64'));
    const stored = JSON.parse(result);
    if (stored?.type !== 'quilvori.model-key.v1' || stored.id !== id || typeof stored.key !== 'string') throw new Error('invalid-key');
    return stored.key;
  }
  return {seal,open};
}
module.exports = {credentialVault};
