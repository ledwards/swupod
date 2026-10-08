import { DraftTimer } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 22, alignItems: 'stretch', maxWidth: 360, fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

export const Default = () => (
  <Surface>
    <DraftTimer seconds={45} />
  </Surface>
);

export const LowTime = () => (
  <Surface>
    <DraftTimer seconds={8} />
  </Surface>
);
