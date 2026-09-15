const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weekcal', {
  getSettings: () => ipcRenderer.invoke('widget:get-settings'),
  setPin: (value) => ipcRenderer.invoke('widget:set-pin', value),
  setStartup: (value) => ipcRenderer.invoke('widget:set-startup', value),
  setOpacity: (value) => ipcRenderer.invoke('widget:set-opacity', value),
  setDisplay: (patch) => ipcRenderer.invoke('widget:set-display', patch),
  minimize: () => ipcRenderer.invoke('widget:minimize'),
  close: () => ipcRenderer.invoke('widget:close'),
  openLink: (url) => ipcRenderer.invoke('widget:open-link', url),
  googleStatus: () => ipcRenderer.invoke('google:status'),
  googleConnect: () => ipcRenderer.invoke('google:connect'),
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
  listCalendars: () => ipcRenderer.invoke('google:list-calendars'),
  getEvents: (args) => ipcRenderer.invoke('google:get-events', args)
});
