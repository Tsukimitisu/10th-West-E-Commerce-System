const fs = require('fs');

const path = 'src/controllers/authController.js';
let content = fs.readFileSync(path, 'utf8');

const regex = /html:\s*`<h2>Verify your email<\/h2><p>Click <a\n?\s*href="\${verificationUrl}">here<\/a> to verify your account\.<\/p>`/g;

const newHTML = `html: \`
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background: #fff; border: 1px solid #eee; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
  <div style="text-align: center; margin-bottom: 25px;">
    <h2 style="color: #1a1a1a; margin: 0; font-size: 24px;">Verify Your Email</h2>
  </div>
  <p style="color: #444; font-size: 16px; line-height: 1.5; text-align: center;">Welcome to 10th West Moto!<br>Please click the button below to verify your email address and activate your account.</p>
  <div style="text-align: center; margin: 35px 0;">
    <a href="\${verificationUrl}" style="background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);">Verify My Account</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eaeaea; margin: 25px 0;">
  <p style="color: #888; font-size: 12px; text-align: center; line-height: 1.5;">If that didn't work, copy and paste this link into your browser:<br><br><a href="\${verificationUrl}" style="color: #2563eb; word-break: break-all;">\${verificationUrl}</a></p>
</div>
\``;

let newContent = content.replace(regex, newHTML);

fs.writeFileSync(path, newContent);
console.log('Replaced successfully. Occurrences found and fixed:', newContent.split('Verify My Account').length - 1);
