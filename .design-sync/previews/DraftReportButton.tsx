import { DraftReportButton, Button } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

// DraftReportButton is a SINGLE button (gold-glow secondary). Shown here in a
// deck-header row beside its real neighbors so it reads at the same size.
export const InContext = () => (
  <Surface>
    <Button variant="primary">Ready to Play</Button>
    <Button variant="secondary">Export Deck</Button>
    <DraftReportButton draftShareId="r4nd0m-share-id" />
  </Surface>
);
