import { CostIcon } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

export const Costs = () => (
  <Surface>
    {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => <CostIcon key={c} cost={c} size={40} />)}
  </Surface>
);

export const Sizes = () => (
  <Surface>
    <CostIcon cost={3} size={24} />
    <CostIcon cost={3} size={36} />
    <CostIcon cost={3} size={52} />
  </Surface>
);
