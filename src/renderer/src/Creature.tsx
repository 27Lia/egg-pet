import { SPECIES_KO, SPECIES_LOOKS, type LookKey } from '../../shared/types'

// assets/pets/<종 한글이름>_<상황>.png  →  IMAGES[종id][상황]
const files = import.meta.glob('./assets/pets/*.png', { eager: true, import: 'default' }) as Record<string, string>
const IMAGES: Record<string, Record<string, string>> = {}
for (const [path, url] of Object.entries(files)) {
  // macOS 는 한글 파일 이름을 분해형(NFD)으로 저장하므로 조합형(NFC)으로 맞춰서 비교
  const [ko, look] = path.split('/').pop()!.normalize('NFC').replace('.png', '').split('_')
  const id = Object.keys(SPECIES_KO).find((k) => SPECIES_KO[k] === ko)
  if (id) (IMAGES[id] ??= {})[look] = url
}

/** 같은 종의 그림만 사용. 해당 상황 그림이 없으면 그 종의 기본 그림 */
export function lookSrc(species: string, key: LookKey = 'base', seed = 0): string {
  const table = SPECIES_LOOKS[species] ?? {}
  const imgs = IMAGES[species] ?? {}
  const names = (table[key] ?? table.base ?? '기본').split('|')
  return imgs[names[seed % names.length]] ?? imgs['기본'] ?? Object.values(imgs)[0]
}

/** 이 종이 해당 상황 전용 그림을 가지고 있는지 */
export const hasLook = (species: string, key: LookKey) => !!SPECIES_LOOKS[species]?.[key]

export function Creature({ species, look = 'base', seed = 0, size = 72 }: { species: string; look?: LookKey; seed?: number; size?: number }) {
  return <img src={lookSrc(species, look, seed)} width={size} height={size} className="creature" draggable={false} alt={SPECIES_KO[species]} />
}

export function Egg({ progress, size = 90 }: { progress: number; size?: number }) {
  const cracks = [0.25, 0.5, 0.75].filter((t) => progress >= t).length
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" className="egg">
      <path d="M50 4 C82 4 94 58 94 76 C94 100 74 116 50 116 C26 116 6 100 6 76 C6 58 18 4 50 4Z" fill="#fff8e7" stroke="#444" strokeWidth="2.5" />
      <circle cx="34" cy="48" r="5" fill="#ffd9a0" />
      <circle cx="64" cy="70" r="6" fill="#ffd9a0" />
      <circle cx="42" cy="90" r="4" fill="#ffd9a0" />
      {cracks >= 1 && <path d="M50 8 L44 24 L54 34" stroke="#444" strokeWidth="2.5" fill="none" strokeLinejoin="round" />}
      {cracks >= 2 && <path d="M54 34 L46 50 L58 58 L50 72" stroke="#444" strokeWidth="2.5" fill="none" strokeLinejoin="round" />}
      {cracks >= 3 && <path d="M50 72 L38 82 M50 72 L66 80 M46 50 L28 56" stroke="#444" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
    </svg>
  )
}
