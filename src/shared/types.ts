export interface Species {
  id: string
  name: string
}

export interface Pet {
  id: string
  species: string
  hatchedAt: number
  hunger: number // 0~100, 높을수록 배부름
  mood: number
  clean: number
  growth: number
  quest?: { start: number; endsAt: number; place: string } // 토벌 중이면 존재
  wins?: number // 토벌 성공 횟수
  tries?: number // 토벌 출전 횟수
}

export interface GameState {
  warmth: number // 알이 받은 따뜻함(분)
  goal: number // 부화에 필요한 따뜻함(분)
  totalMinutes: number // 앱을 켜 둔 누적 시간(분)
  food: number
  foodMin: number // 다음 먹이까지 쌓인 시간(분)
  pets: Pet[]
  dex: string[] // 어른까지 키운 종 id
  pats: { date: string; n: number } // 오늘 쓰다듬은 횟수
  lastTick: number
  settings: Settings
  agenda: AgendaItem[] // 캘린더에서 가져온 다가오는 일정(저장하지 않음)
  questLog: QuestLogItem[] // 최근 토벌 결과
  questWins: number // 누적 토벌 성공 횟수(장소 해금 기준)
  loot: Record<string, number> // 모은 전리품 개수
}

export interface QuestLogItem {
  at: number
  species: string
  place: string
  success: boolean
  text: string
}

export interface Alarm {
  id: string
  time: string // 'HH:MM'
  label: string
  enabled: boolean
}

export interface Settings {
  offTime: string // 퇴근 시간 'HH:MM'
  offWeekdaysOnly: boolean
  alarms: Alarm[]
  icsUrl: string // 구글 캘린더 비공개 iCal 주소
  remindBefore: number // 일정 몇 분 전에 알릴지
}

export interface AgendaItem {
  id: string
  start: number
  end: number
  title: string
  allDay: boolean
}

export const DEFAULT_SETTINGS: Settings = { offTime: '18:00', offWeekdaysOnly: true, alarms: [], icsUrl: '', remindBefore: 10 }

export const SPECIES: Species[] = [
  { id: 'hachiware', name: '하치와레' },
  { id: 'chiikawa', name: '치이카와' },
  { id: 'usagi', name: '우사기' },
  { id: 'kuri', name: '쿠리만쥬' },
  { id: 'momonga', name: '모몽가' }
]

export const DEFAULT_GOAL = 30 // 분
export const PAT_MIN = 1 // 쓰다듬기 1번당 분
export const PAT_LIMIT = 10 // 하루 쓰다듬기 한도
export const FOOD_EVERY = 3 // 분마다 먹이 1개
export const MAX_FOOD = 30
export const FEED_COST = 3
export const MAX_PETS = SPECIES.length // 종마다 한 마리씩

// ---------- 토벌 ----------
export interface QuestPlace {
  id: string
  name: string
  emoji: string
  minutes: number
  mod: number // 성공 확률 보정
  food: number
  growth: number
  desc: string
  unlockWins: number // 이 장소를 열기 위한 누적 성공 횟수
}
export const PLACES: QuestPlace[] = [
  { id: 'forest', name: '풀숲', emoji: '🌿', minutes: 15, mod: 0.1, food: 3, growth: 2, desc: '가볍게 다녀오기', unlockWins: 0 },
  { id: 'cave', name: '동굴', emoji: '🕳️', minutes: 30, mod: 0, food: 6, growth: 3, desc: '적당히 위험해요', unlockWins: 3 },
  { id: 'dungeon', name: '던전', emoji: '🏰', minutes: 60, mod: -0.2, food: 14, growth: 6, desc: '크게 벌 수 있지만 위험해요', unlockWins: 10 }
]
export const placeOf = (id: string) => PLACES.find((x) => x.id === id) ?? PLACES[0]
export const isUnlocked = (place: QuestPlace, totalWins: number) => totalWins >= place.unlockWins
export const QUEST_MIN_HUNGER = 30

// ---------- 전리품 ----------
export interface Loot {
  id: string
  name: string
  emoji: string
  place: string
  rarity: 'common' | 'uncommon' | 'rare'
}
export const LOOT: Loot[] = [
  { id: 'mushroom', name: '버섯', emoji: '🍄', place: 'forest', rarity: 'common' },
  { id: 'acorn', name: '도토리', emoji: '🌰', place: 'forest', rarity: 'uncommon' },
  { id: 'clover', name: '네잎클로버', emoji: '🍀', place: 'forest', rarity: 'rare' },
  { id: 'ore', name: '광석', emoji: '🪨', place: 'cave', rarity: 'common' },
  { id: 'crystal', name: '수정', emoji: '💎', place: 'cave', rarity: 'uncommon' },
  { id: 'wing', name: '박쥐 날개', emoji: '🦇', place: 'cave', rarity: 'rare' },
  { id: 'pot', name: '낡은 항아리', emoji: '🏺', place: 'dungeon', rarity: 'common' },
  { id: 'key', name: '황금 열쇠', emoji: '🗝️', place: 'dungeon', rarity: 'uncommon' },
  { id: 'crown', name: '왕관', emoji: '👑', place: 'dungeon', rarity: 'rare' }
]
export const RARITY_NAME = { common: '일반', uncommon: '희귀', rare: '전설' } as const
/** 성공 시 장소의 전리품 1개를 굴림: 일반 65%, 희귀 28%, 전설 7% */
export function rollLoot(placeId: string, r = Math.random()): Loot {
  const list = LOOT.filter((l) => l.place === placeId)
  return r < 0.65 ? list[0] : r < 0.93 ? list[1] : list[2]
}
export const MAX_QUEST_LEVEL = 5

