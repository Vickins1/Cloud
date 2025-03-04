const nodemailer = require('nodemailer');

require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const emailService = {
       // Send Order Confirmation Email
       async sendOrderConfirmation({ customerName, customerEmail, cloudOrderId, total, items = [] }) {
         const mailOptions = {
           from: `Cloud 420 Store <${process.env.EMAIL_USER}>`,
           to: customerEmail,
           subject: 'Your Cloud 420 Order is Confirmed! 🌿',
           html: `
             <!DOCTYPE html>
             <html lang="en">
             <head>
               <meta charset="UTF-8">
               <meta name="viewport" content="width=device-width, initial-scale=1.0">
               <meta http-equiv="X-UA-Compatible" content="ie=edge">
               <style>
                 /* Reset and Base Styles */
                 * { margin: 0; padding: 0; box-sizing: border-box; }
                 body { font-family: 'Georgia', serif; background: #f8f1e9; color: #3a2e2e; line-height: 1.6; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; }
                 table { border-collapse: collapse; width: 100%; }
                 img { max-width: 100%; height: auto; display: block; }
                 a { color: #6b9e78; text-decoration: none; }
                 a:hover { text-decoration: underline; }
     
                 /* Container */
                 .email-container { max-width: 600px; width: 100%; margin: 20px auto; background: #fffcf7; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03); }
     
                 /* Header */
                 .header { background: #6b9e78; padding: 25px; text-align: center; }
                 .header img { margin: 0 auto; max-width: 140px; }
                 .header h1 { color: #fffcf7; font-size: 24px; font-weight: 400; margin-top: 10px; letter-spacing: 1px; }
     
                 /* Content */
                 .content { padding: 25px; }
                 .content p { font-size: 16px; margin-bottom: 15px; }
                 .greeting { font-size: 20px; font-weight: 400; color: #6b9e78; margin-bottom: 20px; font-style: italic; }
                 .info-table, .items-table { background: #f8f1e9; border: 1px solid #e6ddd1; border-radius: 6px; margin: 20px 0; width: 100%; }
                 .info-table td, .items-table td { padding: 10px 12px; font-size: 14px; }
                 .info-table td:first-child, .items-table td:first-child { font-weight: 500; color: #5a4a4a; }
                 .info-table td:last-child, .items-table td:last-child { color: #6b9e78; }
                 .items-table td:last-child { text-align: right; }
                 .items-table tr:not(:last-child) { border-bottom: 1px solid #e6ddd1; }
                 .cta { display: inline-block; background: #6b9e78; color: #fffcf7; padding: 10px 25px; border-radius: 20px; font-size: 14px; font-weight: 500; text-transform: uppercase; text-decoration: none; margin-top: 15px; }
                 .cta:hover { background: #7db38a; }
     
                 /* Footer */
                 .footer { background: #3a2e2e; padding: 15px; text-align: center; color: #d9c8b8; font-size: 12px; }
     
                 /* Responsive Design */
                 @media only screen and (max-width: 600px) {
                   .email-container { max-width: 100%; margin: 10px; border-radius: 6px; }
                   .header { padding: 20px; }
                   .header h1 { font-size: 20px; }
                   .content { padding: 20px; }
                   .content p { font-size: 14px; }
                   .greeting { font-size: 18px; }
                   .info-table td, .items-table td { display: block; width: 100%; text-align: left; padding: 8px; }
                   .items-table td:last-child { text-align: left; }
                   .cta { display: block; width: 100%; text-align: center; padding: 10px 20px; }
                   .footer { padding: 10px; font-size: 11px; }
                 }
               </style>
             </head>
             <body>
               <table class="email-container" align="center" border="0" cellpadding="0" cellspacing="0">
                 <!-- Header -->
                 <tr>
                   <td class="header">
                     <img src="https://cloud420.store/images/Cloud.png" alt="Cloud 420 Logo">
                     <h1>Order Confirmed, ${customerName}</h1>
                   </td>
                 </tr>
                 <!-- Main Content -->
                 <tr>
                   <td class="content">
                     <p class="greeting">Dear ${customerName},</p>
                     <p>We’re delighted to confirm your order with Cloud 420. It’s being prepared with the utmost care. Below are the details:</p>
                     <table class="info-table" border="0" cellpadding="0" cellspacing="0">
                       <tr>
                         <td>Order ID:</td>
                         <td>${cloudOrderId}</td>
                       </tr>
                       <tr>
                         <td>Total:</td>
                         <td>KES ${total.toFixed(2)}</td>
                       </tr>
                     </table>
                     ${
                       items.length > 0
                         ? `
                             <h3 style="font-size: 16px; color: #6b9e78; margin: 20px 0 10px; font-weight: 500;">Items Ordered</h3>
                             <table class="items-table" border="0" cellpadding="0" cellspacing="0">
                               ${items
                                 .map(
                                   (item) => `
                                     <tr>
                                       <td>${item.productId.name || 'Item'}</td>
                                       <td>x${item.quantity} - KES ${(item.productId.price * item.quantity).toFixed(2)}</td>
                                     </tr>
                                   `
                                 )
                                 .join('')}
                             </table>
                           `
                         : ''
                     }
                     <p>You’ll receive a shipping update soon. Track your order or contact us if you need assistance.</p>
                     <a href="https://cloud420.store/track-order?orderId=${cloudOrderId}" class="cta">Track Order</a>
                   </td>
                 </tr>
                 <!-- Footer -->
                 <tr>
                   <td class="footer">
                     <p>© ${new Date().getFullYear()} Cloud 420 • All rights reserved</p>
                   </td>
                 </tr>
               </table>
             </body>
             </html>
           `,
         };
     
         try {
           await transporter.sendMail(mailOptions);
           console.log(`Order confirmation email sent to ${customerEmail}`);
         } catch (error) {
           console.error('Error sending order confirmation email:', error);
           throw error;
         }
       },
     
       // Send Delivery Confirmation Email
       async sendDeliveryConfirmation({ customerName, customerEmail, cloudOrderId, total, items = [], deliveredAt }) {
         const mailOptions = {
           from: `Cloud 420 Store <${process.env.EMAIL_USER}>`,
           to: customerEmail,
           subject: 'Your Cloud 420 Order Has Arrived! 🌿',
           html: `
             <!DOCTYPE html>
             <html lang="en">
             <head>
               <meta charset="UTF-8">
               <meta name="viewport" content="width=device-width, initial-scale=1.0">
               <meta http-equiv="X-UA-Compatible" content="ie=edge">
               <style>
                 /* Reset and Base Styles */
                 * { margin: 0; padding: 0; box-sizing: border-box; }
                 body { font-family: 'Georgia', serif; background: #f8f1e9; color: #3a2e2e; line-height: 1.6; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; }
                 table { border-collapse: collapse; width: 100%; }
                 img { max-width: 100%; height: auto; display: block; }
                 a { color: #6b9e78; text-decoration: none; }
                 a:hover { text-decoration: underline; }
     
                 /* Container */
                 .email-container { max-width: 600px; width: 100%; margin: 20px auto; background: #fffcf7; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03); }
     
                 /* Header */
                 .header { background: #6b9e78; padding: 25px; text-align: center; }
                 .header img { margin: 0 auto; max-width: 140px; }
                 .header h1 { color: #fffcf7; font-size: 24px; font-weight: 400; margin-top: 10px; letter-spacing: 1px; }
     
                 /* Content */
                 .content { padding: 25px; }
                 .content p { font-size: 16px; margin-bottom: 15px; }
                 .greeting { font-size: 20px; font-weight: 400; color: #6b9e78; margin-bottom: 20px; font-style: italic; }
                 .info-table, .items-table { background: #f8f1e9; border: 1px solid #e6ddd1; border-radius: 6px; margin: 20px 0; width: 100%; }
                 .info-table td, .items-table td { padding: 10px 12px; font-size: 14px; }
                 .info-table td:first-child, .items-table td:first-child { font-weight: 500; color: #5a4a4a; }
                 .info-table td:last-child, .items-table td:last-child { color: #6b9e78; }
                 .items-table td:last-child { text-align: right; }
                 .items-table tr:not(:last-child) { border-bottom: 1px solid #e6ddd1; }
                 .cta { display: inline-block; background: #6b9e78; color: #fffcf7; padding: 10px 25px; border-radius: 20px; font-size: 14px; font-weight: 500; text-transform: uppercase; text-decoration: none; margin-top: 15px; }
                 .cta:hover { background: #7db38a; }
     
                 /* Footer */
                 .footer { background: #3a2e2e; padding: 15px; text-align: center; color: #d9c8b8; font-size: 12px; }
     
                 /* Responsive Design */
                 @media only screen and (max-width: 600px) {
                   .email-container { max-width: 100%; margin: 10px; border-radius: 6px; }
                   .header { padding: 20px; }
                   .header h1 { font-size: 20px; }
                   .content { padding: 20px; }
                   .content p { font-size: 14px; }
                   .greeting { font-size: 18px; }
                   .info-table td, .items-table td { display: block; width: 100%; text-align: left; padding: 8px; }
                   .items-table td:last-child { text-align: left; }
                   .cta { display: block; width: 100%; text-align: center; padding: 10px 20px; }
                   .footer { padding: 10px; font-size: 11px; }
                 }
               </style>
             </head>
             <body>
               <table class="email-container" align="center" border="0" cellpadding="0" cellspacing="0">
                 <!-- Header -->
                 <tr>
                   <td class="header">
                     <img src="https://cloud420.store/images/Cloud.png" alt="Cloud 420 Logo">
                     <h1>Your Order Has Arrived, ${customerName}</h1>
                   </td>
                 </tr>
                 <!-- Main Content -->
                 <tr>
                   <td class="content">
                     <p class="greeting">Dear ${customerName},</p>
                     <p>Your Cloud 420 order was delivered on ${new Date(deliveredAt).toLocaleString()}. We hope it brings you joy!</p>
                     <table class="info-table" border="0" cellpadding="0" cellspacing="0">
                       <tr>
                         <td>Order ID:</td>
                         <td>${cloudOrderId}</td>
                       </tr>
                       <tr>
                         <td>Total:</td>
                         <td>KES ${total.toFixed(2)}</td>
                       </tr>
                       <tr>
                         <td>Delivered:</td>
                         <td>${new Date(deliveredAt).toLocaleDateString()}</td>
                       </tr>
                     </table>
                     ${
                       items.length > 0
                         ? `
                             <h3 style="font-size: 16px; color: #6b9e78; margin: 20px 0 10px; font-weight: 500;">Delivered Items</h3>
                             <table class="items-table" border="0" cellpadding="0" cellspacing="0">
                               ${items
                                 .map(
                                   (item) => `
                                     <tr>
                                       <td>${item.productId.name || 'Item'}</td>
                                       <td>x${item.quantity} - KES ${(item.productId.price * item.quantity).toFixed(2)}</td>
                                     </tr>
                                   `
                                 )
                                 .join('')}
                             </table>
                           `
                         : ''
                     }
                     <p>Enjoy your purchase! Explore more or contact us if needed.</p>
                     <a href="https://cloud420.store/products" class="cta">Shop Again</a>
                   </td>
                 </tr>
                 <!-- Footer -->
                 <tr>
                   <td class="footer">
                     <p>© ${new Date().getFullYear()} Cloud 420 • All rights reserved</p>
                   </td>
                 </tr>
               </table>
             </body>
             </html>
           `,
         };
     
         try {
           await transporter.sendMail(mailOptions);
           console.log(`Delivery confirmation email sent to ${customerEmail}`);
         } catch (error) {
           console.error('Error sending delivery confirmation email:', error);
           throw error;
         }
       },
     
       // Send Verification Email
       async sendVerificationEmail({ customerName, customerEmail, verificationToken }) {
         const verificationUrl = `https://cloud420.store/auth/verify-email?token=${verificationToken}`;
         const mailOptions = {
           from: `Cloud 420 Store <${process.env.EMAIL_USER}>`,
           to: customerEmail,
           subject: 'Welcome to Cloud 420 – Verify Your Email 🌿',
           html: `
             <!DOCTYPE html>
             <html lang="en">
             <head>
               <meta charset="UTF-8">
               <meta name="viewport" content="width=device-width, initial-scale=1.0">
               <meta http-equiv="X-UA-Compatible" content="ie=edge">
               <style>
                 /* Reset and Base Styles */
                 * { margin: 0; padding: 0; box-sizing: border-box; }
                 body { font-family: 'Georgia', serif; background: #f8f1e9; color: #3a2e2e; line-height: 1.6; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; }
                 table { border-collapse: collapse; width: 100%; }
                 img { max-width: 100%; height: auto; display: block; }
                 a { color: #6b9e78; text-decoration: none; }
                 a:hover { text-decoration: underline; }
     
                 /* Container */
                 .email-container { max-width: 600px; width: 100%; margin: 20px auto; background: #fffcf7; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03); }
     
                 /* Header */
                 .header { background: #6b9e78; padding: 25px; text-align: center; }
                 .header img { margin: 0 auto; max-width: 140px; }
                 .header h1 { color: #fffcf7; font-size: 24px; font-weight: 400; margin-top: 10px; letter-spacing: 1px; }
     
                 /* Content */
                 .content { padding: 25px; }
                 .content p { font-size: 16px; margin-bottom: 15px; }
                 .greeting { font-size: 20px; font-weight: 400; color: #6b9e78; margin-bottom: 20px; font-style: italic; }
                 .cta { display: inline-block; background: #6b9e78; color: #fffcf7; padding: 10px 25px; border-radius: 20px; font-size: 14px; font-weight: 500; text-transform: uppercase; text-decoration: none; margin-top: 15px; }
                 .cta:hover { background: #7db38a; }
     
                 /* Footer */
                 .footer { background: #3a2e2e; padding: 15px; text-align: center; color: #d9c8b8; font-size: 12px; }
     
                 /* Responsive Design */
                 @media only screen and (max-width: 600px) {
                   .email-container { max-width: 100%; margin: 10px; border-radius: 6px; }
                   .header { padding: 20px; }
                   .header h1 { font-size: 20px; }
                   .content { padding: 20px; }
                   .content p { font-size: 14px; }
                   .greeting { font-size: 18px; }
                   .cta { display: block; width: 100%; text-align: center; padding: 10px 20px; }
                   .footer { padding: 10px; font-size: 11px; }
                 }
               </style>
             </head>
             <body>
               <table class="email-container" align="center" border="0" cellpadding="0" cellspacing="0">
                 <!-- Header -->
                 <tr>
                   <td class="header">
                     <img src="https://cloud420.store/images/Cloud.png" alt="Cloud 420 Logo">
                     <h1>Welcome, ${customerName}</h1>
                   </td>
                 </tr>
                 <!-- Main Content -->
                 <tr>
                   <td class="content">
                     <p class="greeting">Dear ${customerName},</p>
                     <p>Thank you for joining Cloud 420. Please verify your email address to begin your journey with us:</p>
                     <a href="${verificationUrl}" class="cta">Verify Email</a>
                     <p>If you didn’t register, kindly ignore this message.</p>
                   </td>
                 </tr>
                 <!-- Footer -->
                 <tr>
                   <td class="footer">
                     <p>© ${new Date().getFullYear()} Cloud 420 • All rights reserved</p>
                   </td>
                 </tr>
               </table>
             </body>
             </html>
           `,
         };
     
         try {
           await transporter.sendMail(mailOptions);
           console.log(`Verification email sent to ${customerEmail}`);
         } catch (error) {
           console.error('Error sending verification email:', error);
           throw error;
         }
       },
     };

module.exports = emailService;