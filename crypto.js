// --- CONTEXT: NODE --- //

const crypto = require('crypto');

function generateFingerprint(buf) {
  var fingerprint = crypto.createHash('sha1').update(buf).digest('hex').replace(/(.{2})/g, '$1:');
  return fingerprint.substr(0, fingerprint.length-1).toUpperCase();
}

function generateServerID(buf) {
  return crypto.createHash('sha256').update(buf).digest('base64');
}

module.exports = {generateFingerprint, generateServerID};
