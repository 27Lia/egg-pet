import { contextBridge, ipcRenderer } from 'electron'

const on = (ch: string, cb: (...a: any[]) => void) => {
  const h = (_: unknown, ...a: any[]) => cb(...a)
  ipcRenderer.on(ch, h)
  return () => ipcRenderer.removeListener(ch, h)
}

contextBridge.exposeInMainWorld('api', {
  petMenu: (id?: string) => ipcRenderer.send('pet-menu', id),
  setInteractive: (on: boolean) => ipcRenderer.send('interactive', on),
  care: (id: string, kind: string) => ipcRenderer.invoke('care', id, kind),
  quest: (id: string, place: string) => ipcRenderer.invoke('quest', id, place),
  release: (id: string) => ipcRenderer.invoke('release', id),
  onReact: (cb: (id: string, text: string) => void) => on('react', cb),
  getState: () => ipcRenderer.invoke('state'),
  run: (input: string) => ipcRenderer.invoke('run', input),
  onState: (cb: (s: any) => void) => on('state', cb),
  onLog: (cb: (l: string) => void) => on('log', cb),
  pat: () => ipcRenderer.invoke('pat'),
  setSettings: (patch: unknown) => ipcRenderer.invoke('settings', patch),
  onAnnounce: (cb: (a: { text: string; petId?: string }) => void) => on('announce', cb)
})
