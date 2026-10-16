// @ts-nocheck
import '../../src/styles/backgrounds.css'
import '../../src/components/Button.css'
import MaintenanceAlpha from '../../src/components/Maintenance/MaintenanceAlpha'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'
import { alphaOrLegacy } from '../../lib/alphaFallback'

/**
 * proxy.ts sends the whole site here in maintenance mode, often with no
 * session and no database. The alpha check therefore can never throw or hang
 * this page: anything but a timely "yes" serves the legacy page.
 */
export default async function MaintenancePage() {
  if (await alphaOrLegacy(viewerHasAlphaAccess)) return <MaintenanceAlpha />
  return <MaintenanceLegacy />
}

function MaintenanceLegacy() {
  return (
    <div className="page-background" style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'Barlow, system-ui, sans-serif',
      padding: '20px',
      textAlign: 'center',
    }}>
      <div style={{
        position: 'relative',
        marginBottom: '2rem',
      }}>
        <img
          src="/failpurrgil.png"
          alt="Maintenance"
          style={{
            maxWidth: '600px',
            width: '100%',
            display: 'block',
          }}
        />
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `
            linear-gradient(to bottom, rgb(9, 9, 9) 0%, transparent 15%),
            linear-gradient(to top, rgb(9, 9, 9) 0%, transparent 15%),
            linear-gradient(to right, rgb(9, 9, 9) 0%, transparent 15%),
            linear-gradient(to left, rgb(9, 9, 9) 0%, transparent 15%)
          `,
          pointerEvents: 'none',
        }} />
      </div>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
        Scheduled Maintenance
      </h1>
      <p style={{ color: 'rgba(255, 255, 255, 0.7)', maxWidth: '400px', lineHeight: 1.6 }}>
        We&apos;re upgrading our servers for better performance.
        Be back in a few minutes!
      </p>
    </div>
  )
}

export const metadata = {
  title: 'Maintenance - Protect the Pod',
}
