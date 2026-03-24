import codecs

with codecs.open('src/controllers/authController.js', 'a', 'utf-8') as f:
    f.write('''\nexport const resendVerification = async (req, res) => {
  const { email } = req.body;
  try {
    const existingResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingResult.rows.length === 0) return res.json({ message: 'Verification email sent if account exists.' });
    const user = existingResult.rows[0];
    if (user.email_verified) return res.status(400).json({ message: 'Account is already verified.' });

    const crypto = require('crypto');
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
};
''')