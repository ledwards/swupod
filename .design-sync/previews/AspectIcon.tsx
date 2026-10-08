import { AspectIcon } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

const ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism'];

export const AllAspects = () => (
  <Surface>
    {ASPECTS.map((a) => <AspectIcon key={a} aspect={a} size="lg" />)}
  </Surface>
);

export const Sizes = () => (
  <Surface>
    <AspectIcon aspect="Command" size="xs" />
    <AspectIcon aspect="Command" size="sm" />
    <AspectIcon aspect="Command" size="md" />
    <AspectIcon aspect="Command" size="lg" />
  </Surface>
);

export const WithLabels = () => (
  <Surface>
    {ASPECTS.map((a) => <AspectIcon key={a} aspect={a} size="md" withLabel />)}
  </Surface>
);
