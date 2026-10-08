import { CollapsibleSection } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div
    style={{
      background: '#0a0a0a',
      borderRadius: 12,
      padding: '28px 24px',
      maxWidth: 560,
      fontFamily: "'Barlow', system-ui, sans-serif",
    }}
  >
    {children}
  </div>
);

const prose = { color: 'rgba(255,255,255,0.72)', lineHeight: 1.55, margin: '8px 0' };

export const Expanded = () => (
  <Surface>
    <CollapsibleSection title="Pool Cards" badge={42} defaultExpanded>
      <p style={prose}>
        Your sealed pool holds every card you opened across six booster packs.
        Build a 30-card deck with a leader and base, then export to Karabast to
        play with friends.
      </p>
    </CollapsibleSection>
  </Surface>
);

export const Variants = () => (
  <Surface>
    <CollapsibleSection title="Leaders" badge={6} variant="block" defaultExpanded>
      <p style={prose}>Six leaders are available to pilot your deck.</p>
    </CollapsibleSection>
    <CollapsibleSection title="Sideboard" defaultExpanded={false} variant="minimal">
      <p style={prose}>Collapsed until expanded — click the header to reveal.</p>
    </CollapsibleSection>
  </Surface>
);
