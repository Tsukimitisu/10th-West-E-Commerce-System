import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, Loader2, ScanLine, X } from 'lucide-react';

const PERMISSION_MESSAGE = 'Camera permission is required to scan. You may enter the part number manually.';

const stopVideoStream = (video) => {
  const stream = video?.srcObject;
  if (stream && typeof stream.getTracks === 'function') {
    stream.getTracks().forEach((track) => track.stop());
  }
  if (video) video.srcObject = null;
};

const cameraErrorMessage = (error) => {
  if (['NotAllowedError', 'SecurityError'].includes(error?.name)) return PERMISSION_MESSAGE;
  if (error?.name === 'NotFoundError') return 'No camera was found. You may enter the part number manually.';
  return 'Camera scanning could not start. Use HTTPS on mobile, or enter the part number manually.';
};

const CameraScannerModal = ({ open, onClose, onScan, title = 'Scan Barcode or QR Code' }) => {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const dialogRef = useRef(null);
  const manualInputRef = useRef(null);
  const scannedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onScanRef = useRef(onScan);
  const [manualValue, setManualValue] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  onCloseRef.current = onClose;
  onScanRef.current = onScan;

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop?.();
    controlsRef.current = null;
    stopVideoStream(videoRef.current);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    scannedRef.current = false;
    setManualValue('');
    setError('');
    setStatus('loading');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const start = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setStatus('manual');
          setError(cameraErrorMessage({ name: 'SecurityError' }));
          manualInputRef.current?.focus();
        }
        return;
      }

      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 250,
          delayBetweenScanSuccess: 1000,
        });
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          videoRef.current,
          (result) => {
            const value = String(result?.getText?.() || '').trim();
            if (!value || scannedRef.current) return;
            scannedRef.current = true;
            stopScanner();
            onScanRef.current(value);
            onCloseRef.current();
          }
        );
        if (cancelled) {
          controls.stop();
          stopVideoStream(videoRef.current);
          return;
        }
        controlsRef.current = controls;
        setStatus('scanning');
      } catch (cameraError) {
        stopScanner();
        if (!cancelled) {
          setStatus('manual');
          setError(cameraErrorMessage(cameraError));
          manualInputRef.current?.focus();
        }
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled])')];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    void start();
    return () => {
      cancelled = true;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      stopScanner();
    };
  }, [open, stopScanner]);

  if (!open) return null;

  const submitManual = () => {
    const value = manualValue.trim();
    if (!value) return;
    stopScanner();
    onScan(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="camera-scanner-title" className="my-auto w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2"><ScanLine className="text-orange-600" size={20} /><h2 id="camera-scanner-title" className="font-display font-bold text-slate-950">{title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close camera scanner" className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={19} /></button>
        </header>

        <div className="space-y-4 p-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" aria-label="Camera preview" />
            {status === 'loading' && <div className="absolute inset-0 grid place-items-center bg-slate-950/80 text-sm text-white"><div className="text-center"><Loader2 className="mx-auto mb-2 animate-spin" /><p>Starting camera...</p></div></div>}
            {status === 'manual' && <div className="absolute inset-0 grid place-items-center bg-slate-950/90 p-6 text-center text-sm text-slate-200"><Camera className="mx-auto mb-2" /><p>Camera preview unavailable</p></div>}
            {status === 'scanning' && <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 animate-pulse bg-red-500 shadow-[0_0_12px_#ef4444]" />}
          </div>

          {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
          <p className="text-xs leading-5 text-slate-600">Point the rear camera at a barcode, QR code, or part-number label. The camera stops automatically after a successful scan.</p>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label htmlFor="camera-manual-value" className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><Keyboard size={15} /> Manual fallback</label>
            <div className="flex gap-2">
              <input
                ref={manualInputRef}
                id="camera-manual-value"
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitManual(); } }}
                placeholder="Enter part number or barcode"
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
              />
              <button type="button" onClick={submitManual} disabled={!manualValue.trim()} className="rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-40">Use value</button>
            </div>
          </div>

          <button type="button" onClick={onClose} className="h-11 w-full rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        </div>
      </section>
    </div>
  );
};

export { PERMISSION_MESSAGE, cameraErrorMessage, stopVideoStream };
export default CameraScannerModal;
