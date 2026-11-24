const fs = require('node:fs');
const path = require('node:path');

function samePath(left, right) {
  const normalize = value => {
    const absolute = path.resolve(value);
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  };
  return normalize(left) === normalize(right);
}

function preserveLegacyProfile(app, files = fs) {
  const current = app.getPath('userData');
  const standard = path.join(app.getPath('appData'), app.getName());
  // Explicit profiles, including isolated QA profiles, keep their own data.
  if (!samePath(current, standard)) return current;
  const session = app.getPath('sessionData');
  const legacy = path.join(app.getPath('appData'), 'nijan');
  files.mkdirSync(legacy, { recursive: true });
  app.setPath('userData', legacy);
  if (samePath(session, current)) app.setPath('sessionData', legacy);
  return legacy;
}

module.exports = { preserveLegacyProfile };
