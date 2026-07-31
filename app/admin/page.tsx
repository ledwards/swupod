// @ts-nocheck
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import AdminGrantPanel from '@/src/components/admin/AdminGrantPanel'
import AdminVoicePackInvitePanel from '@/src/components/admin/AdminVoicePackInvitePanel'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('swupod_session')?.value
  const session = token ? verifyToken(token) : null

  if (!session?.is_admin) {
    console.warn('admin-page-blocked', { hasSession: !!session, sessionId: session?.id })
    notFound()
  }

  return (
    <>
      <AdminGrantPanel />
      <AdminVoicePackInvitePanel />
    </>
  )
}
