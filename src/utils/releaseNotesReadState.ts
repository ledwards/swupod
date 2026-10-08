/** A dated bullet is one update; older historical edits do not create notifications. */
export type ReleaseReadState = { day: string; seen: string[] }
export async function releaseItems(markdown: string) {
  let day = ''
  const items: {day:string; text:string}[] = []
  for (const line of markdown.split('\n')) {
    const heading = /^## (\d{2})\.(\d{2})\.(\d{4})/.exec(line)
    if (heading) day = `${heading[3]}${heading[1]}${heading[2]}`
    else if (day && /^-\s+/.test(line)) items.push({day, text:line.trim()})
  }
  return Promise.all(items.map(async item => ({day:item.day, id:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(item.text))),b=>b.toString(16).padStart(2,'0')).join('').slice(0,16)})))
}
export function readState(value: string | undefined): ReleaseReadState | null {
  try {
    const state=JSON.parse(decodeURIComponent(value ?? ''))
    return /^\d{8}$/.test(state.day) && Array.isArray(state.seen) && state.seen.every((id:unknown)=>typeof id==='string' && /^[a-f0-9]{16}$/.test(id)) ? state : null
  } catch { return null }
}
export function latestReadState(items: {day:string; id:string}[]): ReleaseReadState {
  const day=items.reduce((latest,item)=>item.day>latest?item.day:latest,'00000000')
  return {day,seen:items.filter(item=>item.day===day).map(item=>item.id)}
}
export function unreadCount(items:{day:string; id:string}[], state:ReleaseReadState) {
  return items.filter(item=>item.day>state.day || (item.day===state.day && !state.seen.includes(item.id))).length
}
