const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "AirFreight Smart Updater",
    icon: path.join(__dirname, 'icon.ico'), // You can add an icon.ico in the root later
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simple apps. Ideally use preload scripts for security.
      webSecurity: false // Optional: Allows loading local images if needed
    },
    autoHideMenuBar: true, // Hide the default file menu
  });

  // Load the index.html of the app.
  // In development, we load the Vite dev server.
  // In production, we load the built index.html.
  const isDev = !app.isPackaged;
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools(); // Open DevTools in dev mode
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});