const express = require('express');
const router = express.Router();
const axios = require('axios');
const Order = require('../models/order');

// POST route for checkout
router.post('/checkout', async (req, res) => {
    try {
        const { customerName, customerEmail, customerPhone, customerLocation, cartTotal } = req.body;

        // Validate all required fields
        if (!customerName || !customerEmail || !customerPhone || !customerLocation || !cartTotal) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        // Process checkout
        const newOrder = new Order({
            customerName,
            customerEmail,
            customerPhone,
            customerLocation,
            totalAmount: parseFloat(cartTotal),
        });

        // Save the order
        await newOrder.save();

        // Define UMS Pay API endpoint
        const umsPayEndpoint = 'https://api.umeskiasoftwares.com/api/v1/initiatestk';

        // Make a request to UMS Pay to initiate the STK push
        try {
            const response = await axios.post(umsPayEndpoint, {
                api_key: process.env.UMS_API_KEY,
                email: process.env.UMS_EMAIL,
                account_id: process.env.UMS_ACCOUNT_ID,
                totalAmount: parseFloat(cartTotal),
                msisdn: customerPhone,
                reference: newOrder._id.toString()
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        
            console.log('Response from UMS Pay:', response.data);
        
            if (response.data.success === '200') {
                const { transaction_request_id } = response.data;
                const paymentUrl = `https://api.umeskiasoftwares.com/api/v1/transactionstatus?api_key=${process.env.UMS_API_KEY}&email=${process.env.UMS_EMAIL}&transaction_request_id=${transaction_request_id}`;
                res.json({ success: true, paymentUrl });
            } else {
                res.status(500).json({ success: false, message: `Failed to initiate payment: ${response.data.message || 'Please try again.'}` });
            }
        } catch (error) {
            console.error('Error during payment initiation:', error.response ? error.response.data : error.message);
            res.status(500).json({ success: false, message: 'An error occurred while initiating payment. Please try again later.' });
        }
        
    } catch (error) {
        console.error('Error during checkout:', error.message);
        res.status(500).json({ success: false, message: 'An error occurred during checkout. Please try again later.' });
    }
});

module.exports = router;
