const fs = require('fs');
const path = require('path');
let text = fs.readFileSync(path.join(__dirname, 'src/controllers/authController.js'), 'utf8');

const registerCode = export const register = async (req, res) => {
  const { name, email, password, consent_given, age_confirmed, newsletter_opt_in } = req.body;
  try {
    const existingResult = await pool.query('SELECT * FROM users WHERE email = ', [email]);
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (existingResult.rows.length > 0) {
      const existingUser = existingResult.rows[0];
      if (existingUser.email_verified) {
        return res.status(400).json({ message: 'Email already registered' });
      } else {
        await pool.query(
          'UPDATE users SET email_verification_token = , email_verification_expires =  WHERE id = ',
          [verificationTokenHash, expiresAt, existingUser.id]
        );
        const transporter = require('./emailController').createTransporter();
        const verificationUrl = \\\\\\/verify-email?token=\\\\\\;
        await transporter.sendMail({
          from: process.env.EMAIL_FROM,
          to: email,
          subject: 'Verify your account - 10th West Moto',
          html: \\\<h2>Verify your email</h2><p>Click <a href="\\\">here</a> to verify your account.</p>\\\
        });
        return res.json({ message: 'This email is already registered but not yet verified. A new verification email has been sent.', requiresVerification: true });
      }
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUserResult = await pool.query(
      \\\INSERT INTO users (name, email, password_hash, role, status, email_verified, consent_given, age_confirmed, newsletter_opt_in, email_verification_token, email_verification_expires)
       VALUES (, , , 'customer', 'active', false, , , , , ) RETURNING id, name, email, role\\\,
      [name, email, passwordHash, consent_given, age_confirmed, newsletter_opt_in, verificationTokenHash, expiresAt]
    );

    const transporter = require('./emailController').createTransporter();
    const verificationUrl = \\\\\\/verify-email?token=\\\\\\;
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Verify your account - 10th West Moto',
      html: \\\<h2>Verify your email</h2><p>Click <a href="\\\">here</a> to verify your account.</p>\\\
    });

    res.status(201).json({ message: 'Registration successful. Please check your email to verify your account.', requiresVerification: true });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Failed to create account' });
  }
};;

text = text.replace(/export const register = async \(req, res\) => \{[\s\S]*?(?=\nexport )/, registerCode + '\n');

const loginCode = export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = ', [email]);
    if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = result.rows[0];
    if (user.status === 'suspended' || user.status === 'banned') return res.status(403).json({ message: \\\Account \\\\\\ });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });

    if (!user.email_verified) return res.status(403).json({ message: 'Your account is not yet verified. Please check your email.', requiresVerification: true });

    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ', [user.id]);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status }, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};;

text = text.replace(/export const login = async \(req, res\) => \{[\s\S]*?(?=\nexport )/, loginCode + '\n');

const verifyCode = export const verifyEmailToken = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'Missing token' });
  const crypto = require('crypto');
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      'UPDATE users SET email_verified = true, email_verification_token = null, email_verification_expires = null WHERE email_verification_token =  AND email_verification_expires > NOW() RETURNING id',
      [tokenHash]
    );
    if (result.rows.length === 0) return res.status(400).json({ message: 'Invalid or expired verification link' });
    res.json({ message: 'Your account has been successfully verified. You may now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  const crypto = require('crypto');
  try {
    const existingResult = await pool.query('SELECT * FROM users WHERE email = ', [email]);
    if (existingResult.rows.length === 0) return res.json({ message: 'If an account exists, a link was sent.' });
    const user = existingResult.rows[0];
    if (user.email_verified) return res.status(400).json({ message: 'Account is already verified.' });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET email_verification_token = , email_verification_expires =  WHERE id = ',
      [verificationTokenHash, expiresAt, user.id]
    );
    const transporter = require('./emailController').createTransporter();
    const verificationUrl = \\\\\\/verify-email?token=\\\\\\;
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Verify your account - 10th West Moto',
      html: \\\<h2>Verify your email</h2><p>Click <a href="\\\">here</a> to verify your account.</p>\\\
    });
    res.json({ message: 'Verification email resent successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to resend' });
  }
};;

text = text.replace(/export const verifyEmailToken = async \(req, res\) => \{[\s\S]*?(?=\nexport )/, verifyCode + '\n');
text = text.replace(/export const resendVerification = async \(req, res\) => \{[\s\S]*?(?=\nexport |\Z)/, '');
text += '\n' + verifyCode;

fs.writeFileSync(path.join(__dirname, 'src/controllers/authController.js'), text);