export const TRAITS: Record<string, { name: string; desc: string }> = {
  hachiware: { name: '용감함', desc: '토벌 성공 확률 +10%' },
  momonga: { name: '날쌤', desc: '토벌 시간 20% 단축' },
  chiikawa: { name: '조심성', desc: '실패해도 기분이 덜 떨어져요' },
  usagi: { name: '행운', desc: '30% 확률로 보상 2배' },
  kuri: { name: '먹보', desc: '먹이 보상 +50%' }
}

export const questLevel = (p: Pick<Pet, 'wins'>) => Math.min(MAX_QUEST_LEVEL, 1 + Math.floor((p.wins ?? 0) / 3))
const baseRate = (growth: number) => (growth < 10 ? 0.5 : growth < 30 ? 0.7 : 0.9)
export const questRate = (p: Pet, place: QuestPlace) =>
  Math.max(0.1, Math.min(0.9, baseRate(p.growth) + place.mod + (questLevel(p) - 1) * 0.04 + (p.species === 'hachiware' ? 0.1 : 0)))
export const questMinutes = (p: Pet, place: QuestPlace) => Math.round(place.minutes * (p.species === 'momonga' ? 0.8 : 1))
export const questReward = (p: Pet, place: QuestPlace) => ({
  food: Math.round(place.food * (p.species === 'kuri' ? 1.5 : 1)),
  growth: place.growth
})

export const speciesOf = (id: string) => SPECIES.find((s) => s.id === id) ?? SPECIES[0]

export type Stage = 'baby' | 'child' | 'adult'
export const stageOf = (growth: number): Stage => (growth < 10 ? 'baby' : growth < 30 ? 'child' : 'adult')
export const STAGE_NAME: Record<Stage, string> = { baby: '아기', child: '어린이', adult: '어른' }
export const STAGE_SIZE: Record<Stage, number> = { baby: 58, child: 76, adult: 96 }

export type Feeling = 'happy' | 'hungry' | 'dirty' | 'sad' | 'sick'
export function feelingOf(p: Pet): Feeling {
  if ((p.hunger + p.mood + p.clean) / 3 < 25) return 'sick'
  if (p.hunger < 30) return 'hungry'
  if (p.clean < 30) return 'dirty'
  if (p.mood < 30) return 'sad'
  return 'happy'
}
export const FEELING_TEXT: Record<Feeling, string[]> = {
  happy: ['♪', '헤헤', '오늘도 좋은 날!', '화이팅!'],
  hungry: ['배고파…', '밥 줘…', '꼬르륵'],
  dirty: ['찝찝해…', '씻고 싶어'],
  sad: ['심심해…', '놀아줘…'],
  sick: ['시무룩…', '힘이 없어…']
}

// ---------- 시간대별 모습 ----------
export type Scene = 'night' | 'morning' | 'lunch' | 'afternoon' | 'offsoon' | 'evening'

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** 퇴근까지 남은 분. 오늘 퇴근 시간이 지났거나 쉬는 날이면 null */
export function minutesToOff(now: Date, st: Settings): number | null {
  const day = now.getDay()
  if (st.offWeekdaysOnly && (day === 0 || day === 6)) return null
  const left = toMin(st.offTime) - (now.getHours() * 60 + now.getMinutes())
  return left > 0 ? left : null
}

export function sceneOf(now: Date, st: Settings): Scene {
  const m = now.getHours() * 60 + now.getMinutes()
  const off = minutesToOff(now, st)
  if (m >= 22 * 60 || m < 6 * 60) return 'night'
  if (off !== null && off <= 60) return 'offsoon'
  if (m >= toMin(st.offTime) && m < 22 * 60 && minutesToOff(now, { ...st, offWeekdaysOnly: false }) === null && toMin(st.offTime) > 0 && m - toMin(st.offTime) < 120) return 'evening'
  if (m >= 11 * 60 + 30 && m < 13 * 60 + 30) return 'lunch'
  if (m >= 13 * 60 + 30 && m < 15 * 60 + 30) return 'afternoon'
  return 'morning'
}

export const SCENE_TEXT: Record<Scene, string[]> = {
  morning: ['좋은 아침!', '오늘도 힘내자!', '커피 한 잔 할까?'],
  lunch: ['점심 먹을 시간!', '배고프다~ 뭐 먹지?', '맛있는 거 먹자!'],
  afternoon: ['졸려…', '식곤증이 온다…', '조금만 더 힘내자'],
  offsoon: ['퇴근이 코앞이야!', '조금만 버티자!', '곧 퇴근이다~'],
  evening: ['퇴근 완료! 수고했어', '오늘도 고생했어', '푹 쉬자~'],
  night: ['zzz…', '이제 자야지…', '내일 또 보자']
}

/** 종별 상황 그림. 값은 파일 이름 뒤쪽(종이름_뒤쪽.png). 없으면 '기본' */
export type LookKey = Scene | 'sad' | 'happy' | 'base'
export const SPECIES_LOOKS: Record<string, Partial<Record<LookKey, string>>> = {
  momonga: { base: '기본', night: '취침', afternoon: '낮잠', lunch: '딸기', offsoon: '신남', evening: '신남', happy: '신남' },
  hachiware: { base: '기본', lunch: '면요리|모찌', sad: '울음' },
  chiikawa: { base: '기본', night: '잠옷', lunch: '딤섬', offsoon: '집게', happy: '집게', sad: '울음' },
  usagi: { base: '기본', happy: '하트', evening: '하트' },
  kuri: { base: '기본', lunch: '맥도날드', offsoon: '신남', evening: '신남', happy: '신남' }
}
export const SPECIES_KO: Record<string, string> = { momonga: '모몽가', hachiware: '하치와레', chiikawa: '치이카와', usagi: '우사기', kuri: '쿠리만쥬' }
