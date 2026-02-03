const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        minWidth: 800,
        minHeight: 600,
        x: 0,
        y: 0,
        frame: false,
        resizable: true,
        movable: true,
        alwaysOnTop: false,
        backgroundColor: '#0d0f1d',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    setTimeout(() => {
        mainWindow.loadURL('http://localhost:5000/race_dashboard.html');
    }, 3000);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

ipcMain.on('close-window', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (!mainWindow) {
        createWindow();
    }
});