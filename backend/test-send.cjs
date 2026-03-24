require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: 'revillajamesandrei4@gmail.com',
    subject: 'Test Email from 10th West Moto',
    text: 'This is a test email to verify SMTP is working.'
};

transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        return console.log('❌ Error:', error);
    }
    console.log('✅ Email sent:', info.response);
});
