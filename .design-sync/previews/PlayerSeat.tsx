import { PlayerSeat } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

export const Seats = () => (
  <Surface>
    <PlayerSeat player={{ id: 'p1', username: 'HanShotFirst', pickStatus: 'picking' }} seatNumber={1} showStatus />
    <PlayerSeat player={{ id: 'p2', username: 'VaderMains', pickStatus: 'picked' }} seatNumber={2} isCurrentUser showStatus />
    <PlayerSeat player={{ id: 'p3', username: 'PatronPilot', pickStatus: 'picked' }} seatNumber={3} isPatron showStatus />
    <PlayerSeat player={null} seatNumber={4} isEmpty />
  </Surface>
);
