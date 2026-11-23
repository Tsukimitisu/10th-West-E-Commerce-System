import { useEffect, useRef } from 'react';

// Native Android gallery pickers can return focus/viewport events before or
// after change/cancel. Keep a transaction until the next user interaction, so
// a late viewport restoration cannot displace the row being edited.
export default function useFilePickerReturn(triggerRef, inputRef) {
  const transaction = useRef(null);
  const stop = () => {
    const current = transaction.current;
    if (!current) return;
    current.events.abort();
    current.frames.forEach(cancelAnimationFrame);
    transaction.current = null;
  };
  useEffect(() => () => {
    const current = transaction.current;
    current?.events.abort();
    current?.frames.forEach(cancelAnimationFrame);
  }, []);

  const restore = () => {
    const current = transaction.current;
    if (!current || document.visibilityState === 'hidden') return;
    current.frames.forEach(cancelAnimationFrame);
    current.frames = [];
    const apply = () => {
      const { scroll, top } = current;
      const trigger = triggerRef.current;
      if (transaction.current !== current || !trigger?.isConnected) return;
      trigger.focus({ preventScroll: true });
      if (!scroll?.isConnected) return;
      scroll.scrollTop = Math.max(0, Math.min(top, scroll.scrollHeight - scroll.clientHeight));
      // If the browser chrome/keyboard changed the available height, keep the
      // upload control inside the one scroll area without resetting to the top.
      const area = scroll.getBoundingClientRect(), button = trigger.getBoundingClientRect();
      if (button.bottom > area.bottom) scroll.scrollTop += button.bottom - area.bottom;
      else if (button.top < area.top) scroll.scrollTop -= area.top - button.top;
    };
    current.frames.push(requestAnimationFrame(() => {
      apply();
      current.frames.push(requestAnimationFrame(apply));
    }));
  };

  const open = () => {
    stop();
    const scroll = triggerRef.current?.closest('[data-modal-scroll]');
    const events = new AbortController(), options = { signal: events.signal };
    transaction.current = { scroll, top: scroll?.scrollTop || 0, events, frames: [] };
    // A touch, key or wheel means the operator has resumed control. Never
    // keep snapping back after they deliberately move to another row.
    for (const name of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(name, stop, { ...options, capture: true, passive: true });
    window.addEventListener('focus', restore, options);
    window.addEventListener('resize', restore, options);
    document.addEventListener('visibilitychange', restore, options);
    window.visualViewport?.addEventListener('resize', restore, options);
    // Remain in the user's activation event for Chrome/Brave native pickers.
    inputRef.current?.click();
  };
  return { open, restore };
}
