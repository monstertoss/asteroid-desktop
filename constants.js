// --- CONTEXT: AGNOSTIC --- //

// UDP Package headers
const WHO = Buffer.from([0x49,0x4c,0x7b,0xae,0x30,0x30,0x69,0x9e]);
const HERE = Buffer.from([0x22,0xd6,0xb1,0x4b,0x35,0x28,0x10,0x51]);

// The same message opcodes as on the server
const OP = {
  BYE: 0,

  C2S_HANDSHAKE_PUBLIC_KEY: 1,
  S2C_HANDSHAKE_PUBLIC_KEY_UNKNOWN: 2,
  S2C_HANDSHAKE_PUBLIC_KEY_KNOWN: 3,
  S2C_HANDSHAKE_CHALLENGE: 4,
  C2S_HANDSHAKE_CHALLENGE: 5,
  C2S_HANDSHAKE_RESPONSE: 6,
  S2C_HANDSHAKE_RESPONSE: 7,
  S2C_HANDSHAKE_OK: 8,
  C2S_HANDSHAKE_OK: 9,

  C2S_REQUEST_CONTACTS: 10,
  S2C_RESPONSE_CONTACTS: 11,
}

const ANIMATE = {
  SHOWN: 0,
  SHOWING: 1,
  HIDING: 2,
  HIDDEN: 3
}

// Custom, Home, Work, Other
const _CHWO = {
  '0': '',
  '1': 'Home',
  '2': 'Work',
  '3': 'Other'
}

const DATAKINDS = {
  THIRDPARTY: -1,
  EMAIL: 0,
  EVENT: 1,
  GROUP_MEMBERSHIP: 2,
  IDENTITY: 3,
  IM: 4,
  NICKNAME: 5,
  NOTE: 6,
  ORGANIZATION: 7,
  PHONE: 8,
  PHOTO: 9,
  RELATION: 10,
  SIP_ADDRESS: 11,
  NAME: 12,
  ADDRESS: 13,
  WEBSITE: 14
}

