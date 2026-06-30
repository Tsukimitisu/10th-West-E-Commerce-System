const fs = require('fs');
const file = 'backend/src/controllers/authController.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /'UPDATE users SET email_verified = true, email_verification_token = null, email_verification_expires = null WHERE email_verification_token = \\ RETURNING id'/,
  \'UPDATE users SET email_verified = true, email_verification_token = null, email_verification_expires = null WHERE email_verification_token = \\ AND email_verification_expires > NOW() RETURNING id'\
);

fs.writeFileSync(file, content);
