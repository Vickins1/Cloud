const express = require('express');
const router = express.Router();
const Order = require('../models/order'); // Ensure you have an Order model

// Route to handle payment success
router.get('/payment/success', (req, res) => {
    try {
        // Handle payment success logic
        // You may want to verify the payment status from UMS Pay here
        res.render('payment-success', { message: 'Payment successful!' });
    } catch (error) {
        console.error('Error handling payment success:', error);
        res.status(500).render('error', { message: 'Payment failed. Please try again.' });
    }
});

// Route to handle payment failure
router.get('/payment/failure', (req, res) => {
    try {
        // Handle payment failure logic
        res.render('payment-failure', { message: 'Payment failed. Please try again.' });
    } catch (error) {
        console.error('Error handling payment failure:', error);
        res.status(500).render('error', { message: 'An error occurred. Please try again.' });
    }
});

// Route to handle payment notification (webhook endpoint)
router.post('/payment/notification', async (req, res) => {
    try {
        const paymentData = req.body;
        
        // Handle payment notification from UMS Pay
        // Verify payment data and update order status
        const orderId = paymentData.order_id;
        const paymentStatus = paymentData.status;
        
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(400).send('Order not found');
        }

        order.status = paymentStatus === 'success' ? 'Completed' : 'Failed';
        await order.save();
        
        res.status(200).send('Notification received');
    } catch (error) {
        console.error('Error handling payment notification:', error);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
