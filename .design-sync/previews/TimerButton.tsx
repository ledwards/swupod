import { TimerButton } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', gap: 18, alignItems: 'center', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

const noop = () => {};

export const States = () => (
  <Surface>
    <TimerButton isPaused={false} onClick={noop} />
    <TimerButton isPaused={true} onClick={noop} />
    <TimerButton isPaused={false} onClick={noop} disabled />
  </Surface>
);