// MIMETYPE => fields
const DATA = {

  /*
   * For completeness sake:
   * 
   * '...': {
   *   kind: DATAKINDS.THIRDPARTY,
   *
   *   fields: {
   *     summary: '...', // Set and queried according to the respective contacts.xml
   *     detail: '...'
   *   }
   * }
   *
   */

  'vnd.android.cursor.item/email_v2': {
    kind: DATAKINDS.EMAIL,

    fields: {
      address: 'data1',
      type: 'data2',
      label: 'data3'
    },

    types: {
      '0': '',
      '1': 'Home',
      '2': 'Work',
      '3': 'Other',
      '4': 'Mobile'
    }
  },

  'vnd.android.cursor.item/contact_event': {
    kind: DATAKINDS.EVENT,

    fields: {
      date: 'data1',
      type: 'data2',
      label: 'data3',
    },

    types: {
      '0': '',
      '1': 'Anniversary',
      '2': 'Other',
      '3': 'Birthday'
    }
  },

  'vnd.android.cursor.item/group_membership': {
    kind: DATAKINDS.GROUP_MEMBERSHIP,

    fields: {
      rowID: 'data1',
      sourceID: 'group_sourceid',
    }
  },

  'vnd.android.cursor.item/identity': {
    kind: DATAKINDS.IDENTITY,

    fields: {
      identity: 'data1',
      namespace: 'data2'
    }
  },

  'vnd.android.cursor.item/im': {
    kind: DATAKINDS.IM,

    fields: {
      data: 'data1',
      type: 'data2',
      label: 'data3',
      protocol: 'data5',
      custom_protocol: 'data6'
    },

    types: _CHWO,

    protocols: {
     '-1': '',
      '0': 'AIM',
      '1': 'MSN',
      '2': 'Yahoo',
      '3': 'Skype',
      '4': 'QQ',
      '5': 'Google Talk',
      '6': 'ICQ',
      '7': 'Jabber',
      '8': 'Netmeeting'
    }
  },

  'vnd.android.cursor.item/nickname': {
    kind: DATAKINDS.NICKNAME,

    fields: {
      name: 'data1',
      type: 'data2',
      label: 'data3'
    },

    types: {
      '0': '',
      '1': 'Default',
      '2': 'Other Name',
      '3': 'Maiden Name',
      '4': 'Short Name',
      '5': 'Initials'
    }
  },

  'vnd.android.cursor.item/note': {
    kind: DATAKINDS.NOTE,

    fields: {
      note: 'data1'
    }
  },

  'vnd.android.cursor.item/organization': {
    kind: DATAKINDS.ORGANIZATION,

    fields: {
      company: 'data1',
      type: 'data2',
      label: 'data3',
      title: 'data4',
      department: 'data5',
      job_description: 'data6',
      symbol: 'data7',
      phonetic_name: 'data8',
      office_location: 'data9',
      phonetic_name_style: 'data10'
    },

    types: {
      '0': '',
      '1': 'Work',
      '2': 'Other'
    }
  },

  'vnd.android.cursor.item/phone_v2': {
    kind: DATAKINDS.PHONE,

    fields: {
      number: 'data1',
      type: 'data2',
      label: 'data3'
    },

    types: {
      '0': '',
      '1': 'Home',
      '2': 'Mobile',
      '3': 'Work',
      '4': 'Work (Fax)',
      '5': 'Home (Fax)',
      '6': 'Pager',
      '7': 'Other',
      '8': 'Callback',
      '9': 'Car',
     '10': 'Company',
     '11': 'ISDN',
     '12': 'Main',
     '13': 'Fax (Other)',
     '14': 'Radio',
     '15': 'Telex',
     '16': 'TTY/TTD',
     '17': 'Work (Mobile)',
     '18': 'Work (Pager)',
     '19': 'Assistant',
     '20': 'MMS'
    }
  },

  'vnd.android.cursor.item/photo': {
    kind: DATAKINDS.PHOTO,

    fields: {
      id: 'data14',
      photo: 'data15'
    }
  },

  'vnd.android.cursor.item/relation': {
    kind: DATAKINDS.RELATION,

    fields: {
      name: 'data1',
      type: 'data2',
      label: 'data3'
    },

    types: {
      '0': '',
      '1': 'Assistant',
      '2': 'Brother',
      '3': 'Child',
      '4': 'Domestic Partner',
      '5': 'Father',
      '6': 'Friend',
      '7': 'Manager',
      '8': 'Mother',
      '9': 'Parent',
     '10': 'Partner',
     '11': 'Referred By',
     '12': 'Relative',
     '13': 'Sister',
     '14': 'Spouse'
    }
  },

  'vnd.android.cursor.item/sip_address': {
    kind: DATAKINDS.SIP_ADDRESS,

    fields: {
      address: 'data1',
      type: 'data2',
      label: 'data3'
    }
  },

  'vnd.android.cursor.item/name': {
    kind: DATAKINDS.NAME,

    fields: {
      display_name: 'data1',
      given_name: 'data2',
      family_name: 'data3',
      prefix: 'data4',
      middle_name: 'data5',
      suffix: 'data6',
      phonetic_given_name: 'data7',
      phonetic_middle_name: 'data8',
      phonetic_family_name: 'data9'
    }
  },

  'vnd.android.cursor.item/postal-address_v2': {
    kind: DATAKINDS.ADDRESS,

    fields: {
      address: 'data1',
      type: 'data2',
      label: 'data3',
      street: 'data4',
      pobox: 'data5',
      neighborhood: 'data6',
      city: 'data7',
      region: 'data8',
      postcode: 'data9',
      country: 'data10'
    },

    types: _CHWO,
  },

  'vnd.android.cursor.item/website': {
    kind: DATAKINDS.WEBSITE,

    fields: {
      url: 'data1',
      type: 'data2',
      label: 'data3'
    },

    types: {
      '0': '',
      '1': 'Homepage',
      '2': 'Blog',
      '3': 'Profile',
      '4': 'Home',
      '5': 'Work',
      '6': 'FTP',
      '7': 'Other'
    }
  }
}

module.exports = {OP, WHO, HERE, ANIMATE, DATA, DATAKINDS};
