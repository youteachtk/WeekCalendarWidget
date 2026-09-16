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
  getExtraSettings: () => ipcRenderer.invoke('widget-extra:get'),
  setTheme: (value) => ipcRenderer.invoke('widget-extra:set-theme', value),
  setDesktopMode: (value) => ipcRenderer.invoke('widget-extra:set-desktop-mode', value),
  setReserveIconSpace: (value) => ipcRenderer.invoke('widget-extra:set-reserve-icons', value),
  setLock: (value) => ipcRenderer.invoke('widget-extra:set-lock', value),
  googleStatus: () => ipcRenderer.invoke('google:status'),
  googleConnect: () => ipcRenderer.invoke('google:connect'),
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
  listCalendars: () => ipcRenderer.invoke('google:list-calendars'),
  getEvents: (args) => ipcRenderer.invoke('google:get-events', args)
});
