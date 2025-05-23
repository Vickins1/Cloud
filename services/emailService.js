const nodemailer = require('nodemailer');
const User = require('../models/user');
require('dotenv').config();

// Validate environment variables
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

if (!EMAIL_USER || !EMAIL_PASS) {
    console.error('Email configuration missing. Please set EMAIL_USER and EMAIL_PASS in .env');
    throw new Error('Email service configuration incomplete');
}

// Nodemailer transporter with connection pooling
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
});

// Fixed HTML escape function (corrected entity replacements)
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const generateEmailTemplate = ({ headerTitle, content, host }) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="ie=edge">
        <title>${headerTitle} | Cloud 420</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Helvetica Neue', Arial, sans-serif;
                background: #1a1a1a;
                margin: 0;
                padding: 20px;
                color: #e0e0e0;
                line-height: 1.7;
            }
            .container {
                max-width: 620px;
                margin: 0 auto;
                background: #252525;
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
                overflow: hidden;
                border: 1px solid #333333;
            }
            .header {
                background: linear-gradient(135deg, #000000 0%, #1f1f1f 100%);
                padding: 30px 20px;
                text-align: center;
                position: relative;
                overflow: hidden;
            }
            .header::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: radial-gradient(circle, rgba(255, 255, 255, 0.05) 0%, transparent 70%);
                transform: rotate(30deg);
                pointer-events: none;
            }
            .header img {
                max-width: 100px;
                filter: brightness(1.2);
                transition: transform 0.4s ease-in-out;
            }
            .header img:hover {
                transform: scale(1.1) rotate(5deg);
            }
            .header h1 {
                margin: 15px 0 0;
                font-size: 28px;
                font-weight: 300;
                color: #ffffff;
                letter-spacing: 2px;
                text-transform: uppercase;
                position: relative;
                z-index: 1;
            }
            .content {
                padding: 40px;
                background: #252525;
                color: #cccccc;
            }
            .greeting {
                font-size: 22px;
                color: #ffffff;
                margin-bottom: 25px;
                font-weight: 400;
                letter-spacing: 0.5px;
                border-bottom: 1px solid #404040;
                padding-bottom: 10px;
            }
            p {
                font-size: 16px;
                line-height: 1.8;
                margin: 15px 0;
                color: #cccccc;
            }
            .cta {
                display: inline-block;
                padding: 14px 32px;
                background: #000000;
                color: #ffffff;
                text-decoration: none;
                border-radius: 50px;
                font-weight: 600;
                font-size: 15px;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                border: 2px solid #404040;
                transition: all 0.3s ease;
            }
            .cta:hover {
                background: #ffffff;
                color: #000000;
                border-color: #ffffff;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
            }
            .footer {
                text-align: center;
                padding: 25px;
                font-size: 14px;
                color: #999999;
                background: #202020;
                border-top: 1px solid #333333;
            }
            .footer a {
                color: #ffffff;
                text-decoration: none;
                font-weight: 500;
                transition: color 0.3s ease;
            }
            .footer a:hover {
                color: #cccccc;
                text-decoration: underline;
            }
            .details-table {
                width: 100%;
                margin: 20px 0;
                border-collapse: collapse;
                background: #1f1f1f;
                border-radius: 8px;
                overflow: hidden;
            }
            .details-table td {
                padding: 12px 20px;
                border-bottom: 1px solid #333333;
                font-size: 15px;
            }
            .details-table td:first-child {
                color: #999999;
                width: 40%;
            }
            .details-table td:last-child {
                color: #ffffff;
            }
            @media (max-width: 480px) {
                .container { margin: 10px; border-radius: 10px; }
                .header h1 { font-size: 24px; }
                .content { padding: 30px; }
                .greeting { font-size: 20px; }
                .cta { padding: 12px 24px; font-size: 14px; }
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
                <p>© ${new Date().getFullYear()} Cloud 420 • Crafted with Precision • <a href="https://${host}">Explore More</a></p>
            </div>
        </div>
    </body>
    </html>
`;

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
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

const emailService = {
    async sendOrderConfirmation({ customerName, customerEmail, cloudOrderId, total, items = [], host }) {
        if (!customerEmail) throw new Error('Customer email is required');
        const content = `
            <p class="greeting">Greetings ${escapeHtml(customerName)},</p>
            <p>Your Cloud 420 order is locked and loaded! We’re prepping it with love and will let you know when it’s on its way.</p>
            <table class="details-table">
                <tr><td>Order ID</td><td>${escapeHtml(cloudOrderId)}</td></tr>
                <tr><td>Total</td><td>KES ${Number(total).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</td></tr>
            </table>
            ${items.length > 0 ? `
                <table class="items-table">
                    <tr><th>Goodies</th><th>Qty & Price</th></tr>
                    ${items.map(item => `
                        <tr>
                            <td>${escapeHtml(item.productId.name || 'Item')}</td>
                            <td>x${Number(item.quantity)} - KES ${(Number(item.price || item.productId.price) * Number(item.quantity)).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</td>
                        </tr>
                    `).join('')}
                </table>
            ` : '<p>No items to display, but we’ve got your order covered!</p>'}
        `;
        const mailOptions = {
            from: `Cloud 420 Store <${EMAIL_USER}>`,
            to: customerEmail,
            subject: 'Your Cloud 420 Order is Confirmed! 🌿',
            html: generateEmailTemplate({ headerTitle: 'Order Locked In', content, host }),
        };
        await sendEmail(mailOptions, 'Order confirmation');
    },

    async sendNewOrderNotificationToAdmin({ customerName, cloudOrderId, total, items = [], host }) {
        const content = `
            <p class="greeting">New Order Alert!</p>
            <p>A new order has been placed by ${escapeHtml(customerName)}. Here are the details:</p>
            <table class="details-table">
                <tr><td>Order ID</td><td>${escapeHtml(cloudOrderId)}</td></tr>
                <tr><td>Customer</td><td>${escapeHtml(customerName)}</td></tr>
                <tr><td>Total</td><td>KES ${Number(total).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</td></tr>
                <tr><td>Order Date</td><td>${new Date().toLocaleString()}</td></tr>
            </table>
            ${items.length > 0 ? `
                <table class="items-table">
                    <tr><th>Product</th><th>Qty & Price</th></tr>
                    ${items.map(item => `
                        <tr>
                            <td>${escapeHtml(item.productId.name || 'Item')}</td>
                            <td>x${Number(item.quantity)} - KES ${(Number(item.price || item.productId.price) * Number(item.quantity)).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</td>
                        </tr>
                    `).join('')}
                </table>
            ` : '<p>No items to display for this order.</p>'}
        `;
        const mailOptions = {
            from: `Cloud 420 Store <${EMAIL_USER}>`,
            to: ADMIN_EMAIL,
            subject: `New Order Alert: #${escapeHtml(cloudOrderId)} 🌿`,
            html: generateEmailTemplate({ headerTitle: 'New Order Received', content, host }),
        };
        await sendEmail(mailOptions, 'New order notification');
    },

    async sendDeliveryConfirmation({ customerName, customerEmail, cloudOrderId, total, items = [], deliveredAt, host }) {
        if (!customerEmail) throw new Error('Customer email is required');
        const content = `
            <p class="greeting">Greetings ${escapeHtml(customerName)},</p>
            <p>Your Cloud 420 goodies touched down on ${new Date(deliveredAt).toLocaleString()}! Hope you’re ready to vibe.</p>
            <table class="details-table">
                <tr><td>Order ID</td><td>${escapeHtml(cloudOrderId)}</td></tr>
                <tr><td>Total</td><td>KES ${Number(total).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</td></tr>
                <tr><td>Delivered</td><td>${new Date(deliveredAt).toLocaleDateString()}</td></tr>
            </table>
            ${items.length > 0 ? `
                <table class="items-table">
                    <tr><th>Delivered Goods</th><th>Qty & Price</th></tr>
                    ${items.map(item => `
                        <tr>
                            <td>${escapeHtml(item.productId.name || 'Item')}</td>
                            <td>x${Number(item.quantity)} - KES ${(Number(item.price || item.productId.price) * Number(item.quantity)).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</td>
                        </tr>
                    `).join('')}
                </table>
            ` : ''}
            <p><a href="https://${host}/products" class="cta">Grab More Goodies</a></p>
        `;
        const mailOptions = {
            from: `Cloud 420 Store <${EMAIL_USER}>`,
            to: customerEmail,
            subject: 'Your Cloud 420 Order Landed! 🌿',
            html: generateEmailTemplate({ headerTitle: 'Delivered with Love', content, host }),
        };
        await sendEmail(mailOptions, 'Delivery confirmation');
    },

    async sendEmailVerification({ userName, userEmail, verificationCode, host }) {
        if (!userEmail) throw new Error('User email is required');
        const content = `
            <p class="greeting">Greetings ${escapeHtml(userName)}!</p>
            <p>Welcome to the Cloud 420 crew—where the vibes are high and the stash is higher! 🌿 To spark up your account, blaze through verification with this cosmic code:</p>
            <div class="code-box">${escapeHtml(verificationCode)}</div>
            <p>Pop this bad boy into the verification page to join the dank side. It’s good for 24 hours—don’t let it go up in smoke!</p>
            <p><a href="https://${host}/auth/verify" class="cta">Verify Your Account</a></p>
            <p>Not feeling the buzz? Ignore this email, and we’ll keep the clouds clear for you. Need a hand? Our support squad’s got your back!</p>
        `;
        const mailOptions = {
            from: `Cloud 420 Store <${EMAIL_USER}>`,
            to: userEmail,
            subject: 'Cloud 420 Verification - Get Lit! 🌿',
            html: generateEmailTemplate({ headerTitle: 'Spark Your Journey', content, host }),
        };
        await sendEmail(mailOptions, 'Email verification');
    },

    async sendShippingUpdate({ customerName, customerEmail, cloudOrderId, total, items = [], shippingStatus, host }) {
        if (!customerEmail) throw new Error('Customer email is required');
        const content = `
            <p class="greeting">Greetings ${escapeHtml(customerName)},</p>
            <p>Your Cloud 420 order #${escapeHtml(cloudOrderId)} is on the move! Status: <strong>${escapeHtml(shippingStatus)}</strong>.</p>
            <table class="details-table">
                <tr><td>Order ID</td><td>${escapeHtml(cloudOrderId)}</td></tr>
                <tr><td>Total</td><td>KES ${Number(total).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</td></tr>
                <tr><td>Shipping Status</td><td>${escapeHtml(shippingStatus)}</td></tr>
            </table>
            ${items.length > 0 ? `
                <table class="items-table">
                    <tr><th>Your Stash</th><th>Qty & Price</th></tr>
                    ${items.map(item => `
                        <tr>
                            <td>${escapeHtml(item.productId.name || 'Item')}</td>
                            <td>x${Number(item.quantity)} - KES ${(Number(item.price || item.productId.price) * Number(item.quantity)).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</td>
                        </tr>
                    `).join('')}
                </table>
            ` : ''}
            <p><a href="https://${host}/cart/my-orders" class="cta">Track It Live</a></p>
        `;
        const mailOptions = {
            from: `Cloud 420 Store <${EMAIL_USER}>`,
            to: customerEmail,
            subject: `Cloud 420 Update: ${shippingStatus} 🌿`,
            html: generateEmailTemplate({ headerTitle: 'Shipping Vibes', content, host }),
        };
        await sendEmail(mailOptions, 'Shipping update');
    },

    async sendPaymentFailureNotification({ customerEmail, transactionRequestId, host }) {
        if (!customerEmail) throw new Error('Customer email is required');
        const content = `
            <p class="greeting">Hey There,</p>
            <p>Oops! Your payment for transaction ${escapeHtml(transactionRequestId)} didn’t go through. No stress—let’s try again.</p>
            <p><a href="https://${host}/cart" class="cta">Retry Payment</a></p>
            <p>Need help? Hit up our support crew!</p>
        `;
        const mailOptions = {
            from: `Cloud 420 Store <${EMAIL_USER}>`,
            to: customerEmail,
            subject: 'Cloud 420 Payment Glitch 🌿',
            html: generateEmailTemplate({ headerTitle: 'Payment Oopsie', content, host }),
        };
        await sendEmail(mailOptions, 'Payment failure');
    },

    async sendPaymentConfirmation({ customerName, customerEmail, transactionRequestId, amount, host }) {
        if (!customerEmail) throw new Error('Customer email is required');
        const content = `
            <p class="greeting">Greetings ${escapeHtml(customerName)},</p>
            <p>Your payment of <strong>KES ${Number(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</strong> for transaction ${escapeHtml(transactionRequestId)} just cleared the clouds!</p>
            <table class="details-table">
                <tr><td>Transaction ID</td><td>${escapeHtml(transactionRequestId)}</td></tr>
                <tr><td>Amount</td><td>KES ${Number(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</td></tr>
                <tr><td>Status</td><td>Paid in Full</td></tr>
            </table>
            <p>We’re rolling your order now—stay tuned for the next update!</p>
            <p><a href="https://${host}/receipt/${escapeHtml(transactionRequestId)}" class="cta">Download Your Receipt</a></p>
            <p><a href="https://${host}/products" class="cta">Keep the Vibes Going</a></p>
        `;
        const mailOptions = {
            from: `Cloud 420 Store <${EMAIL_USER}>`,
            to: customerEmail,
            subject: 'Cloud 420 Payment Cleared! 🌿',
            html: generateEmailTemplate({ headerTitle: 'Payment in the Bag', content, host }),
        };
        await sendEmail(mailOptions, 'Payment confirmation');
    },

    async sendPasswordResetEmail({ userName, userEmail, resetToken, host }) {
        if (!userEmail) throw new Error('User email is required');
        const resetUrl = `https://${host}/auth/reset-password/${encodeURIComponent(resetToken)}`;
        const content = `
            <p class="greeting">Greetings ${escapeHtml(userName)},</p>
            <p>Forgot your password? No worries, we’ve got you covered! Click below to reset it:</p>
            <p><a href="${resetUrl}" class="cta">Reset Your Password</a></p>
            <p>This link expires in 1 hour. If you didn’t request this, just ignore this email—your account’s still safe.</p>
            <p>Need help? Hit us up!</p>
        `;
        const mailOptions = {
            from: `Cloud 420 Store <${EMAIL_USER}>`,
            to: userEmail,
            subject: 'Cloud 420 Password Reset 🌿',
            html: generateEmailTemplate({ headerTitle: 'Reset Your Vibe', content, host }),
        };
        await sendEmail(mailOptions, 'Password reset');
    },

    async sendSupportReply({ customerName, customerEmail, messageId, originalMessage, reply, host }) {
        if (!customerEmail) throw new Error('Customer email is required for support reply');
        if (!messageId || !originalMessage || !reply) throw new Error('Support reply requires message ID, original message, and reply content');
        const content = `
            <p class="greeting">Dear ${escapeHtml(customerName || 'Valued Customer')},</p>
            <p>Thank you for reaching out to Cloud 420 Support. We’ve reviewed your request and are pleased to provide the following response:</p>
            <table class="details-table">
                <tr><td><strong>Reference ID</strong></td><td>${escapeHtml(messageId)}</td></tr>
                <tr><td><strong>Your Inquiry</strong></td><td>${escapeHtml(originalMessage)}</td></tr>
                <tr><td><strong>Our Response</strong></td><td>${escapeHtml(reply)}</td></tr>
            </table>
            <p>We hope this resolves your inquiry. Should you have additional questions or require further assistance, please don’t hesitate to contact us.</p>
            <p><a href="https://${host}/support" class="cta">Submit Another Request</a></p>
            <p>Best regards,<br>The Cloud 420 Support Team</p>
        `;
        const mailOptions = {
            from: `Cloud 420 Support <${EMAIL_USER}>`,
            to: customerEmail,
            subject: `Cloud 420 Support - Resolution for Request #${escapeHtml(messageId)}`,
            html: generateEmailTemplate({ headerTitle: 'Support Resolution', content, host }),
        };
        try {
            await sendEmail(mailOptions, 'Support reply');
            console.log(`Support reply sent successfully to ${customerEmail} for message ID ${messageId}`);
        } catch (error) {
            console.error(`Failed to send support reply for message ID ${messageId}:`, error);
            throw new Error(`Unable to send support reply: ${error.message}`);
        }
    },

    async sendNewProductNotification({ productName, productPrice, productDescription, productCategory, productImage, host }) {
        try {
            const users = await User.find({}).select('email username');
            if (!users || users.length === 0) {
                console.log('No registered users found to notify');
                return;
            }
            
            const sendPromises = users.map(user => {
                const content = `
                    <p class="greeting">Hey ${escapeHtml(user.username || 'Valued Customer')}</p>
                    <p>We’ve just dropped a fresh new product in the stash! Check out the details:</p>
                    <table class="details-table">
                        <tr><td>Product</td><td>${escapeHtml(productName)}</td></tr>
                        <tr><td>Price</td><td>KES ${Number(productPrice).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}</td></tr>
                        <tr><td>Category</td><td>${escapeHtml(productCategory)}</td></tr>
                        <tr><td>Description</td><td>${escapeHtml(productDescription || 'No description available')}</td></tr>
                    </table>
                    ${productImage ? `
                        <p><img src="https://${host}${productImage}" alt="${escapeHtml(productName)}" style="max-width: 300px; border-radius: 8px; margin: 20px 0;" /></p>
                    ` : ''}
                    <p><a href="https://${host}/products" class="cta">Check It Out Now</a></p>
                    <p>Grab it before it’s gone—stock’s limited!</p>
                `;
                const mailOptions = {
                    from: `Cloud 420 Store <${EMAIL_USER}>`,
                    to: user.email,
                    subject: `New Product Alert: ${escapeHtml(productName)} 🌿`,
                    html: generateEmailTemplate({ headerTitle: 'Fresh Drop Alert', content, host }),
                };
                return sendEmail(mailOptions, 'New product notification');
            });
            
            await Promise.all(sendPromises);
            console.log(`New product notification sent to ${users.length} users`);
        } catch (error) {
            console.error('Error sending new product notifications:', error);
            throw new Error('Failed to send new product notifications');
        }
    },
    
    async sendUpdateNotification({ subject, message, host }) {
        try {
            const users = await User.find({}).select('email username');
            if (!users || users.length === 0) {
                console.log('No registered users found to notify');
                return;
            }
            
            const sendPromises = users.map(user => {
                const content = `
                    <p class="greeting">Greetings ${escapeHtml(user.username || 'Valued Customer')}</p>
                    <p>We’ve got some important vibes to share with you:</p>
                    <p>${escapeHtml(message)}</p>
                    <p><a href="https://${host}" class="cta">Visit Cloud 420</a></p>
                    <p>Stay lit and keep vibing with us!</p>
                `;
                const mailOptions = {
                    from: `Cloud 420 Store <${EMAIL_USER}>`,
                    to: user.email,
                    subject: `Cloud 420 Update: ${escapeHtml(subject)} 🌿`,
                    html: generateEmailTemplate({ headerTitle: 'Important Update', content, host }),
                };
                return sendEmail(mailOptions, 'Update notification');
            });
            
            await Promise.all(sendPromises);
            console.log(`Update notification sent to ${users.length} users`);
        } catch (error) {
            console.error('Error sending update notifications:', error);
            throw new Error('Failed to send update notifications');
        }
    },
};

module.exports = emailService;