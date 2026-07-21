const fs = require('fs');
let code = fs.readFileSync('frontend/pages/customer/AddressBook.jsx', 'utf8');

code = code.replace(
  /const handleSave = async \(e\) => \{\s+e\.preventDefault\(\);\s+setSaveError\(''\);\s+setPhoneError\(''\);/,
  \const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');
    setPhoneError('');
    if (!form.name || !form.street || !form.city || !form.state || !form.zip || !form.phone) {
      setSaveError('Please fill in all required fields.');
      return;
    }\
);

fs.writeFileSync('frontend/pages/customer/AddressBook.jsx', code);
