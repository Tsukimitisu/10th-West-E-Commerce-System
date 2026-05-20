import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, ExternalLink, LocateFixed, RefreshCw } from 'lucide-react';

const PHILIPPINES_CENTER = { lat: 12.8797, lng: 121.7740 };

const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const toFiniteCoordinate = (value, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
};

const formatCoordinate = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : '';
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const latLngToWorldPoint = ({ lat, lng }, zoom) => {
  const scale = 256 * (2 ** zoom);
  const sinLat = clamp(Math.sin((lat * Math.PI) / 180), -0.9999, 0.9999);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - (Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI))) * scale,
  };
};

const worldPointToLatLng = ({ x, y }, zoom) => {
  const scale = 256 * (2 ** zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat: clamp(lat, -90, 90),
    lng: clamp(lng, -180, 180),
  };
};

const buildAddressQuery = ({ street, barangay, city, state }) => {
  const parts = [street, barangay, city, state, 'Philippines']
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(', ');
};

const buildGoogleEmbedUrl = ({ lat, lng, query, zoom = 17 }) => {
  const q = lat && lng ? `${lat},${lng}` : query;
  return `https://maps.google.com/maps?q=${encodeURIComponent(q || 'Philippines')}&z=${zoom}&output=embed`;
};

const buildGoogleDirectionsUrl = ({ lat, lng, query }) => {
  const q = lat && lng ? `${lat},${lng}` : query;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q || 'Philippines')}`;
};

const getAddressAreaText = (address = {}) => normalizeText([
  address.road,
  address.suburb,
  address.village,
  address.neighbourhood,
  address.hamlet,
  address.quarter,
  address.city_district,
  address.city,
  address.town,
  address.municipality,
  address.county,
  address.state,
  address.state_district,
  address.region,
  address.province,
].filter(Boolean).join(' '));

const reverseGeocode = async ({ lat, lng, signal }) => {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  const response = await fetch(url, {
    signal,
    headers: { 'Accept-Language': 'en' },
  });

  if (!response.ok) throw new Error('Reverse geocoding failed');
  return response.json();
};

const geocodeAddress = async ({ street, barangay, city, state, signal }) => {
  const contextParts = [barangay, city, state].filter(Boolean);
  const streetParts = String(street || '').split(',').map((part) => part.trim()).filter(Boolean);
  const queries = [];

  if (streetParts.length > 0) {
    queries.push([...streetParts, ...contextParts, 'Philippines'].join(', '));
    queries.push([...streetParts].reverse().concat(contextParts, 'Philippines').join(', '));
  }

  if (barangay) queries.push([barangay, city, state, 'Philippines'].filter(Boolean).join(', '));
  queries.push([city, state, 'Philippines'].filter(Boolean).join(', '));

  for (const query of Array.from(new Set(queries.filter(Boolean)))) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      signal,
      headers: { 'Accept-Language': 'en' },
    });

    if (!response.ok) continue;
    const data = await response.json();
    const hit = Array.isArray(data) ? data[0] : null;
    const lat = toFiniteCoordinate(hit?.lat, -90, 90);
    const lng = toFiniteCoordinate(hit?.lon, -180, 180);
    if (lat !== null && lng !== null) {
      return { lat, lng };
    }
  }

  return null;
};

const MapPinPicker = ({
  street,
  barangay,
  city,
  state,
  lat: externalLat,
  lng: externalLng,
  onChange,
  height = 280,
  disabled = false,
}) => {
  const mapRef = useRef(null);
  const reverseControllerRef = useRef(null);
  const geocodeControllerRef = useRef(null);
  const [coords, setCoords] = useState(() => {
    const lat = toFiniteCoordinate(externalLat, -90, 90);
    const lng = toFiniteCoordinate(externalLng, -180, 180);
    return lat !== null && lng !== null ? { lat, lng } : null;
  });
  const [zoom, setZoom] = useState(coords ? 18 : 15);
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState('muted');
  const [lastGeoKey, setLastGeoKey] = useState('');
  const [dragging, setDragging] = useState(false);
  const [markerOffset, setMarkerOffset] = useState({ x: 0, y: 0 });

  const addressQuery = useMemo(
    () => buildAddressQuery({ street, barangay, city, state }),
    [street, barangay, city, state],
  );

  const requiredAreaReady = Boolean(barangay && city && state);

  const emitCoords = (nextCoords, nextAccuracy = null) => {
    setCoords(nextCoords);
    setZoom(18);
    setMarkerOffset({ x: 0, y: 0 });
    if (nextAccuracy !== null) setAccuracy(nextAccuracy);
    onChange?.({
      lat: Number(nextCoords.lat.toFixed(7)),
      lng: Number(nextCoords.lng.toFixed(7)),
    });
  };

  const coordsFromPointer = (event) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const center = latLngToWorldPoint({ lat: displayLat, lng: displayLng }, zoom);
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    return worldPointToLatLng({ x: center.x + dx, y: center.y + dy }, zoom);
  };

  const updateMarkerOffset = (event) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMarkerOffset({
      x: event.clientX - (rect.left + rect.width / 2),
      y: event.clientY - (rect.top + rect.height / 2),
    });
  };

  const handlePointerDown = (event) => {
    if (disabled || geocoding || locating) return;
    event.preventDefault();
    mapRef.current?.setPointerCapture?.(event.pointerId);
    setDragging(true);
    updateMarkerOffset(event);
  };

  const handlePointerMove = (event) => {
    if (!dragging || disabled) return;
    updateMarkerOffset(event);
  };

  const handlePointerUp = (event) => {
    if (!dragging || disabled) return;
    const nextCoords = coordsFromPointer(event);
    setDragging(false);
    if (!nextCoords) {
      setMarkerOffset({ x: 0, y: 0 });
      return;
    }
    emitCoords(nextCoords);
    setStatus('Pin moved. Latitude and longitude were updated.');
    setStatusTone('success');
    checkSelectedArea(nextCoords);
  };

  const checkSelectedArea = async (nextCoords) => {
    reverseControllerRef.current?.abort();
    const controller = new AbortController();
    reverseControllerRef.current = controller;

    try {
      const data = await reverseGeocode({
        lat: nextCoords.lat,
        lng: nextCoords.lng,
        signal: controller.signal,
      });

      const areaText = getAddressAreaText(data?.address || {});
      const selectedParts = [barangay, city, state].map(normalizeText).filter(Boolean);
      const cityMatches = selectedParts.some((part) => part && areaText.includes(part));

      if (cityMatches) {
        setStatus('Exact location detected inside the selected area.');
        setStatusTone('success');
      } else if (areaText) {
        setStatus('Location found, but it may be outside the selected area.');
        setStatusTone('warning');
      }
    } catch {
      if (!controller.signal.aborted) {
        setStatus('Location selected. Area verification is unavailable right now.');
        setStatusTone('muted');
      }
    }
  };

  const locateCurrentPosition = () => {
    if (disabled || !navigator.geolocation) {
      setStatus('Your browser cannot provide exact GPS location.');
      setStatusTone('warning');
      return;
    }

    setLocating(true);
    setStatus('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const nextAccuracy = Number.isFinite(position.coords.accuracy)
          ? Math.round(position.coords.accuracy)
          : null;

        emitCoords(nextCoords, nextAccuracy);
        setLocating(false);
        setStatus(nextAccuracy ? `Exact device location captured within about ${nextAccuracy}m.` : 'Exact device location captured.');
        setStatusTone('success');
        checkSelectedArea(nextCoords);
      },
      (error) => {
        setLocating(false);
        const denied = error.code === error.PERMISSION_DENIED;
        setStatus(denied ? 'Location permission was denied.' : 'Could not get your exact location. Try again near the delivery address.');
        setStatusTone('warning');
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      },
    );
  };

  const refineFromAddress = () => {
    if (disabled || !requiredAreaReady) return;

    geocodeControllerRef.current?.abort();
    const controller = new AbortController();
    geocodeControllerRef.current = controller;

    setGeocoding(true);
    setStatus('');

    geocodeAddress({ street, barangay, city, state, signal: controller.signal })
      .then((nextCoords) => {
        if (!nextCoords || controller.signal.aborted) {
          setStatus('Could not locate this address in Google Maps. Use current location for exact pin.');
          setStatusTone('warning');
          return;
        }

        emitCoords(nextCoords);
        setStatus(street ? 'Address location found. Use current location if you need GPS-level precision.' : 'Area location found. Add street or use current location for exact pin.');
        setStatusTone(street ? 'success' : 'muted');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus('Could not locate this address. Use current location for exact pin.');
          setStatusTone('warning');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setGeocoding(false);
      });
  };

  useEffect(() => {
    const lat = toFiniteCoordinate(externalLat, -90, 90);
    const lng = toFiniteCoordinate(externalLng, -180, 180);
    if (lat === null || lng === null) return;
    if (coords && Number(coords.lat) === lat && Number(coords.lng) === lng) return;
    emitCoords({ lat, lng });
  }, [externalLat, externalLng]);

  useEffect(() => {
    if (!requiredAreaReady) return;

    const geoKey = `${street || ''}|${barangay || ''}|${city || ''}|${state || ''}`;
    if (geoKey === lastGeoKey) return;
    setLastGeoKey(geoKey);

    const lat = toFiniteCoordinate(externalLat, -90, 90);
    const lng = toFiniteCoordinate(externalLng, -180, 180);
    if (lat !== null && lng !== null) return;

    refineFromAddress();
  }, [street, barangay, city, state, requiredAreaReady]);

  useEffect(() => {
    if (!requiredAreaReady) {
      setCoords(null);
      setAccuracy(null);
      setStatus('');
      setLastGeoKey('');
    }
  }, [requiredAreaReady]);

  useEffect(() => () => {
    reverseControllerRef.current?.abort();
    geocodeControllerRef.current?.abort();
  }, []);

  if (!requiredAreaReady) return null;

  const displayLat = coords?.lat ?? PHILIPPINES_CENTER.lat;
  const displayLng = coords?.lng ?? PHILIPPINES_CENTER.lng;
  const mapUrl = buildGoogleEmbedUrl({
    lat: coords?.lat,
    lng: coords?.lng,
    query: addressQuery,
    zoom,
  });
  const googleMapsUrl = buildGoogleDirectionsUrl({
    lat: coords?.lat,
    lng: coords?.lng,
    query: addressQuery,
  });
  const statusClass = statusTone === 'success'
    ? 'text-emerald-600'
    : statusTone === 'warning'
      ? 'text-amber-600'
      : 'text-gray-500';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-800">Pin exact location</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refineFromAddress}
            disabled={disabled || geocoding || locating}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={13} className={geocoding ? 'animate-spin' : ''} />
            {geocoding ? 'Finding' : 'Find address'}
          </button>
          <button
            type="button"
            onClick={locateCurrentPosition}
            disabled={disabled || locating}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LocateFixed size={13} className={locating ? 'animate-pulse' : ''} />
            {locating ? 'Locating' : 'Use exact location'}
          </button>
        </div>
      </div>

      <div
        ref={mapRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          setDragging(false);
          setMarkerOffset({ x: 0, y: 0 });
        }}
        className="relative w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-100"
        style={{
          height: `${height}px`,
          minHeight: `${height}px`,
          minWidth: '100%',
          cursor: disabled ? 'default' : dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <iframe
          title="Google map location picker"
          src={mapUrl}
          className="h-full w-full border-0"
          style={{ pointerEvents: 'none' }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          aria-label="Google map showing selected delivery location"
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center"
          style={{ marginLeft: `${markerOffset.x}px`, marginTop: `${markerOffset.y}px` }}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-lg ring-4 ring-white/90">
            <Crosshair size={18} />
          </div>
          <div className="h-4 w-1 rounded-b-full bg-red-600 shadow" />
        </div>
        {(geocoding || locating) && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm font-medium text-gray-700">
            {locating ? 'Getting exact GPS location...' : 'Finding address...'}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="text-gray-500">
          Lat {formatCoordinate(displayLat)}, Lng {formatCoordinate(displayLng)}
          {accuracy ? `, accuracy about ${accuracy}m` : ''}
        </div>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-red-600 hover:text-red-700"
        >
          Open in Google Maps
          <ExternalLink size={12} />
        </a>
      </div>

      {status && <p className={`text-xs ${statusClass}`}>{status}</p>}
      <p className="text-xs text-gray-500">
        Drag the pin, tap the map, or use exact location while you are at the delivery address.
      </p>
    </div>
  );
};

export default MapPinPicker;
