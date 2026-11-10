import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { DEFAULT_GOAL, DEFAULT_SETTINGS, FOOD_EVERY, GameState, MAX_FOOD, MAX_PETS, Pet, SPECIES } from '../shared/types'

const file = () => join(app.getPath('userData'), 'state.json')
const today = () => new Date().toDateString()
const fresh = (): GameState => ({
  warmth: 0, goal: DEFAULT_GOAL, totalMinutes: 0, food: 0, foodMin: 0,
  pets: [], dex: [], pats: { date: today(), n: 0 }, lastTick: Date.now(),
  settings: { ...DEFAULT_SETTINGS }, agenda: [], questLog: [], questWins: 0, loot: {}
})

export function loadState(): GameState {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf-8'))
    const s: GameState = { ...fresh(), ...raw, agenda: [] }
    s.settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }
    s.loot = raw.loot ?? {}
    // 해금 기준은 누적 성공 횟수. 예전 데이터는 현재 펫들의 승수로 시작
    s.questWins = raw.questWins ?? s.pets.reduce((a, p) => a + (p.wins ?? 0), 0)
    // 복사 방식 시절 저장 데이터는 알 진행만 새로 시작
    if (raw.warmth === undefined) {
      s.warmth = 0
      s.goal = DEFAULT_GOAL
      s.food = Math.min(MAX_FOOD, raw.food ?? 0)
      s.totalMinutes = 0
    }
    s.pets = (raw.pets ?? []).map((p: Partial<Pet>) => ({ hunger: 100, mood: 100, clean: 100, growth: 0, ...p })) as Pet[]
    // 한 종당 한 마리만 남김(가장 먼저 부화한 펫)
    s.pets.sort((a, b) => a.hatchedAt - b.hatchedAt)
    s.pets = s.pets.filter((p, i) => s.pets.findIndex((q) => q.species === p.species) === i)
    // 예전 도감 키(종-번호)를 종 id 로 변환
    s.dex = [...new Set((raw.dex ?? []).map((k: string) => k.split('-')[0]))] as string[]
    return s
  } catch {
    return fresh()
  }
}

export function saveState(s: GameState) {
  try {
    writeFileSync(file(), JSON.stringify({ ...s, agenda: [] }, null, 2))
  } catch {
    /* 저장 실패는 무시 */
  }
}

function newPet(owned: string[]): Pet | null {
  const pool = SPECIES.filter((x) => !owned.includes(x.id))
  if (!pool.length) return null
  const sp = pool[Math.floor(Math.random() * pool.length)]
  return { id: crypto.randomUUID(), species: sp.id, hatchedAt: Date.now(), hunger: 100, mood: 100, clean: 100, growth: 0 }
}

export const isFull = (s: GameState) => s.pets.length >= MAX_PETS

/** 알에 따뜻함(분) 추가. 부화하면 새 펫을 반환 */
export function warm(s: GameState, min: number): Pet | null {
  if (isFull(s)) return null
  s.warmth += min
  if (s.warmth < s.goal) return null
  s.warmth = 0
  const pet = newPet(s.pets.map((p) => p.species))
  if (pet) s.pets.push(pet)
  return pet
}

/** 앱이 켜져 있던 시간(분) 반영: 누적 시간, 먹이, 알 따뜻함 */
export function elapse(s: GameState, min: number): Pet | null {
  s.totalMinutes += min
  s.foodMin += min
  while (s.foodMin >= FOOD_EVERY) {
    s.foodMin -= FOOD_EVERY
    if (s.food < MAX_FOOD) s.food += 1
  }
  if (s.food >= MAX_FOOD) s.foodMin = 0
  return warm(s, min)
}

export type PatResult = { ok: boolean; msg: string; pet: Pet | null }

export function pat(s: GameState, min: number, limit: number): PatResult {
  if (s.pats.date !== today()) s.pats = { date: today(), n: 0 }
  if (isFull(s)) return { ok: false, msg: '지금은 알이 없어요', pet: null }
  if (s.pats.n >= limit) return { ok: false, msg: `오늘은 충분히 쓰다듬었어요 (${limit}/${limit})`, pet: null }
  s.pats.n += 1
  const pet = warm(s, min)
  return { ok: true, msg: `따뜻해~ (오늘 ${s.pats.n}/${limit})`, pet }
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))

/** 시간 경과에 따른 수치 하락. 한 번에 최대 60분어치만 반영 */
export function decay(s: GameState, now: number) {
  const min = Math.min(60, Math.max(0, (now - s.lastTick) / 60000))
  s.lastTick = now
  for (const p of s.pets) {
    if (p.quest) continue // 토벌 중에는 수치가 변하지 않음
    p.hunger = clamp(p.hunger - 0.6 * min)
    p.clean = clamp(p.clean - 0.4 * min)
    p.mood = clamp(p.mood - (p.hunger < 30 ? 0.9 : 0.5) * min)
  }
}

export { clamp }
