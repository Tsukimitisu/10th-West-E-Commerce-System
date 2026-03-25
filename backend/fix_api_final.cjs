
const fs = require("fs");
let text = fs.readFileSync("../frontend/services/api.js", "utf8");

text = text.replace(
  /if \(USE_SUPABASE\) \{\s+\/\/ Check if email already exists[\s\S]+?if \(existing\) throw new Error\('Email already registered'\);\s+/m,
  `if (USE_SUPABASE) {
      // Check if email already exists
      const { data: existing } = await supabase
        .from("users")
        .select("id, email_verified")
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        if (existing.email_verified) {
          throw new Error("Email already registered");
        } else {
          try {
            await authenticatedFetch(\`\${API_URL}/auth/resend-verification\`, {
              method: "POST",
              body: JSON.stringify({ email })
            });
          } catch (e) {
            console.error("Failed to trigger backend verification email:", e);
          }
          return {
            message: "This email is already registered but not yet verified. A new verification email has been sent.",
            requiresVerification: true,
          };
        }
      }

      `
);

fs.writeFileSync("../frontend/services/api.js", text);
console.log("Done.");

