import {redirect} from 'next/navigation'
import PlayHomepage from '@/src/components/PlayHomepage'
import {playWebsiteEnabled} from '@/lib/play/websitePresentation'
export default async function Page(){if(!await playWebsiteEnabled())redirect('/history');return <PlayHomepage path="/decks"/>}
