'use client'

import type { ComponentProps } from 'react'
import PodsFormingColumn from './PodsFormingColumn'

/** Native play entry beside the existing draft/sealed pod discovery. */
export default function NativePlayEntry({pods,poolShareId}:{pods:ComponentProps<typeof PodsFormingColumn>['pods'];poolShareId?:string|null}) {
 const href=poolShareId?`/play?pool=${encodeURIComponent(poolShareId)}`:'/play'
 return <div className="lobby-board"><section className="lobby-column" aria-label="Play a saved deck"><h3 className="lobby-column-title">Play</h3><div className="lobby-column-body"><div className="lobby-state"><p>Choose a saved deck. Find an opponent or invite a friend.</p><a className="btn btn--primary btn--md" href={href}>Play a deck</a></div></div></section><PodsFormingColumn pods={pods}/></div>
}
