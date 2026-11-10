/// <reference types="vite/client" />
import type { GameState, Settings } from '../../shared/types'
declare global {
  interface Window {
    api: {
      petMenu: (id?: string) => void
      setInteractive: (on: boolean) => void
      care: (id: string, kind: 'feed' | 'play' | 'wash') => Promise<string>
      quest: (id: string, place: string) => Promise<string>
      release: (id: string) => Promise<string>
      onReact: (cb: (id: string, text: string) => void) => () => void
      getState: () => Promise<GameState>
      run: (input: string) => Promise<string[]>
      onState: (cb: (s: GameState) => void) => () => void
      onLog: (cb: (l: string) => void) => () => void
      pat: () => Promise<string>
      setSettings: (patch: Partial<Settings>) => Promise<Settings>
      onAnnounce: (cb: (a: { text: string; petId?: string }) => void) => () => void
    }
  }
}
