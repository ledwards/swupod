import PluginCTA from '@/src/components/PluginCTA'

// TEMPORARY design-preview scaffold for PluginCTA. Navigate with
// ?plugincta=install (install variants) or ?plugincta=soon (neutral state).
// Delete after design iteration — not a real route.
const label: React.CSSProperties = {
  color: '#9aa7b4',
  font: "600 12px 'Barlow', sans-serif",
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  margin: 0,
}

export default function DevPluginCTAPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0b0f17',
        padding: '56px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 48,
        maxWidth: 760,
        margin: '0 auto',
      }}
    >
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={label}>autodetect</p>
        <PluginCTA variant="autodetect" />
      </section>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={label}>compact</p>
        <PluginCTA variant="compact" />
      </section>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={label}>card</p>
        <PluginCTA variant="card" />
      </section>
    </main>
  )
}
