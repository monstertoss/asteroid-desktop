const {remote} = require('electron');
const tls = remote.require('tls');
const dgram = remote.require('dgram');
const crypto = remote.require('crypto');

const WHO = Buffer.from([0x49,0x4c,0x7b,0xae,0x30,0x30,0x69,0x9e]);
const HERE = Buffer.from([0x22,0xd6,0xb1,0x4b,0x35,0x28,0x10,0x51]);

const OP = {
  C2S_HANDSHAKE_PUBLIC_KEY: 0,
  S2C_HANDSHAKE_PUBLIC_KEY_UNKNOWN: 1,
  S2C_HANDSHAKE_PUBLIC_KEY_KNOWN: 2,
  S2C_HANDSHAKE_CHALLENGE: 3,
  C2S_HANDSHAKE_CHALLENGE: 4,
  C2S_HANDSHAKE_RESPONSE: 5,
  S2C_HANDSHAKE_RESPONSE: 6,
  S2C_HANDSHAKE_OK: 7,
  C2S_HANDSHAKE_OK: 8,
}

var keypair = remote.getGlobal('keypair');
if(keypair == null) {
  setTimeout(function onTimeout() {
    keypair = remote.getGlobal('keypair');
    if(keypair == null)
      setTimeout(onTimeout, 100);
    else
      console.log('Loaded key:', keypair.fingerprint);
  }, 100);
  console.log('Loading key...');
} else
  console.log('Loaded key:', keypair.fingerprint);

const udpSocket = dgram.createSocket('udp4');
udpSocket.bind(8877, discoverDevices);
const discoveryInterval = setInterval(discoverDevices, 5000);

var discoveredDevices = {};

function discoverDevices() {
  if(keypair == null)
    return;

  const packet = Buffer.concat([WHO,Buffer.from(keypair.fingerprint)]);
  udpSocket.setBroadcast(true);
  udpSocket.send(packet, 8877, '255.255.255.255');

  var triggerUpdate = false;
  Object.keys(discoveredDevices).forEach((address) => {
    discoveredDevices[address].purge--;
    if(discoveredDevices[address].purge < 1) {
      delete discoveredDevices[address];
      triggerUpdate = true;
    }
  });
  if(triggerUpdate)
    updateDiscoveredDevices();
}

udpSocket.on('message', function(data, info) {
  if(!data.slice(0,HERE.length).equals(HERE))
    return;

  var known = data.readUInt8(HERE.length) == 2; // we just care for KNOWN vs anything else
//  known = (known == 0 ? 'NO INFO' : (known == 1 ? 'UNKNOWN' : 'KNOWN'))

  var name = data.slice(HERE.length+1).toString();

  var shouldUpdate = !discoveredDevices[info.address];
  discoveredDevices[info.address] = {purge: 3, name, known, address: info.address};
  if(shouldUpdate)
    updateDiscoveredDevices();
});

function updateDiscoveredDevices() {
  var panel = document.getElementById('discoveredDevices');
  while(panel.lastChild) {
    panel.removeChild(panel.lastChild);
  }

  var known = document.createElement('div');
  var areThereKnown = false;
  var unknown = document.createElement('div');
  var areThereUnknown = false;

  if(Object.keys(discoveredDevices).length > 0) {
    Object.keys(discoveredDevices).forEach((address, index) => {
      const device = discoveredDevices[address];

      var button = document.createElement('button');
      button.className = 'mui-btn mui-btn--flat mui-btn--primary btn-block mui--text-left';
      button.textContent = device.name;

      button.onclick = (e) => {
        connect(address);
      }

      var ip = document.createElement('small');
      ip.className = 'mui--pull-right';
      ip.textContent = address;
      button.appendChild(ip);

      (device.known ? known : unknown).appendChild(button);
      (device.known ? areThereKnown = true : areThereUnknown = true)
    });

    if(areThereKnown) {
      var knownHeadline = document.createElement('h5');
      var knownHeadlineStrong = document.createElement('strong');
      knownHeadlineStrong.textContent = 'KNOWN DEVICES';
      knownHeadline.appendChild(knownHeadlineStrong);
      panel.appendChild(knownHeadline);
      panel.appendChild(known);
    }

    if(areThereKnown && areThereUnknown)
      panel.appendChild(document.createElement('hr'));

    if(areThereUnknown) {
      var unknownHeadline = document.createElement('h5');
      var unknownHeadlineStrong = document.createElement('strong');
      unknownHeadlineStrong.textContent = 'UNKNOWN DEVICES';
      unknownHeadline.appendChild(unknownHeadlineStrong);
      panel.appendChild(unknownHeadline);
      panel.appendChild(unknown);
    }
  } else {
    var h3 = document.createElement('h3');
    h3.className = 'mui--text-center';
    h3.textContent = 'No devices detected yet.';
    panel.appendChild(h3);
  }
}

