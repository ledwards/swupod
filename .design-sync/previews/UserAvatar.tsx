import { UserAvatar } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

export const Fallback = () => (
  <Surface>
    <UserAvatar size={48} src={null} fallback="HS" alt="Han Solo" />
    <UserAvatar size={48} src={null} fallback="LV" alt="Darth Vader" />
    <UserAvatar size={48} src={null} fallback="L" alt="Leia" />
  </Surface>
);

export const Patron = () => (
  <Surface>
    <UserAvatar size={56} src={null} fallback="PP" isPatron alt="Friend of the Pod" />
  </Surface>
);

export const Sizes = () => (
  <Surface>
    <UserAvatar size={28} src={null} fallback="A" />
    <UserAvatar size={40} src={null} fallback="B" />
    <UserAvatar size={56} src={null} fallback="C" />
    <UserAvatar size={72} src={null} fallback="D" />
  </Surface>
);
