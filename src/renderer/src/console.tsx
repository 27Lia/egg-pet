import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntApp, Button, ConfigProvider, Input, InputNumber, Popconfirm, Progress, Space, Statistic, Switch } from 'antd'
import { BellOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, PoweroffOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { Alarm, GameState, Pet } from '../../shared/types'
import { FEED_COST, FOOD_EVERY, isUnlocked, LOOT, RARITY_NAME, MAX_QUEST_LEVEL, placeOf, PLACES, QUEST_MIN_HUNGER, questLevel, questMinutes, questRate, TRAITS, SPECIES_KO, feelingOf, MAX_PETS, minutesToOff, PAT_LIMIT, PAT_MIN, SPECIES, STAGE_NAME, stageOf } from '../../shared/types'
import { Creature, Egg, lookSrc } from './Creature'
import './console.css'

const FEELING_LABEL = { happy: '행복', hungry: '배고픔', dirty: '찝찝함', sad: '심심함', sick: '시무룩' } as const
const fmtTime = (ms: number) => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="stat-row">
      <span>{label}</span>
      <Progress percent={Math.round(value)} size="small" strokeColor={color} showInfo={false} />
    </div>
  )
}

function PetCard({ p, food, wins, onCare, onRelease, onQuest }: { p: Pet; food: number; wins: number; onCare: (k: 'feed' | 'play' | 'wash') => void; onRelease: () => void; onQuest: (placeId: string) => void }) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!p.quest) return
    const id = setInterval(() => force((n) => n + 1), 15000)
    return () => clearInterval(id)
  }, [p.quest])
  const away = p.quest ? Math.max(1, Math.ceil((p.quest.endsAt - Date.now()) / 60000)) : 0
  const stage = stageOf(p.growth)
  const name = SPECIES.find((s) => s.id === p.species)?.name
  return (
    <div className="pet-card">
      <div className="pet-head">
        <Creature species={p.species} size={64} />
        <div>
          <b>{name}</b> <span className="lv">토벌 Lv.{questLevel(p)}{questLevel(p) >= MAX_QUEST_LEVEL ? ' MAX' : ''}</span>
          <div className="muted">{STAGE_NAME[stage]} · {FEELING_LABEL[feelingOf(p)]} · 승 {p.wins ?? 0} / 출전 {p.tries ?? 0}</div>
          <div className="trait">✨ {TRAITS[p.species]?.name} — {TRAITS[p.species]?.desc}</div>
        </div>
      </div>
      <Bar label="🍙 배부름" value={p.hunger} color="#ffb347" />
      <Bar label="💗 기분" value={p.mood} color="#ff8fab" />
      <Bar label="🫧 청결" value={p.clean} color="#6ec6ff" />
      {p.quest ? (
        <div className="quest-away">⚔️ {placeOf(p.quest.place).emoji} {placeOf(p.quest.place).name} 토벌 중 · {away}분 뒤 돌아와요</div>
      ) : (
        <div className="places">
          {PLACES.map((pl) => (
            <Button key={pl.id} size="small" disabled={!isUnlocked(pl, wins)} onClick={() => onQuest(pl.id)} title={pl.desc}>
              {isUnlocked(pl, wins)
                ? `${pl.emoji} ${pl.name} · ${questMinutes(p, pl)}분 · ${Math.round(questRate(p, pl) * 100)}%`
                : `🔒 ${pl.name} · 토벌 ${pl.unlockWins}승 필요 (${wins}/${pl.unlockWins})`}
            </Button>
          ))}
        </div>
      )}
      <Space size={6} wrap>
        <Button size="small" disabled={!!p.quest || food < FEED_COST} onClick={() => onCare('feed')}>밥 주기 ({FEED_COST})</Button>
        <Button size="small" disabled={!!p.quest} onClick={() => onCare('play')}>놀아주기</Button>
        <Button size="small" disabled={!!p.quest} onClick={() => onCare('wash')}>씻기기</Button>
        <Popconfirm title="이 펫을 놓아줄까요?" okText="놓아주기" cancelText="취소" onConfirm={onRelease}>
          <Button size="small" danger type="text">놓아주기</Button>
        </Popconfirm>
      </Space>
    </div>
  )
}

