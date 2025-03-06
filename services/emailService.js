const nodemailer = require('nodemailer');
require('dotenv').config();

// Validate environment variables
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.error('Email configuration missing. Please set EMAIL_USER and EMAIL_PASS in .env');
  throw new Error('Email service configuration incomplete');
}

// Nodemailer transporter with connection pooling
const transporter = nodemailer.createTransport({
  service: 'gmail', // Can be made configurable via env if needed
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  pool: true, // Use connection pooling for better performance
  maxConnections: 5, // Limit concurrent connections
  maxMessages: 100, // Limit messages per connection
});

// Common HTML template function
const generateEmailTemplate = ({ headerTitle, content, host }) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>${headerTitle}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
      .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); }
      .header { background: linear-gradient(135deg, #6b9e78, #4a7c59); padding: 30px; text-align: center; }
      .header img { max-width: 150px; margin: 0 auto; }
      .header h1 { color: #ffffff; font-size: 26px; font-weight: 500; margin-top: 15px; }
      .content { padding: 30px; }
      .greeting { font-size: 22px; font-weight: 500; color: #6b9e78; margin-bottom: 20px; }
      p { font-size: 16px; margin-bottom: 20px; color: #555; }
      .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #f9f9f9; border-radius: 8px; overflow: hidden; }
      .details-table td { padding: 12px 15px; font-size: 15px; }
      .details-table td:first-child { font-weight: 600; color: #444; width: 40%; }
      .details-table td:last-child { color: #6b9e78; }
      .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      .items-table th, .items-table td { padding: 12px 15px; font-size: 15px; text-align: left; }
      .items-table th { background: #f0f4f2; color: #6b9e78; font-weight: 600; }
      .items-table td { border-bottom: 1px solid #eee; }
      .items-table td:last-child { text-align: right; }
      .cta { display: inline-block; background: #6b9e78; color: #ffffff; padding: 12px 30px; border-radius: 25px; font-size: 16px; font-weight: 500; text-decoration: none; transition: background 0.3s; }
      .cta:hover { background: #7db38a; }
      .footer { background: #2a2a2a; padding: 20px; text-align: center; color: #bbb; font-size: 13px; }
      @media (max-width: 600px) {
        .container { margin: 10px; }
        .header { padding: 20px; }
        .header h1 { font-size: 22px; }
        .content { padding: 20px; }
        .greeting { font-size: 18px; }
        .details-table td, .items-table td { display: block; width: 100%; text-align: left; }
        .items-table th { display: none; }
        .cta { display: block; text-align: center; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://${host}/images/Cloud.png" alt="Cloud 420 Logo">
        <h1>${headerTitle}</h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} Cloud 420 • Crafted with Care • All Rights Reserved</p>
      </div>
    </div>
  </body>
  </html>
`;

const emailService = {
  // Send Order Confirmation Email
  async sendOrderConfirmation({ customerName, customerEmail, cloudOrderId, total, items = [], host }) {
    if (!customerEmail) throw new Error('Customer email is required');

    const content = `
      <p class="greeting">Hello ${escapeHtml(customerName)},</p>
      <p>Your order has been successfully placed with Cloud 420. We’re preparing it with care and will notify you once it ships.</p>
      <table class="details-table">
        <tr><td>Order ID</td><td>${escapeHtml(cloudOrderId)}</td></tr>
        <tr><td>Total</td><td>KES ${Number(total).toFixed(2)}</td></tr>
      </table>
      ${
        items.length > 0
          ? `
            <table class="items-table">
              <tr><th>Item</th><th>Qty & Price</th></tr>
              ${items
                .map(
                  (item) => `
                    <tr>
                      <td>${escapeHtml(item.productId.name || 'Item')}</td>
                      <td>x${Number(item.quantity)} - KES ${(Number(item.price || item.productId.price) * Number(item.quantity)).toFixed(2)}</td>
                    </tr>
                  `
                )
                .join('')}
            </table>
          `
          : ''
      }
      <p><a href="https://${host}/track-order?orderId=${escapeHtml(cloudOrderId)}" class="cta">Track Your Order</a></p>
    `;

    const mailOptions = {
      from: `Cloud 420 Store <${EMAIL_USER}>`,
      to: customerEmail,
      subject: 'Your Cloud 420 Order Confirmation 🌿',
      html: generateEmailTemplate({ headerTitle: 'Order Confirmed', content, host }),
    };

    await sendEmail(mailOptions, 'Order confirmation');
  },

  // Send Delivery Confirmation Email
  async sendDeliveryConfirmation({ customerName, customerEmail, cloudOrderId, total, items = [], deliveredAt, host }) {
    if (!customerEmail) throw new Error('Customer email is required');

    const content = `
      <p class="greeting">Hello ${escapeHtml(customerName)},</p>
      <p>We’re thrilled to inform you that your Cloud 420 order was delivered on ${new Date(deliveredAt).toLocaleString()}.</p>
      <table class="details-table">
        <tr><td>Order ID</td><td>${escapeHtml(cloudOrderId)}</td></tr>
        <tr><td>Total</td><td>KES ${Number(total).toFixed(2)}</td></tr>
        <tr><td>Delivered</td><td>${new Date(deliveredAt).toLocaleDateString()}</td></tr>
      </table>
      ${
        items.length > 0
          ? `
            <table class="items-table">
              <tr><th>Item</th><th>Qty & Price</th></tr>
              ${items
                .map(
                  (item) => `
                    <tr>
                      <td>${escapeHtml(item.productId.name || 'Item')}</td>
                      <td>x${Number(item.quantity)} - KES ${(Number(item.price || item.productId.price) * Number(item.quantity)).toFixed(2)}</td>
                    </tr>
                  `
                )
                .join('')}
            </table>
          `
          : ''
      }
      <p><a href="https://${host}/products" class="cta">Shop More</a></p>
    `;

    const mailOptions = {
      from: `Cloud 420 Store <${EMAIL_USER}>`,
      to: customerEmail,
      subject: 'Your Cloud 420 Order Has Been Delivered! 🌿',
      html: generateEmailTemplate({ headerTitle: 'Order Delivered', content, host }),
    };

    await sendEmail(mailOptions, 'Delivery confirmation');
  },

  // Send Verification Email
  async sendVerificationEmail({ userName, userEmail, verificationToken, host }) {
    if (!userEmail) throw new Error('User email is required');

    const verificationUrl = `https://${host}/verify-email/${encodeURIComponent(verificationToken)}`;
    const content = `
      <p class="greeting">Hello ${escapeHtml(userName)},</p>
      <p>Thank you for joining Cloud 420! To activate your account, please verify your email address by clicking the button below:</p>
      <p><a href="${verificationUrl}" class="cta">Verify Your Email</a></p>
      <p>If you didn’t create an account, feel free to ignore this email.</p>
    `;

    const mailOptions = {
      from: `Cloud 420 Store <${EMAIL_USER}>`,
      to: userEmail,
      subject: 'Welcome to Cloud 420 – Verify Your Email 🌿',
      html: generateEmailTemplate({ headerTitle: 'Welcome Aboard', content, host }),
    };

    await sendEmail(mailOptions, 'Verification');
  },
};

// Utility function to send emails with retry logic
async function sendEmail(mailOptions, type) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await transporter.sendMail(mailOptions);
      console.log(`${type} email sent to ${mailOptions.to}`);
      return;
    } catch (error) {
      attempt++;
      console.error(`Attempt ${attempt} failed to send ${type} email:`, error);
      if (attempt === maxRetries) {
        throw new Error(`Failed to send ${type} email after ${maxRetries} attempts: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
    }
  }
}

// Simple HTML escape function to prevent XSS
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = emailService;