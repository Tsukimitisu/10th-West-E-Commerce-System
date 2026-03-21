import React, { useEffect, useRef, useState } from 'react';

// Lightweight Leaflet-based map picker loaded via CDN (no extra dependency in package.json).
// Hidden until Province + City + Barangay are all selected.
// Phase 1 â€” centres on barangay. Phase 2 â€” refines to street-level.
// Accepts optional `lat` / `lng` props to jump to a position immediately (e.g. from autocomplete).
// Emits { lat, lng } through onChange. Pin is fixed to detected location.
const MapPinPicker = ({ street, barangay, city, state, lat: externalLat, lng: externalLng, onChange, height = 280, disabled = false }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [leafletReady, setLeafletReady] = useState(typeof window !== 'undefined' && !!window.L);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState('');
  const [lastGeoKey, setLastGeoKey] = useState('');
  const [lastExternalKey, setLastExternalKey] = useState('');

  /* â”€â”€ Load Leaflet from CDN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const loadLeaflet = () => new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'));
    if (window.L) return resolve(window.L);

    const loadCss = () => new Promise((cssResolve) => {
      const existingCss = document.getElementById('leaflet-css');
      if (existingCss) return cssResolve();
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.onload = () => cssResolve();
      link.onerror = () => cssResolve();
      document.head.appendChild(link);
    });

    const loadScript = () => new Promise((scriptResolve, scriptReject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => scriptResolve(window.L);
      script.onerror = scriptReject;
      document.body.appendChild(script);
    });

    Promise.all([loadCss(), loadScript()]).then(([, L]) => resolve(L)).catch(reject);
  });

  const destroyMap = () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(() => {
      if (!cancelled) setLeafletReady(true);
    }).catch(() => {
      if (!cancelled) {
        setError('Map failed to load.');
        setErrorType('map');
      }
    });
    return () => { cancelled = true; };
  }, []);

  /* â”€â”€ Initialise map once Leaflet is ready â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  useEffect(() => {
    if (!leafletReady || !window.L || !mapContainerRef.current || mapRef.current) return;
    if (!barangay || !city || !state) return;
    const L = window.L;
    const fallbackCenter = [12.8797, 121.7740]; // Philippines centroid
    const map = L.map(mapContainerRef.current).setView(fallbackCenter, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(fallbackCenter, { draggable: false }).addTo(map);

    mapRef.current = map;
    markerRef.current = marker;

    }, [leafletReady, barangay, city, state, onChange]);

  useEffect(() => { if (!barangay || !city || !state) { destroyMap(); } }, [barangay, city, state]);

  useEffect(() => { return () => { destroyMap(); }; }, []);


  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [leafletReady, barangay, city, state]);

  /* â”€â”€ Fly to external coords (autocomplete selection) â”€â”€â”€â”€ */
  useEffect(() => {
    if (!leafletReady || !externalLat || !externalLng) return;
    const key = `${externalLat}|${externalLng}`;
    if (key === lastExternalKey) return;
    setLastExternalKey(key);

    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const pos = [Number(externalLat), Number(externalLng)];
    map.setView(pos, 17);
    marker.setLatLng(pos);
    onChange?.({ lat: pos[0], lng: pos[1] });
    setError('');
    setErrorType('');
    // Sync geocode key so the next effect doesn't reâ€‘fire for the same address
    setLastGeoKey(`${street || ''}|${barangay || ''}|${city || ''}|${state || ''}`);
  }, [leafletReady, externalLat, externalLng, onChange, lastExternalKey, street, barangay, city, state]);

  /* â”€â”€ Geocode when address parts change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  // Fires in two scenarios:
  //   1. Only barangay + city + state â†’ centres on barangay (zoom 15)
  //   2. street + context â†’ pins the exact location (zoom 17)
  useEffect(() => {
    if (!leafletReady || !city || !state) return;
    // At minimum we need barangay OR street
    if (!barangay && !street) return;

    const geoKey = `${street || ''}|${barangay || ''}|${city}|${state}`;
    if (geoKey === lastGeoKey) return;
    setLastGeoKey(geoKey);

    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    // Build the query â€“ more parts â†’ more accurate
    const hasStreet = street && street.trim().length >= 2;
    const query = hasStreet
      ? `${street}${barangay ? `, ${barangay}` : ''}, ${city}, ${state}, Philippines`
      : `${barangay}, ${city}, ${state}, Philippines`;
    const queries = [];
    if (hasStreet) {
      queries.push(`${street}, ${barangay ? barangay + ', ' : ''}${city}, ${state}, Philippines`);
      queries.push(`${street}, ${city}, ${state}, Philippines`);
    }
    if (barangay) {
      queries.push(`${barangay}, ${city}, ${state}, Philippines`);
    }
    queries.push(`${city}, ${state}, Philippines`);

    setGeocoding(true);
    setError('');
    setErrorType('');
    const controller = new AbortController();

    const tryGeocode = async (queryList) => {
      for (const q of queryList) {
        if (controller.signal.aborted) return true;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`, {
            headers: {
              'Accept-Language': 'en',
              'User-Agent': '10th-west-moto-map-pin',
            },
            signal: controller.signal,
          });
          if (!res.ok) continue;
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const { lat, lon } = data[0];
            const next = [Number(lat), Number(lon)];
            map.setView(next, hasStreet ? 17 : 15);
            marker.setLatLng(next);
            onChange?.({ lat: Number(lat), lng: Number(lon) });
            return true;
          }
        } catch (e) {
          // ignore
        }
      }
      return false;
    };

    tryGeocode(queries).then((success) => {
      if (!success && !controller.signal.aborted) {
        setError('Could not locate exact location. Pin might not be perfectly precise.');
        setErrorType('geocode');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setGeocoding(false);
    });

    return () => controller.abort();
  }, [leafletReady, street, barangay, city, state, onChange, lastGeoKey]);

  /* â”€â”€ Render guard: hidden until Province + City + Barangay selected â”€â”€ */
  if (!barangay || !city || !state) return null;

  const handleRetry = () => {
    setError('');
    setErrorType('');
    setLastGeoKey('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Pin exact location</p>
        {geocoding && <span className="text-xs text-gray-400">Locatingâ€¦</span>}
      </div>
      <div
        className="w-full rounded-lg border border-gray-700 overflow-hidden relative"
        style={{ height: `${height}px`, minHeight: `${height}px`, minWidth: '100%' }}
      >
        {(!leafletReady || !window.L) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-xs text-gray-400">
            Loading mapâ€¦
          </div>
        )}
        <div
          ref={mapContainerRef}
          className="w-full h-full"
          style={{ pointerEvents: disabled ? 'none' : 'auto', filter: disabled ? 'grayscale(0.6)' : 'none' }}
        />
      </div>
      {error && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-red-500">{error}</p>
          {errorType === 'geocode' && (
            <button type="button" onClick={handleRetry} className="text-xs text-orange-600 hover:text-orange-700 font-medium">
              Retry
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-gray-400">Pin placement updates automatically from the detected address. Lat/Lng are saved with the address/order.</p>
    </div>
  );
};

export default MapPinPicker;


