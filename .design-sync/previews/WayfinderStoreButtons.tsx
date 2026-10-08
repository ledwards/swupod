import { WayfinderStoreButtons } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', alignItems: 'center', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

// Install buttons for the Wayfinder companion browser extension (Chrome /
// Safari / Firefox), shown on the play pages.
export const Inline = () => (
  <Surface>
    <WayfinderStoreButtons orientation="inline" />
  </Surface>
);
