const {app, BrowserWindow} = require('electron');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const fs = require('fs');

const rsa = require('node-rsa');
const rsaOptions = {environment: 'browser'};
const keyfile = './.keyfile.pem';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({});
  win.setMenu(null);
  win.maximize();

  // and load the index.html of the app.
  win.loadURL('file://' + __dirname + '/index.html');

  // Open the DevTools.
  win.webContents.openDevTools();

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }
});

var keypair = {};
fs.readFile(keyfile, 'utf8', (err, keystring) => {
  if(err && err.code != 'ENOENT') {
    console.error(err);
    return;
  }

  if(err) {
    console.log('Generating key. Please wait...');
    keypair.key = new rsa(rsaOptions);
    keypair.pem = keypair.key.exportKey('private');
    fs.writeFile(keyfile, keypair.pem, (err) => {
      if(err)
        console.error(err);
    });
  } else {
    keypair.pem = keystring;
    keypair.key = new rsa(keystring, 'private', rsaOptions);
  }

  keypair.der = keypair.key.exportKey('pkcs8-private-der');
  keypair.publicpem = keypair.key.exportKey('public');
  keypair.publicder = keypair.key.exportKey('pkcs8-public-der');
  keypair.fingerprint = generateFingerprint(keypair.publicder);
  keypair.sign = function sign(data) {
    return keypair.key.sign(data, 'base64', 'utf8');
  }
  global.keypair = keypair;
});

function generateFingerprint(buf) {
  var fingerprint = crypto.createHash('sha1').update(buf).digest('hex').replace(/(.{2})/g, '$1:');
  return fingerprint.substr(0, fingerprint.length-1).toUpperCase();
}

function generateServerID(buf) {
  return crypto.createHash('sha256').update(buf).digest('base64');
}
