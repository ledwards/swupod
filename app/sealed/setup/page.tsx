import EntryPage from '@/src/components/EntryFlow/EntryPage'
import EntrySetup from '@/src/components/EntryFlow/EntrySetup'
export default function Page(){return <EntryPage page="sealed" fallback="/sealed"><EntrySetup format="sealed"/></EntryPage>}
