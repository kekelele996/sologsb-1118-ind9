import { createStore } from 'zustand/vanilla'
import type { Handover } from '@/types'
import { db, syncAll, syncPut } from '@/hooks/usePersistentStore'

export interface HandoverState {
  handovers: Handover[]
  loaded: boolean
  hydrate: () => Promise<void>
  /** 交接记录只增不删，保证留档可追溯 */
  save: (handover: Handover) => Promise<void>
}

export const handoverStore = createStore<HandoverState>((set, get) => ({
  handovers: [],
  loaded: false,
  hydrate: async () => {
    const handovers = await syncAll<Handover>(db.handovers)
    handovers.sort((a, b) => (a.createdAt === b.createdAt ? b.serial.localeCompare(a.serial) : b.createdAt.localeCompare(a.createdAt)))
    set({ handovers, loaded: true })
  },
  save: async (handover) => {
    await syncPut<Handover>(db.handovers, handover)
    await get().hydrate()
  }
}))
