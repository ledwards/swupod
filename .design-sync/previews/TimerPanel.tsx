import { TimerPanel } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 22, alignItems: 'flex-start', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

const noop = () => {};

const draft = {
  status: 'active',
  pickTimeoutSeconds: 120,
  timerSeconds: 30,
  pickStartedAt: new Date().toISOString(),
  timed: true,
  timerEnabled: true,
  paused: false,
  pausedDurationSeconds: 0,
  draftState: { phase: 'pack', packNumber: 1, pickInPack: 3, lastPlayerStartedAt: null },
};

const players = [
  { pickStatus: 'picking' },
  { pickStatus: 'picked' },
  { pickStatus: 'picking' },
  { pickStatus: 'picked' },
];

export const HostView = () => (
  <Surface>
    <TimerPanel draft={draft} players={players} isHost onTogglePause={noop} />
  </Surface>
);

export const PlayerView = () => (
  <Surface>
    <TimerPanel draft={draft} players={players} isHost={false} />
  </Surface>
);
