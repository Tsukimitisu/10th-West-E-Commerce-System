const fs = require('fs');
let text = fs.readFileSync('../frontend/services/api.js', 'utf8');

const additional = 
export const resendVerificationEmail = async (email) => {
  return await authenticatedFetch(\\\\\\/auth/resend-verification\\\, {
    method: 'POST',
    body: JSON.stringify({ email })
  });
};

export const verifyEmailToken = async (token) => {
  return await authenticatedFetch(\\\\\\/auth/verify-email\\\, {
    method: 'POST',
    body: JSON.stringify({ token })
  });
};
;
if(!text.includes('resendVerificationEmail')) {
    fs.writeFileSync('../frontend/services/api.js', text + additional);
}
