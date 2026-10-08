import { Modal, Button } from 'swupod';

const noop = () => {};

export const Open = () => (
  <Modal isOpen onClose={noop} title="Export to Karabast" showCloseButton>
    <p style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, margin: '4px 0 0' }}>
      Your 30-card deck is ready. Copy the deck code below and import it into
      Karabast to play this list with friends.
    </p>
    <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
      <Button variant="primary">Copy deck code</Button>
      <Button variant="secondary" onClick={noop}>Close</Button>
    </div>
  </Modal>
);
