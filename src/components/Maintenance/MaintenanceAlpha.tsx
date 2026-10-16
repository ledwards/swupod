/**
 * /maintenance for alpha viewers: one centred panel on the themed shell.
 * Static, no data: this page must render while the rest of the site is down.
 */
import ThemedPage from '@/src/components/ThemedPage/ThemedPage'
import './maintenance-alpha.css'

export default function MaintenanceAlpha() {
  return (
    <ThemedPage title="Scheduled Maintenance" center>
      <section className="tpage-panel mnta-card" aria-label="Maintenance">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mnta-art" src="/failpurrgil.png" alt="A purrgil drifting past" width={1536} height={1024} />
        <p className="mnta-lead">
          We&apos;re upgrading our servers for better performance. Be back in a few minutes!
        </p>
        <span className="tpage-tag tpage-tag--warning">Upgrade in progress</span>
      </section>
    </ThemedPage>
  )
}
