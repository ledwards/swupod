import { SearchInput } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'stretch', maxWidth: 420, fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

const noop = () => {};

export const Default = () => (
  <Surface>
    <SearchInput value="Darth Vader" onChange={noop} placeholder="Search cards…" clearable />
  </Surface>
);

export const Empty = () => (
  <Surface>
    <SearchInput value="" onChange={noop} placeholder="Search by name, trait, or keyword…" />
  </Surface>
);

export const Sizes = () => (
  <Surface>
    <SearchInput value="Han Solo" onChange={noop} size="sm" clearable />
    <SearchInput value="Han Solo" onChange={noop} size="md" clearable />
  </Surface>
);
