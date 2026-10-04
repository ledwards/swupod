/** Keep only one small pack batch in memory while consuming the entire history. */
export async function* streamPickPods<T>(ids: string[], read: (batch: string[]) => Promise<T[]>): AsyncGenerator<T> {
  for (let offset=0; offset<ids.length; offset+=5) {
    const pods=await read(ids.slice(offset,offset+5))
    for (const pod of pods) yield pod
  }
}
