/// <reference types="electron-vite/node" />
import { app, BrowserWindow, ipcMain, Menu, Notification, screen, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { clamp, decay, elapse, isFull, loadState, pat, saveState, warm } from './game'
import { fetchAgenda } from './calendar'
import trayIcon from '../../resources/tray.png?asset'
import { DEFAULT_GOAL, FEED_COST, FEELING_TEXT, feelingOf, GameState, MAX_PETS, MAX_FOOD, minutesToOff, PAT_LIMIT, PAT_MIN, Pet, isUnlocked, LOOT, placeOf, PLACES, RARITY_NAME, rollLoot, QUEST_MIN_HUNGER, questLevel, questMinutes, questRate, questReward, Settings, speciesOf, stageOf, STAGE_NAME } from '../shared/types'

let state: GameState
let petWin: BrowserWindow | null = null
let consoleWin: BrowserWindow | null = null
let tray: Tray | null = null

const wins = () => [petWin, consoleWin].filter((w): w is BrowserWindow => !!w && !w.isDestroyed())
const broadcast = (ch: string, ...a: unknown[]) => wins().forEach((w) => w.webContents.send(ch, ...a))

function log(line: string) {
  broadcast('log', `[${new Date().toLocaleTimeString('ko-KR', { hour12: false })}] ${line}`)
}

function push() {
  saveState(state)
  broadcast('state', state)
}

function load(win: BrowserWindow, page: string) {
  const url = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && url) win.loadURL(`${url}/${page}.html`)
  else win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

const webPrefs = { preload: join(__dirname, '../preload/index.js'), sandbox: false }

/** 화면 아래쪽 전체 폭을 덮는 투명 창. 펫 위가 아니면 클릭이 바탕화면으로 통과함 */
function createPet() {
  const { workArea } = screen.getPrimaryDisplay()
  const h = 280
  petWin = new BrowserWindow({
    width: workArea.width,
    height: h,
    x: workArea.x,
    y: workArea.y + workArea.height - h,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: webPrefs
  })
  petWin.setIgnoreMouseEvents(true, { forward: true })
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  load(petWin, 'pet')
  petWin.on('closed', () => (petWin = null))
}

function createConsole() {
  if (consoleWin && !consoleWin.isDestroyed()) {
    consoleWin.show()
    consoleWin.focus()
    return
  }
  consoleWin = new BrowserWindow({
    width: 540,
    height: 860,
    title: 'egg-pet',
    backgroundColor: '#fff7f9',
    webPreferences: webPrefs
  })
  load(consoleWin, 'console')
  consoleWin.on('closed', () => (consoleWin = null))
}

function togglePet() {
  if (!petWin) return createPet()
  petWin.isVisible() ? petWin.hide() : petWin.show()
}

function announceHatch(pet: Pet | null) {
  if (!pet) return
  log(`🐣 알이 깨졌어요! ${speciesOf(pet.species).name} 등장! (${state.pets.length}/${MAX_PETS})`)
  notify('🐣 알이 깨졌어요!', `${speciesOf(pet.species).name}이(가) 태어났어요`, pet.id)
}

/** 화면 위 알림 배너 + macOS 알림 */
function notify(title: string, body = '', petId?: string) {
  broadcast('announce', { text: body ? `${title}\n${body}` : title, petId })
  // 펫 창이 숨겨져 있을 때만 시스템 알림을 보냄(펫 위 말풍선으로 충분하므로)
  const petVisible = !!petWin && !petWin.isDestroyed() && petWin.isVisible()
  if (!petVisible && Notification.isSupported()) new Notification({ title, body, silent: false }).show()
}

// ---------- 돌보기 ----------
type Care = 'feed' | 'play' | 'wash'

function care(id: string, kind: Care): string {
  const p = state.pets.find((x) => x.id === id)
  if (!p) return '펫을 찾을 수 없어요'
  if (p.quest) return '토벌 중이라 돌볼 수 없어요'
  const name = speciesOf(p.species).name
  const before = stageOf(p.growth)
  let say: string
  if (kind === 'feed') {
    if (state.food < FEED_COST) return `먹이가 부족해요 (켜 둔 시간 3분마다 1개, 현재 ${state.food}개)`
    state.food -= FEED_COST
    p.hunger = clamp(p.hunger + 35)
    p.mood = clamp(p.mood + 5)
    p.growth += 2
    say = '냠냠!'
  } else if (kind === 'play') {
    p.mood = clamp(p.mood + 30)
    p.hunger = clamp(p.hunger - 5)
    p.clean = clamp(p.clean - 5)
    p.growth += 2
    say = '꺄르르 신나!'
  } else {
    p.clean = clamp(p.clean + 45)
    p.mood = clamp(p.mood + 5)
    p.growth += 1
    say = '뽀득뽀득, 상쾌해!'
  }
  broadcast('react', id, say)
  checkGrowth(p, before)
  push()
  return say
}

function checkGrowth(p: Pet, before: ReturnType<typeof stageOf>) {
  const after = stageOf(p.growth)
  if (after === before) return
  const name = speciesOf(p.species).name
  log(`✨ ${name}이(가) ${STAGE_NAME[after]}(으)로 자랐어요!`)
  if (after === 'adult' && !state.dex.includes(p.species)) {
    state.dex.push(p.species)
    log(`📖 도감에 ${name} 등록!`)
  }
}

// ---------- 토벌 ----------
function sendQuest(id: string, placeId: string): string {
  const p = state.pets.find((x) => x.id === id)
  if (!p) return '펫을 찾을 수 없어요'
  if (p.quest) return '이미 토벌 중이에요'
  if (feelingOf(p) === 'sick') return '시무룩해서 갈 수 없어요. 먼저 돌봐주세요'
  if (p.hunger < QUEST_MIN_HUNGER) return `배가 고파서 갈 수 없어요 (배부름 ${QUEST_MIN_HUNGER} 이상 필요)`
  const place = placeOf(placeId)
  if (!isUnlocked(place, state.questWins)) return `${place.name}은(는) 아직 갈 수 없어요 (토벌 ${place.unlockWins}승 필요, 현재 ${state.questWins}승)`
  const now = Date.now()
  const minutes = questMinutes(p, place)
  p.quest = { start: now, endsAt: now + minutes * 60000, place: place.id }
  p.tries = (p.tries ?? 0) + 1
  const name = speciesOf(p.species).name
  log(`⚔️ ${name}이(가) ${place.emoji}${place.name} 토벌을 떠났어요 (${minutes}분, 성공 확률 ${Math.round(questRate(p, place) * 100)}%)`)
  push()
  return `${name} ${place.name} 토벌 출발! ${minutes}분 뒤에 돌아와요`
}

function finishQuests() {
  const now = Date.now()
  for (const p of state.pets) {
    if (!p.quest || now < p.quest.endsAt) continue
    const place = placeOf(p.quest.place)
    const name = speciesOf(p.species).name
    const before = stageOf(p.growth)
    const rate = questRate(p, place)
    p.quest = undefined
    const success = Math.random() < rate
    let text: string
    if (success) {
      const r = questReward(p, place)
      const lucky = p.species === 'usagi' && Math.random() < 0.3
      const mult = lucky ? 2 : 1
      const lvBefore = questLevel(p)
      state.food = Math.min(MAX_FOOD, state.food + r.food * mult)
      p.growth += r.growth * mult
      p.wins = (p.wins ?? 0) + 1
      const wasOpen = PLACES.filter((x) => isUnlocked(x, state.questWins)).length
      state.questWins += 1
      const nowOpen = PLACES.filter((x) => isUnlocked(x, state.questWins))
      const loot = rollLoot(place.id)
      const firstLoot = !state.loot[loot.id]
      state.loot[loot.id] = (state.loot[loot.id] ?? 0) + 1
      p.hunger = clamp(p.hunger - 20)
      p.clean = clamp(p.clean - 25)
      p.mood = clamp(p.mood + 10)
      text = `먹이 +${r.food * mult}, 성장 +${r.growth * mult}${lucky ? ' (행운 발동! 2배)' : ''}, ${loot.emoji}${loot.name}(${RARITY_NAME[loot.rarity]}) 획득${firstLoot ? ' ✨NEW' : ''}`
      notify(`⚔️ ${name} ${place.name} 토벌 성공!`, text, p.id)
      broadcast('react', p.id, lucky ? '럭키!!' : '해냈다!')
      if (nowOpen.length > wasOpen) {
        const np = nowOpen[nowOpen.length - 1]
        notify('🔓 새 장소 해금!', `${np.emoji} ${np.name}에 갈 수 있어요`)
        log(`🔓 ${np.emoji} ${np.name} 해금!`)
      }
      if (loot.rarity === 'rare') notify(`${loot.emoji} 전설 전리품!`, `${loot.name}을(를) 얻었어요`, p.id)
      if (LOOT.every((l) => state.loot[l.id])) log('🏆 모든 전리품을 모았어요!')
      if (questLevel(p) > lvBefore) log(`🏅 ${name}의 토벌 레벨이 ${questLevel(p)}(으)로 올랐어요!`)
    } else {
      p.growth += 1
      p.hunger = clamp(p.hunger - 20)
      p.clean = clamp(p.clean - 25)
      p.mood = clamp(p.mood - (p.species === 'chiikawa' ? 15 : 30))
      text = '다쳐서 돌아왔어요'
      notify(`🩹 ${name} ${place.name} 토벌 실패`, '다쳐서 돌아왔어요. 돌봐주세요', p.id)
      broadcast('react', p.id, '으앙…')
    }
    log(`${success ? '⚔️' : '🩹'} ${name} ${place.name} 토벌 ${success ? '성공' : '실패'}: ${text}`)
    state.questLog = [{ at: now, species: p.species, place: place.id, success, text }, ...state.questLog].slice(0, 10)
    checkGrowth(p, before)
  }
}

function release(id: string): string {
  const i = state.pets.findIndex((x) => x.id === id)
  if (i < 0) return '펫을 찾을 수 없어요'
  const [p] = state.pets.splice(i, 1)
  log(`👋 ${speciesOf(p.species).name}을(를) 놓아줬어요. 새 알이 나올 수 있어요`)
  push()
  return '안녕…'
}

function petMenu(id?: string) {
  const p = id ? state.pets.find((x) => x.id === id) : undefined
  const common: Electron.MenuItemConstructorOptions[] = [
    { label: '컨트롤 패널 열기', click: createConsole },
    { label: '펫 숨기기', click: togglePet },
    { label: '종료', click: () => app.quit() }
  ]
  const template: Electron.MenuItemConstructorOptions[] = []
  if (p) {
    template.push(
      { label: `${speciesOf(p.species).name} · ${STAGE_NAME[stageOf(p.growth)]}`, enabled: false },
      { label: `🍙 ${Math.round(p.hunger)}  💗 ${Math.round(p.mood)}  🫧 ${Math.round(p.clean)}`, enabled: false },
      { label: `밥 주기 (먹이 ${FEED_COST}개, 보유 ${state.food})`, click: () => care(p.id, 'feed') },
      { label: '놀아주기', click: () => care(p.id, 'play') },
      { label: '씻기기', click: () => care(p.id, 'wash') },
      { label: '토벌 보내기', submenu: PLACES.map((pl) => ({ label: isUnlocked(pl, state.questWins) ? `${pl.emoji} ${pl.name} (${questMinutes(p, pl)}분, 성공 ${Math.round(questRate(p, pl) * 100)}%)` : `🔒 ${pl.name} (${pl.unlockWins}승 필요)`, enabled: isUnlocked(pl, state.questWins), click: () => notify('⚔️ 토벌', sendQuest(p.id, pl.id), p.id) })) },
      { label: '놓아주기', click: () => release(p.id) },
      { type: 'separator' }
    )
  }
  Menu.buildFromTemplate([...template, ...common]).popup({ window: petWin ?? undefined })
}

// ---------- 알람 / 퇴근 / 캘린더 ----------
const fired = new Set<string>()
const ymd = (d: Date) => d.toDateString()
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

function checkTimers() {
  const now = new Date()
  const once = (key: string) => (fired.has(key) ? false : (fired.add(key), true))
  const { settings: st } = state

  for (const a of st.alarms) {
    if (a.enabled && a.time === hhmm(now) && once(`alarm-${a.id}-${ymd(now)}-${a.time}`)) notify('⏰ 알람', a.label || a.time)
  }

  const left = minutesToOff(now, st)
  if (left !== null) {
    for (const t of [60, 30, 10]) {
      if (left <= t && left > t - 2 && once(`off-${t}-${ymd(now)}`)) notify('🏃 퇴근 카운트다운', t === 60 ? '퇴근까지 1시간!' : `퇴근까지 ${t}분!`)
    }
  }
  const day = now.getDay()
  const workday = !st.offWeekdaysOnly || (day !== 0 && day !== 6)
  if (workday && hhmm(now) === st.offTime && once(`off-0-${ymd(now)}`)) notify('🎉 퇴근 시간!', '오늘도 수고했어요')

  for (const e of state.agenda) {
    const min = Math.round((e.start - now.getTime()) / 60000)
    if (!e.allDay && min > 0 && min <= st.remindBefore && once(`ev-${e.id}-${e.start}`)) notify(`📅 ${min}분 뒤 일정`, e.title)
  }
}

async function refreshAgenda() {
  const url = state.settings.icsUrl.trim()
  if (!url) {
    state.agenda = []
    return broadcast('state', state)
  }
  try {
    state.agenda = await fetchAgenda(url)
    broadcast('state', state)
  } catch (e) {
    log(`⚠️ 캘린더 오류: ${(e as Error).message}`)
  }
}

function setSettings(patch: Partial<Settings>) {
  const urlChanged = patch.icsUrl !== undefined && patch.icsUrl !== state.settings.icsUrl
  state.settings = { ...state.settings, ...patch }
  push()
  if (urlChanged) refreshAgenda().then(() => log(state.settings.icsUrl ? `📅 캘린더 일정 ${state.agenda.length}개를 불러왔어요` : '캘린더 연결을 해제했어요'))
}

// ---------- 콘솔 명령(테스트용) ----------
function run(input: string): string[] {
  const [cmd, arg] = input.trim().split(/\s+/)
  const n = Number(arg)
  switch (cmd) {
    case 'hatch':
      if (isFull(state)) return [`펫이 가득 찼어요 (최대 ${MAX_PETS}마리). 놓아주기로 자리를 비워주세요`]
      announceHatch(warm(state, Math.max(0.1, state.goal - state.warmth)))
      push()
      return ['바로 부화!']
    case 'add':
      if (!(n > 0)) return ['사용법: add <분>']
      announceHatch(warm(state, n))
      push()
      return [`알에 ${n}분어치 따뜻함 추가`]
    case 'goal':
      if (!Number.isInteger(n) || n < 1) return ['사용법: goal <분>']
      state.goal = n
      push()
      return [`부화 목표 ${n}분`]
    case 'grow':
      state.pets.forEach((p) => {
        p.growth = Math.max(p.growth, 30)
        if (!state.dex.includes(p.species)) state.dex.push(p.species)
      })
      push()
      return ['모두 어른이 됐어요']
    case 'questdone':
      state.pets.forEach((p) => p.quest && (p.quest.endsAt = 0))
      finishQuests()
      push()
      return ['토벌을 마쳤어요']
    case 'alert':
      notify('🔔 알림 테스트', '알림이 잘 보이나요?')
      return ['알림을 보냈어요']
    case 'pet':
      togglePet()
      return ['토글했어요']
    case 'reset':
      state = { ...state, goal: DEFAULT_GOAL, warmth: 0, totalMinutes: 0, food: 0, foodMin: 0, pets: [], dex: [], questLog: [], questWins: 0, loot: {}, lastTick: Date.now() }
      push()
      return ['초기화 완료']
    case 'quit':
      app.quit()
      return []
    default:
      return [`알 수 없는 명령: ${cmd}`]
  }
}

function tick() {
  const now = Date.now()
  // 컴퓨터가 잠들었다 깨어난 경우를 고려해 한 번에 최대 1분만 따뜻함으로 인정
  const dt = Math.min(1, Math.max(0, (now - state.lastTick) / 60000))
  announceHatch(elapse(state, dt))
  finishQuests()
  decay(state, now)
  push()
  const p = state.pets[Math.floor(Math.random() * state.pets.length)]
  if (p && feelingOf(p) !== 'happy' && Math.random() < 0.3) {
    const t = FEELING_TEXT[feelingOf(p)]
    broadcast('react', p.id, t[Math.floor(Math.random() * t.length)])
  }
}

app.setAppUserModelId('com.lia.eggpet') // 윈도우 알림에 필요

app.whenReady().then(() => {
  state = loadState()
  finishQuests() // 앱이 꺼져 있는 동안 끝난 토벌 정산
  decay(state, Date.now())

  ipcMain.handle('state', () => state)
  ipcMain.handle('run', (_e, input: string) => run(input))
  ipcMain.handle('care', (_e, id: string, kind: Care) => care(id, kind))
  ipcMain.handle('quest', (_e, id: string, place: string) => sendQuest(id, place))
  ipcMain.handle('release', (_e, id: string) => release(id))
  ipcMain.handle('pat', () => {
    const r = pat(state, PAT_MIN, PAT_LIMIT)
    announceHatch(r.pet)
    push()
    return r.msg
  })
  ipcMain.handle('settings', (_e, patch: Partial<Settings>) => {
    setSettings(patch)
    return state.settings
  })
  ipcMain.on('pet-menu', (_e, id?: string) => petMenu(id))
  // 펫/알 위에 마우스가 있을 때만 클릭을 받고, 나머지는 바탕화면으로 통과
  ipcMain.on('interactive', (_e, on: boolean) => petWin?.setIgnoreMouseEvents(!on, { forward: true }))

  createPet()
  createConsole() // 컨트롤 패널은 항상 기본으로 띄움

  // 알 이미지를 트레이 크기로 줄여서 사용(맥 메뉴바 18px, 윈도우 16px)
  tray = new Tray(nativeImage.createFromPath(trayIcon).resize({ height: process.platform === 'darwin' ? 18 : 16 }))
  tray.setToolTip('egg-pet')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '컨트롤 패널 열기', click: createConsole },
      { label: '펫 보이기/숨기기', click: togglePet },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() }
    ])
  )

  setInterval(tick, 15000)
  setInterval(checkTimers, 20000)
  setInterval(refreshAgenda, 10 * 60 * 1000)
  refreshAgenda()
  log('egg-pet 시작')
})

// 패널을 닫아도 펫/트레이는 계속 실행
app.on('window-all-closed', () => undefined)
app.on('activate', createConsole)
