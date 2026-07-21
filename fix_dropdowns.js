const fs = require('fs');
let code = fs.readFileSync('frontend/components/AddressDropdowns.jsx', 'utf8');

const syncCode = \
  // Sync props to state if they change externally
  useEffect(() => {
    if (province && province.toLowerCase() !== selectedProvince.name.toLowerCase()) {
      setSelectedProvince({ code: '', name: province });
    }
  }, [province]);

  useEffect(() => {
    if (city && city.toLowerCase() !== selectedCity.name.toLowerCase()) {
      setSelectedCity({ code: '', name: city });
    }
  }, [city]);

  useEffect(() => {
    if (barangay && barangay.toLowerCase() !== selectedBarangay.toLowerCase()) {
      setSelectedBarangay(barangay);
    }
  }, [barangay]);
\;

code = code.replace(/const emitChange = \(next\) => \{/, syncCode + '\n  const emitChange = (next) => {');

fs.writeFileSync('frontend/components/AddressDropdowns.jsx', code);
