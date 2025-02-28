const express = require('express');
const router = express.Router();
const Order = require('../models/order'); 

// Track order route
router.post('/track-order', async (req, res) => {
    const { orderId } = req.body;

    try {
        // Find the order by ID
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Send the order details as a JSON response
        res.json({
            success: true,
            order: {
                id: order._id,
                status: order.status,
                estimatedDelivery: order.estimatedDelivery,
                items: order.items // Adjust based on your order schema
            }
        });
    } catch (error) {
        console.error('Error tracking order:', error);
        res.status(500).json({ success: false, message: 'An error occurred' });
    }
});

module.exports = router;
