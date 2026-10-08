import { InfoTooltip } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

const Row = ({ children }: { children: any }) => (
  <span style={{ color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 8 }}>{children}</span>
);

// The tooltip body is revealed on hover; the static preview shows the trigger
// icon in realistic context (label + ⓘ).
export const InContext = () => (
  <Surface>
    <Row>Aspect penalty <InfoTooltip text="Off-aspect cards cost 2 more resources to play." /></Row>
    <Row>Hyperspace foil <InfoTooltip text="A rare alternate-art foil variant of a card." /></Row>
    <Row>Pick timer <InfoTooltip text="Time remaining to make your pick before it auto-passes." /></Row>
  </Surface>
);
