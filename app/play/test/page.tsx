import EntryGate from '@/src/components/EntryFlow/EntryGate'
import { Suspense } from 'react'
import LocalTest from './LocalTest'
import '../native/native-play.css'
export default function Page() { return <Suspense><EntryGate fallback="/play" page="play"><LocalTest /></EntryGate></Suspense> }
