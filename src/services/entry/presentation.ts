/** Entry artwork follows the featured set; unassigned sets retain the neutral table. */
const SET_TABLE_IMAGES: Record<string, string> = {
  HMW: '/table-environments/kashyyyk.webp',
}
export function entryTableImage(setCode: string): string {
  return SET_TABLE_IMAGES[setCode.replace('-CB', '')] ?? '/entry-flow/table-dejarik.png'
}
