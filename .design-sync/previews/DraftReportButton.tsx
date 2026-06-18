import { DraftReportButton } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

export const Variants = () => (
  <Surface>
    <DraftReportButton draftShareId="r4nd0m-share-id" variant="default" />
    <DraftReportButton draftShareId="r4nd0m-share-id" variant="pool" />
    <DraftReportButton draftShareId="r4nd0m-share-id" variant="play" />
  </Surface>
);
