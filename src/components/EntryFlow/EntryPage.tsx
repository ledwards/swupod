import {Suspense, type ReactNode} from 'react'
import EntryGate from './EntryGate'
import {EntrySkeleton, type EntryLoadingPage} from './EntrySkeleton'
export default function EntryPage({children,page='ai',fallback='/'}:{children:ReactNode;page?:EntryLoadingPage;fallback?:string}) {
 return <Suspense fallback={<EntrySkeleton page={page}/>}><EntryGate page={page} fallback={fallback}>{children}</EntryGate></Suspense>
}
