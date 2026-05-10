import React, { useEffect, useRef, useState } from 'react';

const normalizeSearchText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[().,-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const formatPostalCode = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 4) return `0${digits}`;
  return digits.slice(0, 5);
};

const LOCAL_PH_SUGGESTIONS = [
  {
    place_id: 'local-malabon-dampalit-m-sioson',
    display_name: 'M. Sioson Street, Dampalit, Malabon City, Metro Manila, Philippines',
    address: {
      road: 'M. Sioson Street',
      suburb: 'Dampalit',
      city: 'Malabon City',
      state: 'Metro Manila (NCR)',
      postcode: '01470',
      country: 'Philippines',
    },
  },
];

const getLocalSuggestions = (query, context = {}) => {
  const haystack = normalizeSearchText([
    query,
    context.barangay,
    context.city,
    context.state,
  ].filter(Boolean).join(' '));

  return LOCAL_PH_SUGGESTIONS.filter(() => {
    const hasStreet = haystack.includes('m sioson') || haystack.includes('sioson');
    const hasPlace = haystack.includes('dampalit') || haystack.includes('malabon');
    return hasStreet && hasPlace;
  });
};

const buildSearchQueries = (query, context = {}, strictContext = false) => {
  const queryParts = query.split(',').map((part) => part.trim()).filter(Boolean);
  const contextParts = [context.barangay, context.city, context.state].filter(Boolean);
  const withContext = Array.from(new Set([...queryParts, ...contextParts, 'Philippines'])).join(', ');
  const withoutPeriods = withContext.replace(/\./g, '');
  const loose = Array.from(new Set([...queryParts, context.city, context.state, 'Philippines'].filter(Boolean))).join(', ');
  const compact = `${normalizeSearchText(withContext)}, Philippines`;

  return Array.from(new Set([
    withContext,
    withoutPeriods,
    loose,
    strictContext ? '' : compact,
  ].filter(Boolean)));
};

// Lightweight PH-focused address autocomplete using Nominatim (OpenStreetMap).
// Expects parent to manage the final form fields; this only suggests and returns parsed address parts.
const AddressAutocomplete = ({
  value,
  onSelect,
  onInputChange,
  placeholder = 'Search address (Philippines)',
  disabled = false,
  context = {},
  strictContext = false,
}) => {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      setError('');
      if (abortRef.current) abortRef.current.abort();
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');

    const timer = setTimeout(async () => {
      try {
        let list = getLocalSuggestions(query, context);

        for (const searchQuery of buildSearchQueries(query, context, strictContext)) {
          if (list.length > 0) break;

          const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=ph&q=${encodeURIComponent(searchQuery)}`;
          const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept-Language': 'en' },
          });
          if (!res.ok) throw new Error('Failed to fetch suggestions');
          const data = await res.json();
          list = Array.isArray(data) ? data : [];
        }

        setSuggestions(list);
        setOpen(list.length > 0);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError('Could not load suggestions');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, context.barangay, context.city, context.state, strictContext]);

  const parseSuggestion = (s) => {
    const addr = s.address || {};
    const barangay = addr.suburb || addr.village || addr.neighbourhood || addr.hamlet || addr.city_district || '';
    const city = addr.city || addr.town || addr.municipality || addr.county || '';
    const province = addr.state || addr.region || addr.province || '';
    const street = [addr.house_number, addr.road].filter(Boolean).join(' ').trim() || addr.road || s.display_name || '';

    return {
      street,
      barangay,
      city,
      state: province,
      postal_code: formatPostalCode(addr.postcode),
      country: 'Philippines',
      lat: s.lat ? Number(s.lat) : null,
      lng: s.lon ? Number(s.lon) : null,
    };
  };

  const handleSelect = (s) => {
    const selected = parseSuggestion(s);
    onSelect?.(selected);
    setQuery(selected.street);
    setSuggestions([]);
    setOpen(false);
  };

  const handleOutsideClick = (event) => {
    if (containerRef.current && !containerRef.current.contains(event.target)) {
      setSuggestions([]);
      setOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const renderLabel = (s) => {
    const addr = s.address || {};
    const primary = [addr.house_number, addr.road].filter(Boolean).join(' ').trim() || s.display_name;
    const barangay = addr.suburb || addr.village || addr.neighbourhood || addr.hamlet || addr.city_district || '';
    const locality = addr.city || addr.town || addr.municipality || addr.county || '';
    const province = addr.state || addr.region || addr.province || '';
    const zip = formatPostalCode(addr.postcode);
    const secondary = [barangay, locality, province, zip].filter(Boolean).join(', ');
    return { primary, secondary };
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onInputChange?.(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:text-gray-700"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-haspopup="listbox"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-700">Loading...</div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto" role="listbox">
          {suggestions.map((s) => {
            const label = renderLabel(s);
            return (
              <button
                type="button"
                key={s.place_id}
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-sm text-gray-900"
                role="option"
              >
                <div className="font-medium truncate">{label.primary}</div>
                {label.secondary && <div className="text-xs text-gray-700 truncate">{label.secondary}</div>}
              </button>
            );
          })}
        </div>
      )}
      {open && !loading && !error && suggestions.length === 0 && query.trim().length >= 3 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg text-sm text-gray-700 px-3 py-2">
          No suggestions found. Try refining your search.
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
