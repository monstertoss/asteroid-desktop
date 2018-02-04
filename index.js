const {remote} = require('electron');
const tls = remote.require('tls');
const dgram = remote.require('dgram');
const crypto = remote.require('crypto');
const zstd = remote.require('node-zstd');

// UDP Package headers
const WHO = Buffer.from([0x49,0x4c,0x7b,0xae,0x30,0x30,0x69,0x9e]);
const HERE = Buffer.from([0x22,0xd6,0xb1,0x4b,0x35,0x28,0x10,0x51]);

// The same message opcodes as on the client
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

  C2S_REQUEST_CONTACTS: 9,
  S2C_RESPONSE_CONTACTS: 10,
}

// Fetch keypair. Appearantly, the render thread is only started after the main thread completed its work.
// Anyway, we still provide a function to wait and retrieve it later if the keypair is still null
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

/**** Automagic device discovery ****/

// Create udp socket
const udpSocket = dgram.createSocket('udp4');
// Listen on port 8877
udpSocket.bind(8877, discoverDevices);
// Search for new devices every 5 seconds, as long as we arent connected
var discoveryInterval = setInterval(discoverDevices, 5000);

// Internal storage of all devices. This is used to keep track of discovered devices and update the UI if necessary
var discoveredDevices = {};

// Broadcast WHO requests and remove devices which didn't respond multiple times
function discoverDevices() {
  if(keypair == null)
    return;

  // Build and broadcast WHO request: WHO header plus our fingerprint
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

// If we got a response from a device
udpSocket.on('message', function(data, info) {
  // Check if its a HERE response: HERE header, 0x00/0x01/0x02 for the known status plus the device name
  if(!data.slice(0,HERE.length).equals(HERE))
    return;

  // Get whether the device knows us or not
  var known = data.readUInt8(HERE.length) == 2; // we just care for KNOWN vs anything else
//  known = (known == 0 ? 'NO INFO' : (known == 1 ? 'UNKNOWN' : 'KNOWN'))

  // Get device name
  var name = data.slice(HERE.length+1).toString();

  // Update UI if necessary. The name should be constant for all devices, so don't check if the name is different
  var shouldUpdate = !discoveredDevices[info.address];
  discoveredDevices[info.address] = {purge: 3, name, known, address: info.address};
  if(shouldUpdate)
    updateDiscoveredDevices();
});

// Update the UI to reflect the currently discovered devices
function updateDiscoveredDevices() {
  var panel = document.getElementById('discoveredDevices');
  // Remove all devices from the UI
  while(panel.lastChild) {
    panel.removeChild(panel.lastChild);
  }

  // Create div for known devices
  var known = document.createElement('div');
  var areThereKnown = false;
  // Create div for unknown devices
  var unknown = document.createElement('div');
  var areThereUnknown = false;

  // If we have any device
  if(Object.keys(discoveredDevices).length > 0) {
    // Iterate over all discovered devices
    Object.keys(discoveredDevices).forEach((address, index) => {
      const device = discoveredDevices[address];

      // Build a connect button
      var button = document.createElement('button');
      button.className = 'mui-btn mui-btn--flat mui-btn--primary btn-block mui--text-left';
      button.textContent = device.name;

      button.onclick = (e) => {
        // Connect if the button was clicked
        connect(address);
      }

      // Also show the ip on the right side
      var ip = document.createElement('small');
      ip.className = 'mui--pull-right';
      ip.textContent = address;
      button.appendChild(ip);

      // Append to the right category
      (device.known ? known : unknown).appendChild(button);
      (device.known ? areThereKnown = true : areThereUnknown = true)
    });

    // If there are known devices, show them at first
    if(areThereKnown) {
      var knownHeadline = document.createElement('h5');
      var knownHeadlineStrong = document.createElement('strong');
      knownHeadlineStrong.textContent = 'KNOWN DEVICES';
      knownHeadline.appendChild(knownHeadlineStrong);
      panel.appendChild(knownHeadline);
      panel.appendChild(known);
    }

    // If we have both know and unknown devices, show a <hr>
    if(areThereKnown && areThereUnknown)
      panel.appendChild(document.createElement('hr'));

    // Also show unknown devices, if we have any
    if(areThereUnknown) {
      var unknownHeadline = document.createElement('h5');
      var unknownHeadlineStrong = document.createElement('strong');
      unknownHeadlineStrong.textContent = 'UNKNOWN DEVICES';
      unknownHeadline.appendChild(unknownHeadlineStrong);
      panel.appendChild(unknownHeadline);
      panel.appendChild(unknown);
    }
  } else {
    // If we don't have any device, show the text instead
    var h3 = document.createElement('h3');
    h3.className = 'mui--text-center';
    h3.textContent = 'No devices detected yet.';
    panel.appendChild(h3);
  }
}

/**** UI Animation ****/

var targets = {}
// The animation state of a UI part
const ANIMATE = {
  SHOWN: 0,
  SHOWING: 1,
  HIDING: 2,
  HIDDEN: 3
};

['connect', 'connecting', 'data'].forEach((target) => {
  targets[target] = {
    id: target,
    element: document.getElementById(target),
    state: (document.getElementById(target).style.display == 'block' ? ANIMATE.SHOWN : ANIMATE.HIDDEN),
  }
});

// Hide everything except for the wanted part
function animateTo(id, callback) {
  // Make callback optional
  function _cb() {
    if(callback)
      callback();
  }

  if(!id)
    return _cb();

  var index = Object.keys(targets).indexOf(id);

  // We can only animate to parts that are there
  if(index < 0)
    return _cb();

  // Get all the parts that should be hidden
  var toBeHidden = Object.keys(targets).filter((target, i) => {
    // Not the one that should be shown
    if(index == i)
      return false;

    // Also not the ones that are already hidden or just hiding
    if(targets[target].state >= ANIMATE.HIDING)
      return false;

    // But everything else
    return true;
  });

  // Set state to hiding and trigger the opacity animation (transition)
  toBeHidden.forEach((fromID) => {
    var from = targets[fromID];
    from.state = ANIMATE.HIDING;
    from.element.style.opacity = 0;
  });

  // After the transition
  setTimeout(() => {
    // Remove the invisible parts
    toBeHidden.forEach((fromID) => {
      var from = targets[fromID];
      from.state = ANIMATE.HIDDEN;
      from.element.style.display = 'none';
    });

    // Show the to-be-shown part if it's not already there
    var to = targets[id];
    if(to.state >= ANIMATE.HIDING) {
      to.state = ANIMATE.SHOWING;
      to.element.style.display = 'block';
      to.element.style.opacity = 1;

      setTimeout(() => to.state = ANIMATE.SHOWN, 100);
    }

    _cb();
  }, 100);
}

// Wrapper for animateTo that also handles potential error messages
function showConnect(err) {
  if(err)
    console.error('Connection error:', err);

  animateTo('connect', () => {
    var error = document.getElementById('connectError');
    if(err) {
      error.style.display = 'block';
      error.textContent = 'Error: ' + err.code + ' (Address: ' + err.address + ')';
    } else
      error.style.display = 'none';
  });
}

// Called when you enter an ip manually
function onConnect(event) {
  // Check which ip was entered
  var ip = document.getElementById('connectIP').value;

  if(!ip)
    return;

  // Connect to that ip
  connect(ip);
}

/**** Actual connection ****/

// My socket. Either null if disconnected or a tls socket if connected
var socket;
function connect(address) {
  if(socket)
    return showConnect({code: 'Already connected', address});

  // Update UI
  animateTo('connecting');

  // Create TLS connection. Do not verify the server certificate as it's self signed
  socket = tls.connect({host: address, port: 8877, rejectUnauthorized: false});

  // Stop discovering new devices
  if(discoveryInterval != null) {
    clearInterval(discoveryInterval);
    discoveredDevices = {};
    updateDiscoveredDevices();
    discoveryInterval = null;
  }

  // If an error occurs, store that error (it will be handled in 'close', which is also called
  socket.on('error', (err) => {
    socket.error = err;
  });

  // Once we are connected, send our public key
  socket.on('secureConnect', () => {
    console.log('CONNECTED');
    socket.send(OP.C2S_HANDSHAKE_PUBLIC_KEY, {key: Buffer.from(keypair.publicpem).toString('base64')});
  });

  // If the socket was closed
  socket.on('close', () => {
    console.log('CLOSED');
    // Show connecting screen with possibly error messages
    showConnect(socket.error);

    // Clean up socket
    socket = null;

    // Start discovering new devices
    if(discoveryInterval == null) {
      discoveryInterval = setInterval(discoverDevices, 5000);
      discoverDevices();
    }
  });

  // When we receive data.
  // Keep a buffer of everything received for handling partial packets
  var socketMessage = Buffer.alloc(0);
  socket.on('data', (data) => {
    // Append what we got to that buffer
    socketMessage = Buffer.concat([socketMessage, data]);

    var i;
    // For each package delimiter (0xFF)
    while((i = socketMessage.indexOf(0xFF)) > -1) {
      // Handle everything until the delimiter
      handlePacket(socketMessage.slice(0,i));

      // Store the rest
      socketMessage = socketMessage.slice(i+1);
    }
  });

  // Helper function for sending messages
  // Format: opcode + length of decompressed body + base64 encoded compressed json body + 0xFF
  socket.send = function(opCode, payload) {
    var payloadBuf = Buffer.from(JSON.stringify(payload));
    zstd.compress(payloadBuf, {level: 1}, (err, compressedPayload) => {
      if(err) {
        console.error(err)
        socket.destroy();
        return;
      }

      var decompressedSize = Buffer.alloc(4);
      decompressedSize.writeInt32BE(payloadBuf.length);

      console.log(decompressedSize);

      var buf = Buffer.concat([
                  Buffer.from([opCode]),
                  decompressedSize,
                  Buffer.from(compressedPayload.toString('base64')),
                  Buffer.from([0xFF])
                ]);

      socket.write(buf);
      var json = JSON.stringify(payload);
      console.log('Sent message with opcode', opCode, 'and content:', (json.length > 100 ? json.substr(0, 100) + '...' : json), 'decompressed payload size:', payloadBuf.length, 'total size:', buf.length);
    });
  };

  // Parse a packet
  function handlePacket(data) {
    try {
      // Get opcode
      var opCode = data.readUInt8(0);

      // Parse base64
      var compressedPayload = data.toString('utf8', 5, data.length);

      // Decompress payload
      zstd.decompress(Buffer.from(compressedPayload, 'base64'), (err, decompressedPayload) => {
        if(err) {
          console.error(err)
          socket.destroy();
          return;
        }

        // Parse json
        var json = decompressedPayload.toString();
        console.log('Got message with opcode', opCode, 'and content:', (json.length > 100 ? json.substr(0, 100) + '...' : json), 'advertised decompressed payload size:', data.readInt32BE(1), 'decompressed payload size:', decompressedPayload.length, 'total size:', data.length);

        // Handle the message
        var payload = JSON.parse(json);
        handleMessage(opCode, payload);
      });
    } catch(e) {
      console.error(e);
      socket.destroy();
    }
  }

  // Handling a message
  function handleMessage(opCode, payload) {
    switch(opCode) {
      case OP.S2C_HANDSHAKE_PUBLIC_KEY_UNKNOWN:
        // TODO: Show popup to confirm our fingerprint
        console.log('Confirm this fingerprint:', keypair.fingerprint);
        break;

      case OP.S2C_HANDSHAKE_PUBLIC_KEY_KNOWN:
        // TODO: Hide popup to confirm our fingerprint
        console.log('Confirmed fingerprint!');
        break;

      case OP.S2C_HANDSHAKE_CHALLENGE:
        // Respond to a handshake challenge. Format: <server id>:<random data>
        var challenge = payload.challenge.split(':');

        // Generate the server's id
        var serverID = generateServerID(socket.getPeerCertificate().raw);

        // If the server's id isn't the same as in the challenge, disconnect
        if(challenge.length != 2 || challenge[0] != serverID)
          return socket.destroy();

        // Otherwise, sign the challenge
        var signature = keypair.sign(payload.challenge);

        // And send the response
        socket.send(OP.C2S_HANDSHAKE_RESPONSE, {challenge: payload.challenge, signature});
        break;

      case OP.S2C_HANDSHAKE_RESPONSE:
        // RESERVED
        break;

      case OP.S2C_HANDSHAKE_OK:
        // TODO: Fetch actual data
        console.log('Handshake OK!');
        animateTo('data');
        setTimeout(() => socket.send(OP.C2S_REQUEST_CONTACTS, {}), 1000);
        break;

      case OP.S2C_RESPONSE_CONTACTS:
        var contacts = payload.contacts;
        console.log(contacts);
        break;
    }
  }
}

/**** Helpers ****/

function generateFingerprint(buf) {
  var fingerprint = crypto.createHash('sha1').update(buf).digest('hex').replace(/(.{2})/g, '$1:');
  return fingerprint.substr(0, fingerprint.length-1).toUpperCase();
}

function generateServerID(buf) {
  return crypto.createHash('sha256').update(buf).digest('base64');
}

