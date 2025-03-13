// routes/support.js
const express = require('express');
const router = express.Router();
const SupportMessage = require('../models/supportMessage');
const User = require('../models/user');
const Cart = require('../models/cart');
const emailService = require('../services/emailService');

// GET Support Page
router.get('/', async (req, res) => {
       try {
              
              const userId = req.user ? req.user._id : null;
              let cartItems = 0;
              if (userId) {
                  const cart = await Cart.findOne({ userId });
                  cartItems = cart ? cart.products.length : 0;
              }
           res.render('support', {
               cartItems,
               success_msg: req.flash('success'),
               error_msg: req.flash('error')
           });
       } catch (error) {
           console.error('Error loading support page:', error);
           req.flash('error', 'Failed to load support page.');
           res.redirect('/');
       }
   });

// Submit Support Message
router.post('/submit', async (req, res) => {
       const { name, email, order, message } = req.body;
   
       try {
           const newMessage = new SupportMessage({
               name,
               email,
               orderNumber: order || '',
               message,
           });
           await newMessage.save();
           req.flash('success_msg', 'Support request submitted successfully!');
           res.redirect('/support'); // Redirect to the support page
       } catch (error) {
           req.flash('error_msg', 'Failed to submit request. Please try again.');
           res.redirect('/support'); // Redirect to the support page
       }
   });

// Reply to Support Message (Admin)
router.post('/reply', isAdmin, async (req, res) => {
    const { messageId, reply } = req.body;

    try {
        const message = await SupportMessage.findById(messageId);
        if (!message) {
            req.flash('error', 'Message not found.');
            return res.redirect('/support/comms');
        }

        message.reply = reply;
        message.status = 'Resolved';
        await message.save();

        // Send email using emailService
        await emailService.sendSupportReply({
            customerName: message.name,
            customerEmail: message.email,
            messageId: message._id.toString(),
            originalMessage: message.message,
            reply,
            host: req.get('host'),
        });

        req.flash('success', `Reply sent successfully to ${message.email}!`);
        res.redirect('/support/comms');
    } catch (error) {
        console.error('Error sending support reply:', error);
        req.flash('error', 'Failed to send reply. Please try again.');
        res.redirect('/support/comms');
    }
});

function isAdmin(req, res, next) {
       if (req.isAuthenticated() && req.user.isAdmin) return next();
       req.flash('error_msg', 'Unauthorized access. Admins only.');
       res.redirect('/auth/login');
   }
   
router.get('/comms', isAdmin, async (req, res) => {
       try {
           const messages = await SupportMessage.find().sort({ createdAt: -1 }).lean();
           const user = req.user ? await User.findById(req.user._id).lean() : null;
   
           res.render('admin/comms', { 
               messages: messages || [],
               user: user || {},
               messageCount: user?.messageCount || 0,
               success_msg: req.flash('success'),
               error_msg: req.flash('error')
           });
       } catch (error) {
           console.error('Error loading comms page:', error);
           req.flash('error', 'Failed to load communications.');
           res.redirect('auth/login');
       }
   });

module.exports = router;