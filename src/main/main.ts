/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { screen } from 'electron';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

let deeplinkUri = null;

app.commandLine.appendSwitch('enable-transparent-visuals');
export const onException = (err: any) => {
  console.log('[Portal] Exception', err);
};

export const initProcess = () => {
  process.on('uncaughtException', onException);
  process.on('unhandledRejection', onException);
};

export const isSafeURL = (url: string) => {
  return url.startsWith('http:') || url.startsWith('https:');
};

export const isAppUrl = (url: string) => {
  return (
    url.startsWith('https://localhost') ||
    url.startsWith('http://localhost') ||
    url.startsWith('https://arken.gg')
  );
};

export const ensureLinksOpenInBrowser = (event: any, url: string) => {
  if (isSafeURL(url) && !isAppUrl(url)) {
    event.preventDefault();
    shell.openExternal(url);
  }
};

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

let overlayWindow: any;

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  const size = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: size.width - 1,
    height: size.height - 1,
    minWidth: size.width - 1,
    minHeight: size.height - 1,
    frame: false, // No window border
    transparent: true, // Enable transparency
    alwaysOnTop: true, // Ensure it stays above the target window
    hasShadow: false,
    resizable: false, // Optional: Prevent resizing
    webPreferences: {
      nodeIntegration: process.env.NODE_ENV === 'development' ? true : false, // Enable Node.js (if needed)
      contextIsolation: true, // Disable isolation for easier access
    },
  });

  // Load the UI HTML for your overlay

  // Optional: Prevent the overlay window from appearing in the taskbar
  overlayWindow.setSkipTaskbar(true);

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // overlayWindow.loadURL('https://beta.arken.gg');

  overlayWindow.on('ready-to-show', () => {
    overlayWindow?.show();
  });

  mainWindow = new BrowserWindow({
    show: false,
    width: size.width - 1,
    height: size.height - 1,
    minWidth: 260,
    minHeight: 360,
    icon: getAssetPath('icon.png'),
    frame: false,
    // titleBarStyle: 'hidden', // Optional: Improves MacOS aesthetics
    transparent: true, // Optional: Allows transparency (useful for custom designs)
    hasShadow: false,
    backgroundColor: '#00FFFFFF',
    // vibrancy: 'fullscreen-ui', // on MacOS
    // backgroundMaterial: 'acrylic', // on Windows 11
    webPreferences: {
      // devTools: false,
      experimentalFeatures: true,
      nodeIntegration: process.env.NODE_ENV === 'development' ? true : false, // Enable Node.js integration (if needed)
      contextIsolation: true, // Depending on your security settings
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  // mainWindow.setSkipTaskbar(true);
  // mainWindow.setVibrancy('fullscreen-ui');
  mainWindow.setBackgroundMaterial('none');
  mainWindow.setBackgroundColor('#00FFFFFF');
  mainWindow.webContents.setFrameRate(30);

  // Set maximized size
  mainWindow.maximize(); // change window size -> redrawing
  // mainWindow.setFullScreen(true); // change window property -> redrawing

  mainWindow.webContents.openDevTools({ mode: 'undocked' });

  // mainWindow.loadURL(resolveHtmlPath('index.html'));
  const baseUrl = false ? 'https://beta.arken.gg/' : 'http://localhost:8021/'; //'http://localhost:9999/' : 'http://localhost:8000/'
  const deeplinkUri = '';
  mainWindow.loadURL(baseUrl + deeplinkUri);

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [] },
    (details, callback) => {
      details.requestHeaders['Origin'] = 'https://arken.gg';
      details.requestHeaders['Referer'] = 'https://arken.gg';

      callback({ cancel: false, requestHeaders: details.requestHeaders });
    },
  );

  mainWindow.webContents.on('will-navigate', ensureLinksOpenInBrowser);
  // mainWindow.webContents.on('new-window', ensureLinksOpenInBrowser);

  mainWindow.webContents.once('did-finish-load', () => {
    // initMenu()
    // mainWindow?.setMenu(null);
    mainWindow?.setTitle('Portal');
  });

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
      mainWindow?.focus();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // mainWindow.setIgnoreMouseEvents(true)

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

export const installDarwin = () => {
  // On Mac, only protocols that are listed in `Info.plist` can be set as the
  // default handler at runtime.
  app.setAsDefaultProtocolClient('arken');

  // File handlers are defined in `Info.plist`.
};

export const uninstallDarwin = () => {};

export const installWindows = () => {
  // Define custom protocol handler. Deep linking works on packaged versions of the application!
  app.setAsDefaultProtocolClient('arken');
};

export const uninstallWindows = () => {};

export const initApp = () => {
  const powerSaveBlocker = require('electron').powerSaveBlocker;
  powerSaveBlocker.start('prevent-app-suspension');

  app.commandLine.appendSwitch('page-visibility');
  app.commandLine.appendSwitch('disable-web-security');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('force-color-profile', 'srgb');

  app.setName('Portal');

  /**
   * Add event listeners...
   */

  app.on('window-all-closed', () => {
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app
    .whenReady()
    .then(() => {
      setTimeout(function () {
        createWindow();
        app.on('activate', () => {
          // On macOS it's common to re-create a window in the app when the
          // dock icon is clicked and there are no other windows open.
          if (mainWindow === null) createWindow();
        });
      }, 300);
    })
    .catch(console.log);
};

export const initIPC = () => {
  ipcMain.on('ipc-example', async (event, arg) => {
    const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
    console.log(msgTemplate(arg));
    event.reply('ipc-example', msgTemplate('pong'));
  });

  ipcMain.on('command', (event, msg) => {
    console.log('[Portal] Received command from web', msg); // msg from web page

    const cmd = JSON.parse(msg);

    // DesktopBridge.queueCommand(cmd)
  });
};

export const init = () => {
  initProcess();
  initApp();
};

// @ts-ignore
if (!global.electronInitialized) {
  init();

  // @ts-ignore
  global.electronInitialized = true;
}
