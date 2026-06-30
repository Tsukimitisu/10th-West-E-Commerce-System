const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/authController.js', 'utf8');

code = code.replace(/const expiresAt = new Date\(Date\.now\(\) \+ 24 \* 60 \* 60 \* 1000\);/g, '');

code = code.replace(
  /'UPDATE users SET email_verification_token = \\, email_verification_expires = \\ WHERE id = \\'/g,
  'UPDATE users SET email_verification_token = \\, email_verification_expires = NOW() + INTERVAL \\'24 hours\\' WHERE id = \\'
);
code = code.replace(
  '[verificationTokenHash, expiresAt, existingUser.id]',
  '[verificationTokenHash, existingUser.id]'
);

code = code.replace(
  /VALUES \(\\, \\, \\, 'customer', 'active', false, \\, \\, \\, \\, \\\)/g,
  VALUES (\\, \\, \\, 'customer', 'active', false, \\, \\, \\, \\, NOW() + INTERVAL \\'24 hours\\')
);
code = code.replace(
  '[name, email, passwordHash, consent_given, age_confirmed, newsletter_opt_in, verificationTokenHash, expiresAt]',
  '[name, email, passwordHash, consent_given, age_confirmed, newsletter_opt_in, verificationTokenHash]'
);

code = code.replace(
  '[verificationTokenHash, expiresAt, user.id]',
  '[verificationTokenHash, user.id]'
);

fs.writeFileSync('backend/src/controllers/authController.js', code);
console.log('Fixed auth controller!');