function onConnect(event) {
  var ip = document.getElementById('connectIP').value;

  if(!ip)
    return;

  connect(ip);
}

var socket;
function connect(address) {
  if(socket)
    return console.log('Could not connect: Already connected');

  socket = tls.connect({host: address, port: 8877, rejectUnauthorized: false});

  socket.on('secureConnect', () => {
    console.log('CONNECTED');
    socket.send(OP.C2S_HANDSHAKE_PUBLIC_KEY, {key: Buffer.from(keypair.publicpem).toString('base64')});
  });

  socket.on('close', () => {
    console.log('CLOSED');
    socket = null;
  });

  var socketMessage = Buffer.alloc(0);
  socket.on('data', (data) => {
    socketMessage = Buffer.concat([socketMessage, data]);
    var packets = socketMessage.toString().split('\n');
    if(packets.length == 1)
      return;
    for (var i = 0; i < packets.length-1; i++) {
      var data = Buffer.from(packets[i] + '\n');
      socketMessage = socketMessage.slice(data.length);

      handlePacket(data);
    }
  });

  socket.send = function(opCode, payload) {
    var buf = Buffer.concat([
                Buffer.from([opCode]),
                Buffer.from(
                  Buffer.from(
                    JSON.stringify(payload)
                  ).toString('base64') +
                  '\n'
                )
              ]);
    socket.write(buf);
  };

  function handlePacket(data) {
    try {
      var opCode = data.readUInt8(0);
      var message = data.toString('utf8', 1, data.length-1);
      var json = Buffer.from(message, 'base64').toString();

      var payload = JSON.parse(json);
      console.log('Got message with opcode: ' + opCode);
      handleMessage(opCode, payload);
    } catch(e) {
      console.error(e);
      socket.destroy();
    }
  }

  function handleMessage(opCode, payload) {
    switch(opCode) {
      case OP.S2C_HANDSHAKE_PUBLIC_KEY_UNKNOWN:
        console.log('Confirm this fingerprint:', keypair.fingerprint);
        break;

      case OP.S2C_HANDSHAKE_PUBLIC_KEY_KNOWN:
        console.log('Confirmed fingerprint!');
        break;

      case OP.S2C_HANDSHAKE_CHALLENGE:
        var challenge = payload.challenge.split(':');

        var serverID = generateServerID(socket.getPeerCertificate().raw);
        if(challenge.length != 2 || challenge[0] != serverID)
          return socket.destroy();

        var signature = keypair.sign(payload.challenge);

        socket.send(OP.C2S_HANDSHAKE_RESPONSE, {challenge: payload.challenge, signature});
        break;

      case OP.S2C_HANDSHAKE_RESPONSE:
        // RESERVED
        break;

      case OP.S2C_HANDSHAKE_OK:
        console.log('Handshake OK!');
        break;
    }
  }
}

function generateFingerprint(buf) {
  var fingerprint = crypto.createHash('sha1').update(buf).digest('hex').replace(/(.{2})/g, '$1:');
  return fingerprint.substr(0, fingerprint.length-1).toUpperCase();
}

function generateServerID(buf) {
  return crypto.createHash('sha256').update(buf).digest('base64');
}
