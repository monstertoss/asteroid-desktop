// --- CONTEXT: BROWSER --- //

const {remote} = require('electron');
const cryptoHelper = remote.require('./crypto.js');

const {OP} = require('./constants.js');

const UI = require('./ui.js');

const keypair = remote.getGlobal('keypair');

function handleUnknownPublicKey(socket, payload) {
  // TODO: Show popup to confirm our fingerprint
  console.log('Confirm this fingerprint:', keypair.fingerprint);
}

function handleKnownPublicKey(socket, payload) {
  // TODO: Hide popup to confirm our fingerprint
  console.log('Confirmed fingerprint!');
}

function handleChallenge(socket, payload) {
  // Respond to a handshake challenge. Format: <server id>:<random data>
  var challenge = payload.challenge.split(':');

  // Generate the server's id
  var serverID = cryptoHelper.generateServerID(socket.getPeerCertificate().raw);

  // If the server's id isn't the same as in the challenge, disconnect
  if(challenge.length !== 2 || challenge[0] !== serverID)
    return socket.destroy();

  // Otherwise, sign the challenge
  var signature = keypair.sign(payload.challenge);

  // And send the response
  socket.send(OP.C2S_HANDSHAKE_RESPONSE, {challenge: payload.challenge, signature});
}

module.exports = {handleUnknownPublicKey, handleKnownPublicKey, handleChallenge};
