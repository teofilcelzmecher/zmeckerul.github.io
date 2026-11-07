// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
// The desktop app's own small pages (the window that rings, the screen picker): what to show, and the answer.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'budgie',
  Object.freeze({
    data: () => ipcRenderer.invoke('page-data'),
    done: (result) => ipcRenderer.send('page-done', result),
    on: (fn) => ipcRenderer.on('page-update', (e, d) => fn(d)),
  })
);
