import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { GameState, LookKey, Pet } from '../../shared/types'
import { FEELING_TEXT, feelingOf, minutesToOff, SCENE_TEXT, sceneOf, STAGE_SIZE, stageOf } from '../../shared/types'
import { Creature, Egg, hasLook } from './Creature'
import './pet.css'

interface Walker { x: number; dir: 1 | -1; moving: boolean; arriveAt: number }

const SPEED = 45 // px/s
const EGG_AREA = 150 // 오른쪽 알 자리
const LEFT_PAD = 100 // 왼쪽 여유(말풍선이 화면 밖으로 잘리지 않게)
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

/** 지금 상태에 맞는 그림 키. 그 종에 전용 그림이 없으면 기본 그림이 쓰임 */
function lookFor(p: Pet, st: GameState, now: Date): { look: LookKey; sleepy: boolean } {
  const f = feelingOf(p)
  if (f === 'sick' || f === 'sad') return { look: 'sad', sleepy: !hasLook(p.species, 'sad') }
  return { look: sceneOf(now, st.settings), sleepy: false }
}

const fmt = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`

const Notices = ({ list }: { list?: { id: number; text: string }[] }) =>
  list?.length ? (
    <div className="notices">
      {list.map((n) => (
        <div key={n.id} className="bubble notice">
          <span className="nt">{n.text.split('\n')[0]}</span>
          {n.text.includes('\n') && <span className="nb">{n.text.split('\n').slice(1).join(' ')}</span>}
        </div>
      ))}
    </div>
  ) : null

function App() {
  const [s, setS] = useState<GameState | null>(null)
  const [now, setNow] = useState(new Date())
  const [walkers, setWalkers] = useState<Record<string, Walker>>({})
  const [bubbles, setBubbles] = useState<Record<string, string>>({})
  const [eggMsg, setEggMsg] = useState('')
  // 알림 말풍선: 대상(펫 id | 'egg' | 'free') → 표시 중인 알림들
  const [notices, setNotices] = useState<Record<string, { id: number; text: string }[]>>({})
  const [wobble, setWobble] = useState(0)
  const sRef = useRef<GameState | null>(null)
  sRef.current = s

  // 알 드래그: 가로 위치는 기억하고, 놓으면 바닥으로 떨어짐
  const eggRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(false)
  const movedRef = useRef(false)
  const [eggX, setEggX] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem('eggX')
      return v === null ? null : Number(v)
    } catch {
      return null
    }
  })
  const [lift, setLift] = useState(0)
  const [dragging, setDragging] = useState(false)

  const say = (id: string, text: string) => {
    setBubbles((b) => ({ ...b, [id]: text }))
    setTimeout(() => setBubbles((b) => (b[id] === text ? Object.fromEntries(Object.entries(b).filter(([k]) => k !== id)) : b)), 3500)
  }

  useEffect(() => {
    window.api.getState().then(setS)
    const offs = [
      window.api.onState(setS),
      window.api.onReact(say),
      window.api.onAnnounce(({ text, petId }) => {
        const st = sRef.current
        const visible = (st?.pets ?? []).filter((p) => !p.quest)
        const showEgg = !!st && st.pets.length < 5 && (st.warmth > 0 || st.pets.length === 0)
        // 관련 펫 → 아무 펫 → 알 → 화면 오른쪽 아래 순서로 말풍선을 띄움
        const target = visible.find((p) => p.id === petId)?.id ?? (visible.length ? pick(visible).id : showEgg ? 'egg' : 'free')
        const id = Date.now() + Math.random()
        setNotices((n) => ({ ...n, [target]: [...(n[target] ?? []), { id, text }].slice(-2) }))
        setTimeout(() => setNotices((n) => ({ ...n, [target]: (n[target] ?? []).filter((x) => x.id !== id) })), 9000)
      })
    ]
    const clock = setInterval(() => setNow(new Date()), 15000)
    return () => {
      offs.forEach((o) => o())
      clearInterval(clock)
    }
  }, [])

  // 펫마다 가끔 새 목적지를 골라 걸어감. 시무룩한 펫은 가만히 있음
  useEffect(() => {
    const tick = () => {
      const st = sRef.current
      if (!st) return
      const width = window.innerWidth - EGG_AREA
      const t = Date.now()
      setWalkers((prev) => {
        const next: Record<string, Walker> = {}
        for (const p of st.pets.filter((x) => !x.quest)) {
          const size = STAGE_SIZE[stageOf(p.growth)]
          const w = prev[p.id] ?? { x: Math.max(LEFT_PAD, width - 20 - Math.random() * 200), dir: -1 as const, moving: false, arriveAt: 0 }
          const asleep = sceneOf(new Date(), st.settings) === 'night'
          if (t >= w.arriveAt && feelingOf(p) !== 'sick' && !asleep && Math.random() < 0.5) {
            const tx = LEFT_PAD + Math.random() * Math.max(1, width - size - LEFT_PAD)
            next[p.id] = { x: tx, dir: tx > w.x ? 1 : -1, moving: true, arriveAt: t + (Math.abs(tx - w.x) / SPEED) * 1000 }
          } else {
            next[p.id] = { ...w, moving: t < w.arriveAt }
          }
        }
        return next
      })
    }
    tick()
    const id = setInterval(tick, 2500)
    return () => clearInterval(id)
  }, [])

  // 가끔 혼잣말: 기분이 안 좋으면 그 얘기, 아니면 시간대에 맞는 말
  useEffect(() => {
    const id = setInterval(() => {
      const st = sRef.current
      if (!st?.pets.length || Math.random() > 0.4) return
      const p = pick(st.pets)
      const f = feelingOf(p)
      say(p.id, f !== 'happy' ? pick(FEELING_TEXT[f]) : pick(SCENE_TEXT[sceneOf(new Date(), st.settings)]))
    }, 7000)
    return () => clearInterval(id)
  }, [])

  if (!s) return null
  const full = s.pets.length >= 5
  const showEgg = !full && (s.warmth > 0 || s.pets.length === 0)
  const progress = s.warmth / s.goal
  const left = minutesToOff(now, s.settings)
  const hover = { onMouseEnter: () => window.api.setInteractive(true), onMouseLeave: () => window.api.setInteractive(false) }

  const onEggDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !eggRef.current) return
    const rect = eggRef.current.getBoundingClientRect()
    const sx = e.clientX
    const sy = e.clientY
    const startLift = lift
    let lastX = rect.left
    movedRef.current = false
    dragRef.current = true
    window.api.setInteractive(true) // 드래그 중 마우스가 알 밖으로 나가도 계속 받음
    const move = (m: MouseEvent) => {
      const dx = m.clientX - sx
      const dy = m.clientY - sy
      if (!movedRef.current && Math.hypot(dx, dy) < 4) return
      movedRef.current = true
      setDragging(true)
      lastX = Math.max(0, Math.min(window.innerWidth - rect.width, rect.left + dx))
      setEggX(lastX)
      setLift(Math.max(0, Math.min(window.innerHeight - rect.height - 8, startLift - dy)))
    }
    const up = (u: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      dragRef.current = false
      setDragging(false)
      if (movedRef.current) {
        setLift(0) // 바닥으로 톡 떨어짐
        try {
          localStorage.setItem('eggX', String(Math.round(lastX)))
        } catch {
          /* 저장 실패는 무시 */
        }
      }
      const over = document.elementFromPoint(u.clientX, u.clientY)?.closest('.eggbox, .walker')
      window.api.setInteractive(!!over)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // 알과 퇴근 말풍선이 함께 쓰는 위치(드래그하면 같이 움직임)
  const anchorStyle: React.CSSProperties = {
    right: eggX === null ? 24 : 'auto',
    left: eggX === null ? 'auto' : Math.min(eggX, window.innerWidth - 100),
    bottom: 4 + lift,
    transition: dragging ? 'none' : 'bottom .3s cubic-bezier(.5, 0, 1, .6)'
  }
  const offPill = left !== null ? <div className="pill">🏃 퇴근까지 {fmt(left)}</div> : null

  const patEgg = async () => {
    if (movedRef.current) return // 드래그였다면 쓰다듬기로 치지 않음
    const msg = await window.api.pat()
    setEggMsg(msg)
    setWobble((n) => n + 1)
    setTimeout(() => setEggMsg(''), 2500)
  }

  return (
    <div className="stage">
      {s.pets.filter((p) => !p.quest).map((p) => {
        const w = walkers[p.id]
        const size = STAGE_SIZE[stageOf(p.growth)]
        const { look, sleepy } = lookFor(p, s, now)
        const dur = w?.moving ? Math.max(0.1, w.arriveAt - Date.now()) / 1000 : 0
        return (
          <div
            key={p.id}
            className={`walker ${feelingOf(p)}${sleepy ? ' gray' : ''}`}
            style={{ left: w?.x ?? 0, transition: `left ${dur}s linear` }}
            {...hover}
            onClick={() => window.api.petMenu(p.id)}
            onContextMenu={(e) => { e.preventDefault(); window.api.petMenu(p.id) }}
          >
            <Notices list={notices[p.id]} />
            {bubbles[p.id] && !notices[p.id]?.length && <div className="bubble">{bubbles[p.id]}</div>}
            <div className={`body ${w?.moving ? 'walking' : 'idle'}`} style={{ transform: `scaleX(${w?.dir === 1 ? -1 : 1})` }}>
              <Creature species={p.species} look={look} seed={Math.floor(now.getMinutes() / 10)} size={size} />
            </div>
          </div>
        )
      })}

      {notices.free?.length ? (
        <div className="free-notice">
          <Notices list={notices.free} />
        </div>
      ) : null}

      {!showEgg && offPill && (
        <div className="pill-solo" style={anchorStyle}>
          {offPill}
        </div>
      )}

      {showEgg && (
        <div
          className="eggbox"
          key={wobble}
          ref={eggRef}
          style={{ ...anchorStyle, cursor: dragging ? 'grabbing' : 'grab' }}
          onMouseDown={onEggDown}
          onMouseEnter={() => window.api.setInteractive(true)}
          onMouseLeave={() => !dragRef.current && window.api.setInteractive(false)}
          onClick={patEgg}
          onContextMenu={(e) => { e.preventDefault(); window.api.petMenu() }}
        >
          <Notices list={notices.egg} />
          {offPill}
          {eggMsg && <div className="bubble egg-bubble">{eggMsg}</div>}
          <Egg progress={progress} />
          <div className="bar"><div style={{ width: `${progress * 100}%` }} /></div>
          <div className="count">{Math.max(1, Math.ceil(s.goal - s.warmth))}분 남음</div>
          <div className="hint">클릭: 쓰다듬기 · 드래그: 옮기기</div>
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
