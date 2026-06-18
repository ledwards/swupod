import { CountdownTimer } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', color: '#fff', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

const now = new Date().toISOString();
const almostUp = new Date(Date.now() - 108 * 1000).toISOString();

export const Active = () => (
  <Surface>
    <CountdownTimer totalSeconds={120} startedAt={now} active label="Pick timer" />
  </Surface>
);

export const Warning = () => (
  <Surface>
    <CountdownTimer totalSeconds={120} startedAt={almostUp} active warningThreshold={15} label="Hurry!" />
  </Surface>
);

export const Compact = () => (
  <Surface>
    <CountdownTimer totalSeconds={60} startedAt={now} active compact label="Round" />
  </Surface>
);
