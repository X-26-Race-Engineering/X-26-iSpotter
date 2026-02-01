const { ipcRenderer } = require('electron');

window.closeWindow = () => {
    ipcRenderer.send('close-window');
};