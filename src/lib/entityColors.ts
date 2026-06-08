// Company pill colours. Background hexes mirror public.companies.brand_colour
// (the source of truth — keep in sync if a brand colour changes there). Text
// colour is derived from background luminance for readable contrast.

const BRAND_COLOURS: Record<string, string> = {
  AW:  '#008D40',
  BA:  '#566778',
  BMP: '#B9484E',
  BPM: '#566778',
  CA:  '#EE4300',
  CR:  '#BBC2F4',
  FGA: '#98B250',
  GA:  '#98B250',
  HH:  '#7A91A5',
  MA:  '#7A91A5',
  MO:  '#000000',
  MTQ: '#9F9183',
  NC:  '#EAB955',
  PM:  '#FC0083',
  TH:  '#B9484E',
}

function textOn(bg: string): string {
  const h = bg.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance < 150 ? '#fff' : '#1f2d3d'
}

export const ENTITY_COLORS: Record<string, { bg: string; text: string }> =
  Object.fromEntries(
    Object.entries(BRAND_COLOURS).map(([code, bg]) => [code, { bg, text: textOn(bg) }]),
  )

export const FALLBACK_ENTITY_COLOR = { bg: 'var(--hh-haze)', text: '#fff' }
