const fs = require("fs");
let code = fs.readFileSync("backend/src/controllers/authController.js", "utf8");

const regex = /export const verifyEmailToken = async[\s\S]*?res.status\(500\)\.json\({ message: .Server error. }\);\n  \};/g;

code = code.replace(regex, `export const verifyEmailToken = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: "Missing token" });
  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const result = await pool.query(
      "UPDATE users SET email_verified = true, email_verification_token = null, email_verification_expires = null WHERE email_verification_token = \\$1 AND email_verification_expires > NOW() RETURNING id",
      [tokenHash]
    );
    if (result.rows.length === 0) return res.status(400).json({ message: "Invalid or expired verification link" });
    res.json({ message: "Your account has been successfully verified. You may now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};`);

fs.writeFileSync("backend/src/controllers/authController.js", code);
