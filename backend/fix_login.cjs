
const fs = require("fs");
let code = fs.readFileSync("../frontend/services/api.js", "utf8");

const regex = /if \(!isValidPassword\) throw new Error\('Invalid credentials'\);[\s\S]+?\/\/ Update last login/;

const replacement = `if (!isValidPassword) throw new Error('Invalid credentials');

      if (!user.email_verified) {
        throw new Error('Your account is not verified. Please verify your email first.');
      }

      // Update last login`;

code = code.replace(regex, replacement);
fs.writeFileSync("../frontend/services/api.js", code);
console.log("Login logic updated!");

