// --- CONTEXT: BROWSER --- //

const {remote} = require('electron');
const tls = remote.require('tls');
const dgram = remote.require('dgram');
const zstd = remote.require('node-zstd');

const UI = require('./ui.js');

const Handshake = require('./handshake.js');
const Contacts = require('./contacts.js');

const {OP, WHO, HERE} = require('./constants.js');

const keypair = remote.getGlobal('keypair');
console.log('Loaded key:', keypair.fingerprint);

// Called when you enter an ip manually in the connect field
function onConnect(event) {
  // Check which ip was entered
  var ip = document.getElementById('connectIP').value;

  if(!ip)
    return;

  // Connect to that ip
  connect(ip);
}

// Called whenever you put something in the search box
function onSearchInput(event) {
  if(!socket)
    return;

  var searchValue = document.getElementById('contentSearch').value;

  UI.updateContacts(socket.data.contacts, searchValue);
}

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
    UI.updateDiscoveredDevices(discoveredDevices);
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
    UI.updateDiscoveredDevices(discoveredDevices);
});

/**** Actual connection ****/

// My socket. Either null if disconnected or a tls socket if connected
var socket;

function connect(address) {
  if(socket)
    return UI.showConnect({code: 'Already connected', address});

  // Update UI
  UI.setConnectingText('Connecting to ' + address + ' ...');
  UI.animateTo('connecting');

  // Create TLS connection. Do not verify the server certificate as it's self signed
  socket = tls.connect({host: address, port: 8877, rejectUnauthorized: false});

  socket.data = {}; // Arbitrary connection-related data such as contacts

  socket.close = function close() {
    socket.send(OP.BYE, {});
  }

  // Stop discovering new devices
  if(discoveryInterval != null) {
    clearInterval(discoveryInterval);
    discoveredDevices = {};
    UI.updateDiscoveredDevices(discoveredDevices);
    discoveryInterval = null;
  }

  // If an error occurs, store that error (it will be handled in 'close', which is also called
  socket.on('error', (err) => {
    socket.error = err;
  });

  // Once we are connected, send our public key
  socket.on('secureConnect', () => {
    console.log('CONNECTED');
    UI.setConnectingText('Connected! Identifying phone ...');
    socket.send(OP.C2S_HANDSHAKE_PUBLIC_KEY, {key: Buffer.from(keypair.publicpem).toString('base64')});
  });

  // If the socket was closed
  socket.on('close', () => {
    console.log('CLOSED');
    // Show connecting screen with possibly error messages
    UI.showConnect(socket.error);

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
        socket.close();
        return;
      }

      var decompressedSize = Buffer.alloc(4);
      decompressedSize.writeInt32BE(payloadBuf.length);

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
          socket.close();
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
      socket.close();
    }
  }

  // Handling a message
  function handleMessage(opCode, payload) {
    switch(opCode) {
      case OP.S2C_HANDSHAKE_PUBLIC_KEY_UNKNOWN:
	Handshake.handleUnknownPublicKey(socket, payload);
        break;

      case OP.S2C_HANDSHAKE_PUBLIC_KEY_KNOWN:
	Handshake.handleKnownPublicKey(socket, payload);
        break;

      case OP.S2C_HANDSHAKE_CHALLENGE:
        Handshake.handleChallenge(socket, payload);
        break;

      case OP.S2C_HANDSHAKE_RESPONSE:
        // RESERVED
        break;

      case OP.S2C_HANDSHAKE_OK:
        console.log('Handshake OK!');
        UI.setConnectingText('Everything sound and safe! Fetching contacts ...');
        socket.send(OP.C2S_REQUEST_CONTACTS, {});
        break;

      case OP.S2C_RESPONSE_CONTACTS:
        Contacts.handleContacts(socket, payload);
        break;
    }
  }
}
