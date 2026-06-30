const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/authController.js', 'utf8');

code = code.replace(
  /UPDATE users SET email_verified = true, email_verification_token =[\s\S]*?RETURNING id/g,
  'UPDATE users SET email_verified = true, email_verification_token = null, email_verification_expires = null WHERE email_verification_token = \\ AND email_verification_expires > NOW() RETURNING id'
);

fs.writeFileSync('backend/src/controllers/authController.js', code);
