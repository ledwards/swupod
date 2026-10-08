import { ConfirmModal } from 'swupod';

const noop = () => {};

export const Danger = () => (
  <ConfirmModal
    isOpen
    title="Delete pool?"
    variant="danger"
    confirmLabel="Delete pool"
    cancelLabel="Keep"
    onConfirm={noop}
    onCancel={noop}
  >
    <p style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, margin: 0 }}>
      This permanently deletes your sealed pool and every card you opened. This
      can&rsquo;t be undone.
    </p>
  </ConfirmModal>
);

export const Default = () => (
  <ConfirmModal
    isOpen
    title="Leave draft?"
    confirmLabel="Leave"
    cancelLabel="Stay"
    onConfirm={noop}
    onCancel={noop}
  >
    <p style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, margin: 0 }}>
      You can rejoin from the lobby as long as the draft is still running.
    </p>
  </ConfirmModal>
);
