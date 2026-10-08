import { DraftableCard } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

const beckett = {
  id: 'tobias-beckett-leader',
  name: 'Tobias Beckett',
  imageUrl:
    'https://cdn.starwarsunlimited.com//card_07010002_EN_Tobias_Beckett_Leader_7301fe8ae1.png',
  rarity: 'Rare',
  type: 'Leader',
  aspects: ['Cunning', 'Vigilance'],
  isLeader: true,
};

export const Default = () => (
  <Surface>
    <DraftableCard card={beckett} useStaticPreview />
  </Surface>
);

export const States = () => (
  <Surface>
    <DraftableCard card={beckett} selected useStaticPreview />
    <DraftableCard card={beckett} disabled useStaticPreview />
    <DraftableCard card={beckett} dimmed useStaticPreview />
  </Surface>
);
