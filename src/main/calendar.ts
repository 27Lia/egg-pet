import ICAL from 'ical.js'
import type { AgendaItem } from '../shared/types'

/** 구글 캘린더 비공개 iCal 주소에서 앞으로 hours 시간 안의 일정을 가져옴 */
export async function fetchAgenda(url: string, hours = 36): Promise<AgendaItem[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`캘린더를 불러오지 못했어요 (HTTP ${res.status})`)
  const comp = new ICAL.Component(ICAL.parse(await res.text()))
  for (const tz of comp.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz as never)

  const now = Date.now()
  const until = now + hours * 3600_000
  const out: AgendaItem[] = []

  for (const v of comp.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v)
    const title = ev.summary || '(제목 없음)'
    const add = (s: ICAL.Time, e: ICAL.Time, key: string) => {
      const start = s.toJSDate().getTime()
      const end = e.toJSDate().getTime()
      if (end >= now && start <= until) out.push({ id: `${ev.uid}-${key}`, start, end, title, allDay: s.isDate })
    }
    if (ev.isRecurring()) {
      const it = ev.iterator(ICAL.Time.fromJSDate(new Date(now - 86400_000)))
      for (let n = 0; n < 500; n++) {
        const next = it.next()
        if (!next) break
        const d = ev.getOccurrenceDetails(next)
        if (d.startDate.toJSDate().getTime() > until) break
        add(d.startDate, d.endDate, String(d.startDate.toUnixTime()))
      }
    } else {
      add(ev.startDate, ev.endDate, 'one')
    }
  }
  return out.sort((a, b) => a.start - b.start)
}
