import codecs
import re

with codecs.open('src/controllers/authController.js', 'r', 'utf-8') as f:
    text = f.read()

# Replace register
register_code = """export const register = async (req, res) => {
  const { name, email, password, consent_given, age_confirmed, newsletter_opt_in } = req.body;
  try {
    const existingResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (existingResult.rows.length > 0) {
      const existingUser = existingResult.rows[0];
      if (existingUser.email_verified) {
        return res.status(400).json({ message: 'Email already registered' });
      } else {
        await pool.query(
          'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
          [verificationTokenHash, expiresAt, existingUser.id]
        );
        const transporter = createTransporter();
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || '"10th West Moto" <noreply@10thwestmoto.com>',
          to: email,
          subject: 'Verify your account - 10th West Moto',
          html: `<h2>Verify your email</h2><p>Click <a href="${verificationUrl}">here</a> to verify your account.</p>`
        });
        return res.json({ message: 'This email is already registered but not yet verified. A new verification email has been sent.', requiresVerification: true });
      }
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUserResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, email_verified, consent_given, age_confirmed, newsletter_opt_in, email_verification_token, email_verification_expires)
       VALUES ($1, $2, $3, 'customer', 'active', false, $4, $5, $6, $7, $8) RETURNING id`,
      [name, email, passwordHash, consent_given, age_confirmed, newsletter_opt_in, verificationTokenHash, expiresAt]
    );

    const transporter = createTransporter();
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"10th West Moto" <noreply@10thwestmoto.com>',
      to: email,
      subject: 'Verify your account - 10th West Moto',
      html: `<h2>Verify your email</h2><p>Click <a href="${verificationUrl}">here</a> to verify your account.</p>`
    });

    res.status(201).json({ message: 'Registration successful. Please check your email to verify your account.', requiresVerification: true });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Failed to create account' });
  }
};"""
text = re.sub(r'export const register = async \(req, res\) => \{.*?(?=\nexport )', register_code + '\n', text, flags=re.DOTALL)

# Replace login
login_code = """export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = result.rows[0];
    if (user.status === 'suspended' || user.status === 'banned') return res.status(403).json({ message: `Account ${user.status}` });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });

    if (!user.email_verified) return res.status(403).json({ message: 'Your account is not yet verified. Please check your email.', requiresVerification: true, email: user.email });

    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status }, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};"""
text = re.sub(r'export const login = async \(req, res\) => \{.*?(?=\nexport )', login_code + '\n', text, flags=re.DOTALL)

# Add verify & resend
verify_code = """export const verifyEmailToken = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'Missing token' });
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      'UPDATE users SET email_verified = true, email_verification_token = null, email_verification_expires = null WHERE email_verification_token = $1 AND email_verification_expires > NOW() RETURNING id',
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
  try {
    const existingResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingResult.rows.length === 0) return res.json({ message: 'Verification email sent if account exists.' });
    const user = existingResult.rows[0];
    if (user.email_verified) return res.status(400).json({ message: 'Account is already verified.' });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
      [verificationTokenHash, expiresAt, user.id]
    );
    const transporter = createTransporter();
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"10th West Moto" <noreply@10thwestmoto.com>',
      to: email,
      subject: 'Verify your account - 10th West Moto',
      html: `<h2>Verify your email</h2><p>Click <a href="${verificationUrl}">here</a> to verify your account.</p>`
    });
    res.json({ message: 'Verification email resent successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to resend' });
  }
};"""

text = re.sub(r'export const verifyEmailToken = async \(req, res\) => \{.*?(?=\nexport )', verify_code + '\n', text, flags=re.DOTALL)
text = re.sub(r'export const resendVerification = async \(req, res\) => \{.*?(?=\nexport |\Z)', '', text, flags=re.DOTALL)

if 'export const verifyEmailToken' not in text:
    text += '\n' + verify_code

with codecs.open('src/controllers/authController.js', 'w', 'utf-8') as f:
    f.write(text)
