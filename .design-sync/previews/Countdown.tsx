import { Countdown } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start', color: '#fff', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

// Counts down to a target moment a few minutes out.
const target = new Date(Date.now() + 3 * 60 * 1000 + 25 * 1000);

export const Running = () => (
  <Surface>
    <Countdown targetDate={target} />
  </Surface>
);

export const PastZero = () => (
  <Surface>
    <Countdown targetDate={new Date(Date.now() - 42 * 1000)} livePastZero />
  </Surface>
);
