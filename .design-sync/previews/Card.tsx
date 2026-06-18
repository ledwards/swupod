import { Card } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div
    style={{
      background: '#0a0a0a',
      borderRadius: 12,
      padding: '28px 24px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 20,
      alignItems: 'flex-start',
      fontFamily: "'Barlow', system-ui, sans-serif",
    }}
  >
    {children}
  </div>
);

// Real Star Wars: Unlimited card art from the official CDN (as stored in cards.json).
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

export const CardArt = () => (
  <Surface>
    <Card card={beckett} style={{ width: 200 }} />
    <Card card={beckett} selected style={{ width: 200 }} />
  </Surface>
);

// Placeholder mode renders without external art — the "unknown card" UI used
// while a pool is being imported.
const placeholder = {
  id: 'placeholder-rare-leader',
  isPlaceholder: true,
  placeholderBucketLabel: 'Rare Leader',
  type: 'Leader',
  aspects: ['Command', 'Aggression'],
  rarity: 'Rare',
};

export const Placeholder = () => (
  <Surface>
    <Card card={placeholder} aspectsAsIcons style={{ width: 200 }} />
  </Surface>
);
