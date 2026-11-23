// Cancellation saves work; the sequence check also protects against transports
// that resolve after aborting (or a response already waiting in the event loop).
export function createLatestRequest() {
  let sequence = 0;
  let controller;
  return {
    cancel() {
      sequence += 1;
      controller?.abort();
    },
    async run(request, { onSuccess, onError, onSettled } = {}) {
      const requestId = ++sequence;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const current = () => requestId === sequence && !signal.aborted;
      try {
        const result = await request(signal);
        if (current()) onSuccess?.(result);
      } catch (error) {
        if (current() && error.name !== 'AbortError') onError?.(error);
      } finally {
        if (current()) onSettled?.();
      }
    },
  };
}
