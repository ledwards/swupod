import { Button } from 'swupod';

const Surface = ({ children }: { children: any }) => (
  <div
    style={{
      background: '#0a0a0a',
      borderRadius: 12,
      padding: '28px 24px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 14,
      alignItems: 'center',
      fontFamily: "'Barlow', system-ui, sans-serif",
    }}
  >
    {children}
  </div>
);

export const Variants = () => (
  <Surface>
    <Button variant="primary">Continue</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="danger">Delete pool</Button>
    <Button variant="interactive">Filter cards</Button>
    <Button variant="discord">Join Discord</Button>
  </Surface>
);

export const Sizes = () => (
  <Surface>
    <Button variant="primary" size="xs">Extra small</Button>
    <Button variant="primary" size="sm">Small</Button>
    <Button variant="primary" size="md">Medium</Button>
    <Button variant="primary" size="lg">Large</Button>
  </Surface>
);

export const States = () => (
  <Surface>
    <Button variant="primary">Default</Button>
    <Button variant="primary" disabled>Disabled</Button>
    <Button variant="toggle" active>Active toggle</Button>
    <Button variant="warning">Action required</Button>
    <Button variant="icon" size="sm" aria-label="Close">×</Button>
  </Surface>
);
