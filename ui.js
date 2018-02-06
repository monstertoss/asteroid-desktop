// --- CONTEXT: BROWSER --- //

const {ANIMATE, DATA, DATAKINDS} = require('./constants.js');

var targets = {};

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
  var error = document.getElementById('connectError');
  if(err) {
    console.error('Connection error:', err);
    error.style.display = 'block';
    error.textContent = 'Error: ' + err.code + ' (Address: ' + err.address + ')';
  } else
    error.style.display = 'none';

  animateTo('connect');
}

function setConnectingText(text) {
  if(!text)
    text = '';

  document.getElementById('connectingMessage').textContent = text;
}

const _CONTACTS_BUTTON_CLASS = 'mui-btn mui-btn--flat btn-block btn-contacts mui--text-left'; 

var clickedButton = null;

function _createContactButton(socket, contact) {
  var button = document.createElement('button');
  button.className = _CONTACTS_BUTTON_CLASS
  button.textContent = contact.display_name;
  button.contact = contact;

  button.onclick = (e) => {
    if(clickedButton)
      clickedButton.className = _CONTACTS_BUTTON_CLASS;

    button.className += ' selected';
    clickedButton = button;

    updateDataContent(socket, contact);
  }
  return button;
}

function _createInputField(kind, value, name, type, cb) {
  var div = document.createElement('div');
  div.className = 'mui-textfield';

  var input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.oninput = cb;
  input.className = kind;
  div.appendChild(input);

  var label = document.createElement('label');
  label.textContent = name;
  div.appendChild(label);

  return div;
}

function updateDataContent(socket, contact) {
  console.log(contact);

  var data = Contacts.getDataFromContact(socket, contact);
  var shortName = Contacts.toShortName(data.name);

  var inputs = document.getElementsByClassName('contactInput');
  for(var i = 0; i < inputs.length; i++) {
    var div = inputs[i];
    while(div.lastChild) {
      div.removeChild(div.lastChild);
    }
  }

  document.getElementById('contactName').appendChild(_createInputField(DATAKINDS.NAME, shortName, 'Name (Prefix, First name, Middle name, Last name, Suffix)', 'text', onContactInput));
  document.getElementById('contactCompany').appendChild(_createInputField(DATAKINDS.ORGANIZATION + ' company', data.organization.company, 'Company', 'text', onContactInput));
  document.getElementById('contactNickname').appendChild(_createInputField(DATAKINDS.NICKNAME, data.nickname.name, 'Nickname', 'text', onContactInput));
  document.getElementById('contactCompanyTitle').appendChild(_createInputField(DATAKINDS.ORGANIZATION + ' title', data.organization.title, 'Company: Title', 'text', onContactInput));
  document.getElementById('contactSIP').appendChild(_createInputField(DATAKINDS.SIP_ADDRESS, data.sip.address, 'SIP', 'text', onContactInput));

  for(var i = 0; i <= data.phone.length; i++) {
    document.getElementById('contactPhone').appendChild(_createInputField(DATAKINDS.PHONE, (i < data.phone.length ? data.phone[i].number : ''), 'Phone ' + (i+1), 'tel', onContactInput));
  };

  for(var i = 0; i <= data.email.length; i++) {
    document.getElementById('contactEmail').appendChild(_createInputField(DATAKINDS.EMAIL, (i < data.email.length ? data.email[i].address : ''), 'Email ' + (i+1), 'email', onContactInput));
  };

  for(var i = 0; i <= data.im.length; i++) {
    document.getElementById('contactIM').appendChild(_createInputField(DATAKINDS.IM, (i < data.im.length ? data.im[i].data : ''), 'Instant Messaging ' + (i+1), 'text', onContactInput));
  };

  document.getElementById('saveButton').style.display = 'none';
}

function onContactInput() {
  if(!clickedButton)
    return;

  var input = getWholeInput();
  var data = Contacts.getDataFromContact(clickedButton.contact);
  var shortName = Contacts.toShortName(data.name);

  var showSaveButton = ((input.name != shortName) || (input.organization != data.organization))

  document.getElementById('saveButton').style.display = (showSaveButton ? 'block' : 'none');
}

function getWholeInput() {
  // Fetch and return input
  var organization = document.getElementById('inputOrganization').value;

  var shortName = document.getElementById('inputName').value;
  var name = Contacts.fromShortName(shortName);
  name.display_name = Contacts.toDisplayName(n, organization);

  return {name, organization};
}

function updateContacts(socket, search) {
  var contacts = socket.data.contacts;

  var contactList = document.getElementById('contactList');
  while(contactList.lastChild) {
    contactList.removeChild(contactList.lastChild);
  }

  var list = Object.keys(contacts);

  if(search) {
    search = search.toLowerCase();
    list = list.filter((id) => (contacts[id].display_name.toLowerCase().indexOf(search) > -1) // If search is found in the display_name
      || Object.keys(contacts[id].rawContacts).some((rawContactID) => Object.keys(contacts[id].rawContacts[rawContactID].data).some((dataID) => (contacts[id].rawContacts[rawContactID].data[dataID].kind == DATAKINDS.PHONE && contacts[id].rawContacts[rawContactID].data[dataID].fields.number.replace(' ', '').indexOf(search.replace(' ', '')) > -1) || (contacts[id].rawContacts[rawContactID].data[dataID].kind == DATAKINDS.EMAIL && contacts[id].rawContacts[rawContactID].data[dataID].fields.address.toLowerCase().indexOf(search) > -1)))) // If search is found in a phone number or email address
  }

  if(list.length > 0) {
    list.sort((a,b) => contacts[a].sort_key.localeCompare(contacts[b].sort_key)).forEach((contactID) => {
      var contact = contacts[contactID];
      var button = _createContactButton(socket, contact);

      if(clickedButton && clickedButton.contact._id == contactID) {
        button.className += ' selected';
        clickedButton = button;
      }

      contactList.appendChild(button);
      contactList.appendChild(document.createElement('br'));
    });
  } else {
    var button = document.createElement('button');
    button.disabled = true;
    button.className = 'mui-btn mui-btn--flat btn-block btn-contacts';
    button.textContent = 'We couldn\'t find any contact for that!';

    contactList.appendChild(button);
  }
}

// Update the UI to reflect the currently discovered devices
function updateDiscoveredDevices(discoveredDevices) {
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
      (device.known ? known : unknown).appendChild(document.createElement('br'));
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

module.exports = {animateTo, getWholeInput, onContactInput, showConnect, setConnectingText, updateContacts, updateDataContent, updateDiscoveredDevices}

