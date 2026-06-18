import { PassDirectionArrow } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', gap: 48, alignItems: 'center', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

export const Directions = () => (
  <Surface>
    <PassDirectionArrow direction="left" />
    <PassDirectionArrow direction="right" />
  </Surface>
);
