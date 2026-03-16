import React, { useEffect, useRef, useState } from 'react';

// Lightweight Leaflet-based map picker loaded via CDN (no extra dependency in package.json).
// Hidden until Province + City + Barangay are all selected.
// Phase 1 — centres on barangay. Phase 2 — refines to street-level.
// Accepts optional `lat` / `lng` props to jump to a position immediately (e.g. from autocomplete).
// Emits { lat, lng } through onChange. Pin is always draggable.
const MapPinPicker = ({ street, barangay, city, state, lat: externalLat, lng: externalLng, onChange, height = 280, disabled = false }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [leafletReady, setLeafletReady] = useState(typeof window !== 'undefined' && !!window.L);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');
  const [lastGeoKey, setLastGeoKey] = useState('');
  const [lastExternalKey, setLastExternalKey] = useState('');

  /* ── Load Leaflet from CDN ────────────────────────────── */
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
      if (!cancelled) setError('Map failed to load.');
    });
    return () => { cancelled = true; };
  }, []);

  /* ── Initialise map once Leaflet is ready ─────────────── */
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapRef.current) return;
    const L = window.L;
    const fallbackCenter = [12.8797, 121.7740]; // Philippines centroid
    const map = L.map(mapContainerRef.current).setView(fallbackCenter, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(fallbackCenter, { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onChange?.({ lat: pos.lat, lng: pos.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      destroyMap();
    };
  }, [leafletReady, onChange]);

  useEffect(() => {
    if (!barangay || !city || !state) {
      destroyMap();
    }
  }, [barangay, city, state]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [leafletReady, barangay, city, state]);

  /* ── Fly to external coords (autocomplete selection) ──── */
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
    // Sync geocode key so the next effect doesn't re‑fire for the same address
    setLastGeoKey(`${street || ''}|${barangay || ''}|${city || ''}|${state || ''}`);
  }, [leafletReady, externalLat, externalLng, onChange, lastExternalKey, street, barangay, city, state]);

  /* ── Geocode when address parts change ───────────────── */
  // Fires in two scenarios:
  //   1. Only barangay + city + state → centres on barangay (zoom 15)
  //   2. street + context → pins the exact location (zoom 17)
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

    // Build the query – more parts → more accurate
    const hasStreet = street && street.trim().length >= 2;
    const query = hasStreet
      ? `${street}${barangay ? `, ${barangay}` : ''}, ${city}, ${state}, Philippines`
      : `${barangay}, ${city}, ${state}, Philippines`;
    const zoom = hasStreet ? 17 : 15;

    setGeocoding(true);
    setError('');
    const controller = new AbortController();

    fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(query)}`, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': '10th-west-moto-map-pin',
      },
      signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok) throw new Error('Failed to geocode');
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('No results');
      const { lat, lon } = data[0];
      const next = [Number(lat), Number(lon)];
      map.setView(next, zoom);
      marker.setLatLng(next);
      onChange?.({ lat: Number(lat), lng: Number(lon) });
    }).catch(() => {
      setError('Could not locate that address. You can drag the pin manually.');
    }).finally(() => setGeocoding(false));

    return () => controller.abort();
  }, [leafletReady, street, barangay, city, state, onChange, lastGeoKey]);

  /* ── Render guard: hidden until Province + City + Barangay selected ── */
  if (!barangay || !city || !state) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Pin exact location</p>
        {geocoding && <span className="text-xs text-gray-500">Locating…</span>}
      </div>
      <div
        ref={mapContainerRef}
        className="w-full rounded-lg border border-gray-200 overflow-hidden"
        style={{ height: `${height}px`, pointerEvents: disabled ? 'none' : 'auto', filter: disabled ? 'grayscale(0.6)' : 'none' }}
      />
      {error && <p className="text-xs text-orange-500">{error}</p>}
      <p className="text-xs text-gray-500">Drag the pin if the automatic placement is off. Lat/Lng are saved with the address/order.</p>
    </div>
  );
};

export default MapPinPicker;
