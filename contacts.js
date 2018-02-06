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
    // For the docs:
    //socket.data.thirdPartyData = payload.thirdPartyData;
    socket.data.packageNames = {};
  }

  UI.setConnectingText('Got it! Parsing Contacts ...');

  socket.data.thirdPartyData = payload.thirdPartyData;
  Object.keys(payload.thirdPartyData).forEach((packageName) => {
    socket.data.packageNames[payload.thirdPartyData[packageName].account_type] = packageName;
    Object.keys(payload.thirdPartyData[packageName].data_kinds).forEach((mimetype) => socket.data.dataKinds[mimetype] = payload.thirdPartyData[packageName].data_kinds[mimetype])
  });

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

  UI.updateContacts(socket);
  UI.animateTo('data');
}

function saveContact() {
  var data = UI.getCurrentContactData();
  var wholeInput = UI.getWholeInput();

  console.log(data, wholeInput);
  // Build and submit batch transaction
}

function getDataFromContact(socket, contact) {
  var rawContactProvidingName = contact.rawContacts[contact.name_raw_contact_id];

  var nameRow = rawContactProvidingName.data[Object.keys(rawContactProvidingName.data).filter((id) => rawContactProvidingName.data[id].kind == DATAKINDS.NAME)[0]];
  var name = {display_name: nameRow.fields.display_name, prefix: nameRow.fields.prefix, given_name: nameRow.fields.given_name, middle_name: nameRow.fields.middle_name, family_name: nameRow.fields.family_name, suffix: nameRow.fields.suffix};

  var allDataSets = {};
  Object.keys(contact.rawContacts).forEach((rawID) => {
    var data = socket.data.thirdPartyData[socket.data.packageNames[contact.rawContacts[rawID].account_type]];
    if(!data)
      return console.log('No data... weird', contact.rawContacts[rawID].account_type, socket.data.packageNames[contact.rawContacts[rawID].account_type]);

    if(!data.has_edit_schema)
      return;

    Object.keys(contact.rawContacts[rawID].data).forEach((dataID) => {
      allDataSets[dataID] = contact.rawContacts[rawID].data[dataID];
    });
  });

  var organizationEntries = Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.ORGANIZATION)
  var organization = (organizationEntries.length > 0 ? {company: allDataSets[organizationEntries[0]].fields.company, title: allDataSets[organizationEntries[0]].fields.title} : {company: null, title: null});

  var nicknameEntries = Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.NICKNAME)
  var nickname = {name: (nicknameEntries.length > 0 ? allDataSets[nickNameEntries[0]].fields.name : null)};

  var phone = [];
  Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.PHONE).forEach((id) => phone.push(allDataSets[id].fields));

  var sipEntries = Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.SIP_ADDRESS)
  var sip = {address: (sipEntries.length > 0 ? allDataSets[sipEntries[0]].fields.address : null)};

  var email = [];
  Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.EMAIL).forEach((id) => email.push(allDataSets[id].fields));

  var address = [];
  Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.ADDRESS).forEach((id) => address.push({address: allDataSets[id].fields.address, type: allDataSets[id].fields.type, label: allDataSets[id].fields.label}));

  var im = [];
  Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.ADDRESS).forEach((id) => im.push({data: allDataSets[id].fields.data, protocol: allDataSets[id].fields.protocol, custom_protocol: allDataSets[id].custom_protocol}));

  var website = [];
  Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.WEBSITE).forEach((id) => website.push({url: allDataSets[id].fields.url}));

  var event = [];
  Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.EVENT).forEach((id) => event.push(allDataSets[id].fields));

  var relation = [];
  Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.RELATION).forEach((id) => relation.push(allDataSets[id].fields));

  var noteEntries = Object.keys(allDataSets).filter((id) => allDataSets[id].kind == DATAKINDS.NOTE)
  var note = {note: (noteEntries.length > 0 ? allDataSets[noteEntries[0]].fields.note : null)};

  return {name, organization, nickname, phone, sip, email, address, im, website, event, relation, note};
}

function fromShortName(shortName) {
  var name = {};
  var shortNameSplit = shortName.split(' ');

  switch(shortNameSplit.length) {
    case 1:
      name.given_name = shortName;
      break;

    case 2:
      name.given_name = shortNameSplit[0];
      name.family_name = shortNameSplit[1];
      break;

    case 3:
      name.given_name = shortNameSplit[0];
      name.middle_name = shortNameSplit[1];
      name.family_name = shortNameSplit[2];
      break;

    case 4:
      name.prefix = shortNameSplit[0];
      name.given_name = shortNameSplit[1];
      name.middle_name = shortNameSplit[2];
      name.family_name = shortNameSplit[3];
      break;

    case 5:
      name.prefix = shortNameSplit[0];
      name.given_name = shortNameSplit[1];
      name.middle_name = shortNameSplit[2];
      name.family_name = shortNameSplit[3];
      name.suffix = shortNameSplit[4];
      break;

    default:
      name.prefix = shortNameSplit[0];
      name.given_name = shortNameSplit.slice(1, shortNameSplit.length-3).join(' ');
      name.middle_name = shortNameSplit[shortNameSplit.length-3];
      name.family_name = shortNameSplit[shortNameSplit.length-2];
      name.suffix = shortNameSplit[shortNameSplit.length-1];
      break;
  }

  Object.keys(DATA[DATAKINDS.NAME].fields).forEach((key) => {
    if(!name[key])
      name[key] = null;
  });

  return name;
}

function toShortName(name) {
  return ((name.prefix ? name.prefix + ' ' : '') + (name.given_name ? name.given_name + ' ' : '') + (name.middle_name ? name.middle_name + ' ' : '') + (name.family_name ? name.family_name + ' ' : '') + (name.suffix ? name.suffix + ' ' : '')).trim();
}

function toDisplayName(name, organization) {
  return (toShortName(name) + (organization ? ' ' + organization : '')).trim()
}

module.exports = {fromShortName, getDataFromContact, handleContacts, saveContact, toShortName};
