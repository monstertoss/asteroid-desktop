// --- CONTEXT: BROWSER --- //

const {remote} = require('electron');
const cryptoHelper = remote.require('./crypto.js');

const {OP} = require('./constants.js');

const UI = require('./ui.js');

const keypair = remote.getGlobal('keypair');

var contacts = {};
var rawContacts = {};
var contactData = {};

function handleContacts(socket, payload) {
  UI.setConnectingText('Got it! Parsing Contacts ...');

  payload.contacts.forEach((contact) => {
    contact.rawContacts = {};
    contacts[contact._id] = contact;
  });
  payload.rawContacts.forEach((rawContact) => {
    if(rawContact.deleted)
      return;

    rawContact.data = {}
    contacts[rawContact.contact_id].rawContacts[rawContact._id] = rawContact;
    rawContacts[rawContact._id] = rawContact;
  });
  payload.data.forEach((data) => {
    rawContacts[data.raw_contact_id].data[data._id] = data;
    contactData[data._id] = data;
  });
  
  UI.animateTo('data');
  console.log(contacts);
}

module.exports = {handleContacts};
