import { EditableTitle } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div style={{ background: '#0a0a0a', borderRadius: 12, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start', fontFamily: "'Barlow', system-ui, sans-serif" }}>
    {children}
  </div>
);

const noop = () => {};

export const WithTitle = () => (
  <Surface>
    <EditableTitle value="My Sealed Deck" isEditable onSave={noop} />
  </Surface>
);

export const Placeholder = () => (
  <Surface>
    <EditableTitle value={null} placeholder="Untitled deck" isEditable onSave={noop} />
  </Surface>
);

export const ReadOnly = () => (
  <Surface>
    <EditableTitle value="Cunning / Vigilance Aggro" isEditable={false} onSave={noop} />
  </Surface>
);
