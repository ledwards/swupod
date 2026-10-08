import { MatchCard } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

const noop = () => {};

const base = {
  player1: { id: 'p1', username: 'HanShotFirst' },
  player2: { id: 'p2', username: 'VaderMains' },
  isBye: false,
  podOwnerOverride: false,
  wayfinderMatchId: null,
};

const active = {
  ...base,
  id: 'r1m1',
  game1Result: 'player1',
  game2Result: 'player2',
  game3Result: null,
  player1Submitted: true,
  player2Submitted: false,
  finalConfirmed: false,
  matchWinner: null,
};

const completed = {
  ...base,
  id: 'r1m2',
  game1Result: 'player1',
  game2Result: 'player2',
  game3Result: 'player1',
  player1Submitted: true,
  player2Submitted: true,
  finalConfirmed: true,
  matchWinner: 'player1',
};

export const AwaitingConfirmation = () => (
  <Surface>
    <MatchCard match={active} currentUserId="p1" isHost={false} onReport={noop} onOverride={noop} onBoot={noop} />
  </Surface>
);

export const Completed = () => (
  <Surface>
    <MatchCard match={completed} currentUserId="p1" isHost={false} onReport={noop} onOverride={noop} onBoot={noop} />
  </Surface>
);
