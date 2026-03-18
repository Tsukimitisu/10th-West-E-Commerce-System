const fs = require('fs');

const path = 'C:/Users/revil/Downloads/10th-west-moto/frontend/components/MapPinPicker.jsx';
let c = fs.readFileSync(path, 'utf8');

const regex = /const zoom = hasStreet \? 17 : 15;[\s\S]*?\}\)\.finally\(\(\) => setGeocoding\(false\)\);/;

const newCode = `const queries = [];
    if (hasStreet) {
      queries.push(\`\${street}, \${barangay ? barangay + ', ' : ''}\${city}, \${state}, Philippines\`);
      queries.push(\`\${street}, \${city}, \${state}, Philippines\`);
    }
    if (barangay) {
      queries.push(\`\${barangay}, \${city}, \${state}, Philippines\`);
    }
    queries.push(\`\${city}, \${state}, Philippines\`);

    setGeocoding(true);
    setError('');
    setErrorType('');
    const controller = new AbortController();

    const tryGeocode = async (queryList) => {
      for (const q of queryList) {
        if (controller.signal.aborted) return true;
        try {
          const res = await fetch(\`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=\${encodeURIComponent(q)}\`, {
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
    });`;

if (regex.test(c)) {
  c = c.replace(regex, newCode);
  fs.writeFileSync(path, c);
  console.log("Success MapPinPicker");
} else {
  console.log("Regex not found");
}
