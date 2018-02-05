// --- CONTEXT: BROWSER --- //

const {remote} = require('electron');
const cryptoHelper = remote.require('./crypto.js');

const {OP, DATA, DATAKINDS} = require('./constants.js');

const UI = require('./ui.js');

const keypair = remote.getGlobal('keypair');

function handleContacts(socket, payload) {
  if(!socket.data.contacts || !socket.data.rawContacts || !socket.data.contactData || !socket.data.dataKinds) {
    socket.data.contacts = {};
    socket.data.rawContacts = {};
    socket.data.contactData = {};
    socket.data.dataKinds = {};
  }

  UI.setConnectingText('Got it! Parsing Contacts ...');

  payload.dataKinds.forEach((dataKind) => socket.data.dataKinds[dataKind.mimetype] = dataKind);

  payload.contacts.forEach((contact) => {
    contact.rawContacts = {};
    socket.data.contacts[contact._id] = contact;
  });

  payload.rawContacts.forEach((rawContact) => {
    if(rawContact.deleted)
      return;

    rawContact.data = {}
    socket.data.contacts[rawContact.contact_id].rawContacts[rawContact._id] = rawContact;
    socket.data.rawContacts[rawContact._id] = rawContact;
  });

  payload.data.forEach((data) => {
    socket.data.rawContacts[data.raw_contact_id].data[data._id] = data;
    socket.data.contactData[data._id] = data;

    if(DATA[data.mimetype]) {
      data.kind = DATA[data.mimetype].kind;
      data.fields = {};

      Object.keys(DATA[data.mimetype].fields).forEach((key) => {
        data.fields[key] = data[DATA[data.mimetype].fields[key]];
      });

    } else if(socket.data.dataKinds[data.mimetype]) {
      data.kind = DATAKINDS.THIRDPARTY;
      data.fields = {summary: data[socket.data.dataKinds[data.mimetype].summaryColumn], detail: data[socket.data.dataKinds[data.mimetype].detailColumn]};

    } else
      return console.log('Unkown mimetype: ' + data.mimetype);
  });

  UI.updateContacts(socket.data.contacts);
  UI.animateTo('data');
}

function saveContact() {
  var data = UI.getCurrentContactData();
  var wholeInput = UI.getWholeInput();

  console.log(data, wholeInput);
  // Build and submit batch transaction
}

module.exports = {handleContacts, saveContact};
