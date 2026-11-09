export default function herdrAskNotify(pi) {
  if (process.env.HERDR_ENV !== '1' || !process.env.HERDR_SOCKET_PATH || !process.env.HERDR_PANE_ID) return;

  let interactive = false;
  const waiting = new Set();

  pi.on('session_start', (_event, ctx) => {
    interactive = ctx.mode === 'tui';
  });

  // Let Herdr's managed integration own state sequencing and native notification delivery.
  pi.events.on('rpiv:ask-user:blocked', data => {
    if (!interactive || typeof data?.active !== 'boolean') return;
    const id = data.toolCallId ?? 'ask_user_question';
    if (typeof id !== 'string' || !id) return;

    if (data.active) {
      if (waiting.has(id)) return;
      waiting.add(id);
    } else if (!waiting.delete(id)) {
      return;
    }

    pi.events.emit('herdr:blocked', {
      active: data.active,
      label: 'Waiting for your answer (ask_user_question)',
    });
  });

  pi.on('session_shutdown', () => {
    interactive = false;
    for (const _id of waiting) pi.events.emit('herdr:blocked', { active: false });
    waiting.clear();
  });
}
