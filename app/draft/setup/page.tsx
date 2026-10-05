import EntryPage from '@/src/components/EntryFlow/EntryPage'
import EntrySetup from '@/src/components/EntryFlow/EntrySetup'
export default function Page(){return <EntryPage page="draft" fallback="/draft"><EntrySetup format="draft"/></EntryPage>}