const TEST_PASSWORD = 'qwer1234!'

function Panel() {
  const { message } = AntApp.useApp()
  const [testOpen, setTestOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [s, setS] = useState<GameState | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [goal, setGoal] = useState<number | null>(null)
  const [url, setUrl] = useState('')
  const [newTime, setNewTime] = useState('12:00')
  const [newLabel, setNewLabel] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getState().then((st) => {
      setS(st)
      setGoal(st.goal)
      setUrl(st.settings.icsUrl)
    })
    const a = window.api.onState(setS)
    const b = window.api.onLog((l) => setLogs((p) => [...p.slice(-49), l]))
    return () => {
      a()
      b()
    }
  }, [])

  useEffect(() => {
    logEnd.current?.scrollIntoView()
  }, [logs])

  // 초기화 등으로 부화 시간이 바뀌면 입력칸도 맞춤
  useEffect(() => {
    if (s) setGoal(s.goal)
  }, [s?.goal])

  if (!s) return null
  const st = s.settings
  const full = s.pets.length >= MAX_PETS
  const pct = Math.floor((s.warmth / s.goal) * 100)
  const left = minutesToOff(new Date(), st)
  const run = async (cmd: string, ok?: string) => {
    const out = await window.api.run(cmd)
    if (ok) message.success(ok)
    else if (out[0]) message.info(out[0])
  }
  const care = async (id: string, k: 'feed' | 'play' | 'wash') => message.info(await window.api.care(id, k))
  const set = (patch: Parameters<typeof window.api.setSettings>[0]) => window.api.setSettings(patch)
  const setAlarms = (alarms: Alarm[]) => set({ alarms })
  const unlock = () => {
    if (pw === TEST_PASSWORD) {
      setTestOpen(true)
      setPw('')
    } else {
      message.error('비밀번호가 맞지 않아요')
      setPw('')
    }
  }

  return (
    <div className="panel">
      <section className="card hero">
        {full ? <div className="full-badge">🏠</div> : <Egg progress={s.warmth / s.goal} size={96} />}
        <div className="hero-info">
          {full ? (
            <>
              <h2>펫이 가득 찼어요 ({MAX_PETS}/{MAX_PETS})</h2>
              <p>펫을 놓아주면 새 알이 다시 자라요</p>
            </>
          ) : (
            <>
              <h2>알이 {pct}% 따뜻해졌어요</h2>
              <Progress percent={pct} showInfo={false} strokeColor="#ffb4c8" />
              <p>{Math.max(1, Math.ceil(s.goal - s.warmth))}분 뒤에 깨요 (오늘 쓰다듬기 {s.pats.n}/{PAT_LIMIT})</p>
            </>
          )}
        </div>
      </section>

      <section className="card howto">
        <h3>🥚 알 깨는 방법</h3>
        <ol>
          <li><b>앱을 켜 두세요.</b> 켜져 있는 동안 시간이 지나면 알이 따뜻해져요. 총 {s.goal}분이 필요해요.</li>
          <li><b>알을 쓰다듬어 주세요.</b> 바탕화면의 알을 클릭하면 {PAT_MIN}분어치 따뜻해져요. 하루에 {PAT_LIMIT}번까지 할 수 있어요.</li>
          <li>알이 깨지면 <b>아직 없는 종</b>의 펫이 나와요. 최대 {MAX_PETS}마리(종마다 한 마리)예요.</li>
          <li><b>토벌</b>은 장소(풀숲·동굴·던전)를 골라 펫을 보내요. 승리가 쌓이면 새 장소가 열려요(동굴 3승, 던전 10승). 다녀오면 먹이와 성장을 얻고, 실패하면 다쳐서 와요. 성공할수록 토벌 레벨이 올라 확률이 높아지고, 종마다 특성이 달라요. 배부름 {QUEST_MIN_HUNGER} 이상이어야 갈 수 있어요.</li>
          <li>먹이는 켜 둔 시간 {FOOD_EVERY}분마다 1개씩 생기고, 밥 주기에 {FEED_COST}개를 써요.</li>
        </ol>
      </section>

      <section className="card stats">
        <Statistic title="먹이" value={s.food} />
        <Statistic title="켜 둔 시간" value={Math.floor(s.totalMinutes)} suffix="분" />
        <Statistic title="펫" value={s.pets.length} suffix={`/ ${MAX_PETS}`} />
      </section>

      <section className="card">
        <h3>내 펫</h3>
        {s.pets.length === 0 ? (
          <p className="muted">아직 부화한 펫이 없어요. 앱을 켜 두거나 알을 쓰다듬어 보세요!</p>
        ) : (
          <div className="pet-list">
            {s.pets.map((p) => (
              <PetCard key={p.id} p={p} food={s.food} wins={s.questWins} onCare={(k) => care(p.id, k)} onRelease={() => window.api.release(p.id)} onQuest={async (pl) => message.info(await window.api.quest(p.id, pl))} />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3>⚔️ 토벌 기록</h3>
        {s.questLog.length === 0 ? (
          <p className="muted">아직 토벌 기록이 없어요</p>
        ) : (
          <div className="agenda">
            {s.questLog.map((q) => (
              <div key={q.at} className="agenda-row">
                <span className="muted">{new Date(q.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                <span>{q.success ? '✅' : '🩹'} {SPECIES_KO[q.species]} · {placeOf(q.place).name} · {q.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3>🎒 전리품 ({LOOT.filter((l) => s.loot[l.id]).length}/{LOOT.length}) <span className="muted">토벌 {s.questWins}승</span></h3>
        <div className="loot">
          {LOOT.map((l) => {
            const n = s.loot[l.id] ?? 0
            return (
              <div key={l.id} className={`loot-item ${l.rarity}${n ? '' : ' locked'}`} title={`${placeOf(l.place).name} · ${RARITY_NAME[l.rarity]}`}>
                <span className="emoji">{l.emoji}</span>
                <span>{n ? l.name : '???'}</span>
                {n > 0 && <span className="cnt">x{n}</span>}
              </div>
            )
          })}
        </div>
        {LOOT.every((l) => s.loot[l.id]) && <p className="complete">🏆 전리품 컬렉션 완성!</p>}
      </section>

      <section className="card">
        <h3>도감 ({s.dex.length}/{SPECIES.length}) <span className="muted">어른까지 키우면 등록돼요</span></h3>
        <div className="dex">
          {SPECIES.map((sp) => {
            const got = s.dex.includes(sp.id)
            return (
              <div key={sp.id} className={`dex-item${got ? '' : ' locked'}`}>
                <img src={lookSrc(sp.id)} width={56} height={56} draggable={false} />
                <span>{got ? sp.name : '???'}</span>
              </div>
            )
          })}
        </div>
        {s.dex.length === SPECIES.length && <p className="complete">🎉 도감 완성!</p>}
      </section>

      <section className="card">
        <h3><BellOutlined /> 퇴근 · 알람</h3>
        <Space orientation="vertical" style={{ width: '100%' }} size={10}>
          <Space wrap>
            <span>퇴근 시간</span>
            <Input type="time" value={st.offTime} onChange={(e) => e.target.value && set({ offTime: e.target.value })} style={{ width: 160 }} />
            <Switch checked={st.offWeekdaysOnly} onChange={(v) => set({ offWeekdaysOnly: v })} /> <span className="muted">평일만</span>
          </Space>
          <div className="muted">{left !== null ? `퇴근까지 ${Math.floor(left / 60)}시간 ${left % 60}분` : '오늘 퇴근 카운트다운은 끝났어요'} · 1시간, 30분, 10분 전과 퇴근 시간에 알려줘요</div>

          {st.alarms.map((a) => (
            <div key={a.id} className="alarm-row">
              <Switch size="small" checked={a.enabled} onChange={(v) => setAlarms(st.alarms.map((x) => (x.id === a.id ? { ...x, enabled: v } : x)))} />
              <b>{a.time}</b>
              <span className="grow">{a.label || '알람'}</span>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setAlarms(st.alarms.filter((x) => x.id !== a.id))} />
            </div>
          ))}
          <Space.Compact style={{ width: '100%' }}>
            <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ width: 160 }} />
            <Input placeholder="알람 이름 (예: 약 먹기)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setAlarms([...st.alarms, { id: crypto.randomUUID(), time: newTime, label: newLabel.trim(), enabled: true }])
                setNewLabel('')
              }}
            >
              추가
            </Button>
          </Space.Compact>
          <Button size="small" onClick={() => run('alert')}>알림 테스트</Button>
        </Space>
      </section>

      <section className="card">
        <h3>📅 구글 캘린더</h3>
        <p className="muted tip">구글 캘린더 → 설정 → 내 캘린더 → <b>캘린더 통합</b> → <b>iCal 형식의 비공개 주소</b>를 복사해서 붙여넣어요. 이 주소는 남에게 보여주지 마세요.</p>
        <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
          <Input.Password placeholder="https://calendar.google.com/calendar/ical/.../basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="primary" onClick={() => set({ icsUrl: url.trim() })}>연결</Button>
          {st.icsUrl && <Button onClick={() => { setUrl(''); set({ icsUrl: '' }) }}>해제</Button>}
        </Space.Compact>
        <Space style={{ marginBottom: 8 }}>
          <InputNumber min={1} max={120} value={st.remindBefore} onChange={(v) => v && set({ remindBefore: v })} suffix="분 전" style={{ width: 120 }} />
          <span className="muted">에 알려줘요</span>
        </Space>
        {s.agenda.length === 0 ? (
          <p className="muted">{st.icsUrl ? '앞으로 36시간 안에 일정이 없어요' : '연결하면 다가오는 일정이 여기에 보여요'}</p>
        ) : (
          <div className="agenda">
            {s.agenda.slice(0, 8).map((e) => (
              <div key={e.id + e.start} className="agenda-row">
                <span className="muted">{e.allDay ? '종일' : fmtTime(e.start)}</span>
                <span>{e.title}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3>설정</h3>
        <Space wrap>
          <Button icon={<EyeOutlined />} onClick={() => run('pet')}>바탕화면 펫 보이기/숨기기</Button>
          <Popconfirm title="모든 진행(펫, 도감, 전리품, 토벌 기록)을 초기화할까요?" description="되돌릴 수 없어요." okText="초기화" cancelText="취소" onConfirm={() => run('reset', '초기화했어요')}>
            <Button danger icon={<ReloadOutlined />}>초기화</Button>
          </Popconfirm>
        </Space>
      </section>

      <section className="card">
        <h3>테스트 {testOpen && <Button size="small" type="text" onClick={() => { setTestOpen(false); setPw('') }}>🔒 잠그기</Button>}</h3>
        {testOpen ? (
          <Space wrap>
            <Button icon={<ThunderboltOutlined />} onClick={() => run('add 10')}>+10분</Button>
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => run('hatch')}>바로 부화</Button>
            <Button onClick={() => run('grow', '모두 어른이 됐어요')}>모두 어른으로</Button>
            <Button onClick={() => run('questdone')}>토벌 바로 끝내기</Button>
            <Space.Compact>
              <InputNumber min={1} value={goal} onChange={setGoal} suffix="분" />
              <Button onClick={() => goal && run(`goal ${goal}`, `부화 시간을 ${goal}분으로 바꿨어요`)}>부화 시간 적용</Button>
            </Space.Compact>
          </Space>
        ) : (
          <Space.Compact style={{ width: '100%' }}>
            <Input.Password
              placeholder="비밀번호를 입력하면 테스트 버튼이 열려요"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onPressEnter={() => unlock()}
            />
            <Button type="primary" onClick={() => unlock()}>확인</Button>
          </Space.Compact>
        )}
      </section>

      <section className="card">
        <h3>활동 기록</h3>
        <div className="log">
          {logs.length === 0 && <span className="muted">아직 기록이 없어요</span>}
          {logs.map((l, i) => <div key={i}>{l}</div>)}
          <div ref={logEnd} />
        </div>
      </section>

      <div className="footer">
        <Button danger type="text" icon={<PoweroffOutlined />} onClick={() => run('quit')}>앱 종료</Button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <ConfigProvider theme={{ token: { colorPrimary: '#ff8fab', borderRadius: 8, controlHeight: 36 } }}>
    <AntApp>
      <Panel />
    </AntApp>
  </ConfigProvider>
)
