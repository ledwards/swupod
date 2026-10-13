import LegacyPage from './LegacyPage'
import PlayHomepage from '@/src/components/PlayHomepage'
import {playWebsiteEnabled} from '@/lib/play/websitePresentation'
export default async function Page(){return await playWebsiteEnabled()?<PlayHomepage path="/me"/>:<LegacyPage/>}
