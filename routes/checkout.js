const express = require('express');
const router = express.Router();
const axios = require('axios');
const Order = require('../models/order'); 

// UMS Pay API configuration
const UMS_API_KEY = 'VE5MTlkzRk06MTlwNjlkZWM=';
const UMS_EMAIL = 'vickinstechnologies@gmail.com';
const UMS_ACCOUNT_ID = 'UMPAY772831690'; 
const UMS_BASE_URL = 'https://api.umeskiasoftwares.com/api/v1';

// Checkout endpoint
router.post('/checkout', async (req, res) => {
    const { customerName, customerEmail, customerPhone, customerLocation, cartTotal, cart } = req.body;

    try {
        const order = new Order({
            customerName,
            customerEmail,
            customerPhone,
            customerLocation,
            total: cartTotal,
            items: cart.map(item => ({
                productId: item.productId._id || item.productId,
                quantity: item.quantity
            })),
            status: 'Pending',
            createdAt: new Date()
        });
        await order.save();

        const stkPayload = {
            api_key: UMS_API_KEY,
            email: UMS_EMAIL,
            account_id: UMS_ACCOUNT_ID,
            amount: cartTotal,
            msisdn: customerPhone.startsWith('0') ? `254${customerPhone.slice(1)}` : customerPhone,
            reference: order._id.toString()
        };

        const stkResponse = await axios.post(`${UMS_BASE_URL}/intiatestk`, stkPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const stkData = stkResponse.data;
        if (stkData.success === '200') {
            order.transactionRequestId = stkData.tranasaction_request_id;
            await order.save();

            req.session.cart = []; // Clear cart
            return res.json({
                success: true,
                transaction_request_id: stkData.tranasaction_request_id,
                message: 'Order created and STK Push initiated.'
            });
        } else {
            return res.json({
                success: false,
                message: 'STK Push initiation failed.'
            });
        }
    } catch (error) {
        console.error('Checkout error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred during checkout.'
        });
    }
});

// Transaction status endpoint
router.post('/transaction-status', async (req, res) => {
    const { transaction_request_id } = req.body;

    try {
        const statusPayload = {
            api_key: UMS_API_KEY,
            email: UMS_EMAIL,
            tranasaction_request_id: transaction_request_id
        };

        const statusResponse = await axios.post(`${UMS_BASE_URL}/transactionstatus`, statusPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const statusData = statusResponse.data;
        if (statusData.ResultCode === '200') {
            const order = await Order.findOne({ transactionRequestId: transaction_request_id });
            if (order) {
                if (statusData.TransactionStatus === 'Completed') {
                    order.status = 'Paid';
                    order.paymentDetails = statusData;
                    await order.save();
                    return res.json({ success: true, status: 'Completed', details: statusData });
                } else if (statusData.TransactionCode !== '0') {
                    order.status = 'Failed';
                    order.paymentDetails = statusData;
                    await order.save();
                    return res.json({ success: false, status: statusData.TransactionStatus, details: statusData });
                } else {
                    return res.json({ success: true, status: 'Pending', details: statusData });
                }
            } else {
                return res.status(404).json({ success: false, message: 'Order not found.' });
            }
        } else {
            return res.json({ success: false, status: 'Unknown', details: statusData });
        }
    } catch (error) {
        console.error('Transaction status error:', error);
        return res.status(500).json({ success: false, message: 'Error checking transaction status.' });
    }
});

module.exports = router;