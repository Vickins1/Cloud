const express = require('express');
const router = express.Router();
const Cart = require('../models/cart');
const axios = require('axios');
const Order = require('../models/order');
const Transaction = require('../models/transaction');
const emailService = require('../services/emailService');
const dotenv = require('dotenv');

// Define pendingOrders at module scope
const pendingOrders = new Map();

const generateOrderId = () => {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    return `CLOUD-${randomNum}`;
};

// Middleware to check if the user is logged in
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/login');
}


router.post('/initiate-payment', isLoggedIn, async (req, res) => {
    const { customerName, customerEmail, customerPhone, customerLocation, cartTotal } = req.body;

    try {
        // Validate input
        if (!customerName || !customerEmail || !customerPhone || !customerLocation || !cartTotal) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const cart = req.session.cart || [];
        if (!cart.length) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        // Calculate delivery fee
        const deliveryLocations = {
            'Kutus': 50, 'Kerugoya': 50, 'Kagio': 50, 'Sagana': 80, 'Karatina': 150,
            'Embu': 150, "Murang'a": 150, 'Nyeri': 150, 'Thika': 200, 'Nairobi': 200,
            'Machakos': 350, 'Meru': 350, 'Nanyuki': 400, 'Mwea': 100,
            'Kirinyaga University': 50, 'Kangai': 50, 'Kiamutugu': 50, 'Baricho': 50,
            "Wang'uru": 100, 'Makutano': 100
        };

        const calculatedDeliveryFee = deliveryLocations[customerLocation] || 0;
        const calculatedSubtotal = cart.reduce((sum, item) => sum + (item.productId.price * item.quantity), 0);
        const calculatedTotal = calculatedSubtotal + calculatedDeliveryFee;

        if (parseFloat(cartTotal) !== calculatedTotal) {
            return res.status(400).json({ success: false, message: 'Total amount mismatch' });
        }

        // Create order data (not saved yet)
        const orderData = {
            customerName,
            customerEmail,
            customerPhone,
            customerLocation,
            total: calculatedTotal,
            items: cart.map(item => ({
                productId: item.productId._id || item.productId,
                quantity: item.quantity
            })),
            paymentStatus: 'Pending',
            shippingStatus: 'Processing',
            transactionRequestId: null,
            paymentDetails: {},
            createdAt: new Date()
        };

        // STK Push payload
        const stkPayload = {
            api_key: process.env.UMS_API_KEY,
            email: process.env.UMS_EMAIL,
            account_id: process.env.UMS_ACCOUNT_ID,
            amount: calculatedTotal,
            msisdn: customerPhone.startsWith('0') ? `254${customerPhone.slice(1)}` : customerPhone,
            reference: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` 
        };

        const stkResponse = await axios.post('https://api.umeskiasoftwares.com/api/v1/intiatestk', stkPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const stkData = stkResponse.data;
        if (stkData.success === '200') {
            const transactionRequestId = stkData.tranasaction_request_id;

            // Create transaction data 
            const transactionData = {
                orderId: null,
                transactionRequestId: transactionRequestId,
                amount: calculatedTotal,
                status: 'Pending',
                paymentMethod: 'Mobile',
                customerPhone: stkPayload.msisdn,
                paymentReference: stkPayload.reference
            };

            // Store in pendingOrders for verification
            pendingOrders.set(transactionRequestId, { orderData, transactionData });

            // Clear session cart
            req.session.cart = [];

            return res.json({
                success: true,
                message: 'STK Push initiated. Please check your phone to complete payment.',
                tranasaction_request_id: transactionRequestId,
                order_id: stkPayload.reference
            });
        } else {
            console.error('STK Push Error:', stkData);
            return res.status(500).json({
                success: false,
                message: 'Failed to initiate STK Push. Please try again later.',
                details: stkData
            });
        }
    } catch (error) {
        console.error('Payment initiation error:', error);
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred. Please try again later.',
            error: error.message
        });
    }
});

// Payment verification function
async function verifyPaymentStatus(transactionRequestId) {
    try {
        const verifyPayload = {
            api_key: process.env.UMS_API_KEY,
            email: process.env.UMS_EMAIL,
            tranasaction_request_id: transactionRequestId
        };

        const response = await axios.post('https://api.umeskiasoftwares.com/api/v1/transactionstatus', verifyPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        return response.data;
    } catch (error) {
        console.error('Payment verification failed:', error);
        throw error;
    }
}

// Periodic payment verification
setInterval(async () => {
    const now = new Date();
    for (const [transactionRequestId, { orderData, transactionData }] of pendingOrders) {
        try {
            const verification = await verifyPaymentStatus(transactionRequestId);
            console.log(`Verification result for ${transactionRequestId}:`, verification);

            // Check TransactionStatus and TransactionCode
            if (verification.ResultCode === '200' && verification.TransactionStatus === 'Completed') {
                // Update order data with verification details
                orderData.paymentStatus = 'completed';
                orderData.transactionRequestId = transactionRequestId;
                orderData.paymentDetails = verification;

                // Save order to database
                const order = new Order(orderData);
                await order.save();

                // Update transaction data with order ID
                transactionData.orderId = order._id;
                transactionData.status = 'Completed';
                transactionData.gatewayResponse = verification;

                // Save transaction to database
                const transaction = new Transaction(transactionData);
                await transaction.save();

                // Remove from pendingOrders
                pendingOrders.delete(transactionRequestId);
                console.log(`Payment completed and saved for order: ${order._id}`);
            } else if (verification.TransactionStatus === 'Failed' || 
                       ['1032', '1037', '1025', '9999', '2001', '1019', '1001'].includes(verification.TransactionCode)) {
                // Mark as failed but don’t save to database
                transactionData.status = 'Failed';
                transactionData.gatewayResponse = verification;
                pendingOrders.delete(transactionRequestId);
                console.log(`Payment failed for transaction: ${transactionRequestId}`);
            }

            // Cleanup expired pending orders 
            if (now - orderData.createdAt > 1000 * 60 * 30) {
                transactionData.status = 'Failed';
                transactionData.gatewayResponse = { message: 'Payment timeout' };
                pendingOrders.delete(transactionRequestId);
                console.log(`Cleaned up expired transaction: ${transactionRequestId}`);
            }
        } catch (error) {
            console.error(`Error verifying ${transactionRequestId}:`, error);
        }
    }
}, 1000 * 60 * 5);


// GET cart page
router.get('/', isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch cart from database first, then sync with session
        const cartData = await Cart.findOne({ userId }).populate('products.productId');
        let cart = cartData && cartData.products.length > 0 ? cartData.products : [];

        // Sync session with database
        req.session.cart = cart;

        // Calculate cart items and total
        const cartItems = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const total = cart.reduce((sum, item) => sum + ((item.productId?.price || 0) * (item.quantity || 1)), 0);

        res.render('cart', {
            cart,
            total: parseFloat(total) || 0,
            cartItems,
            isAuthenticated: true,
            error: null
        });
    } catch (error) {
        console.error('Error retrieving cart:', error);
        res.status(500).render('cart', {
            cart: [],
            total: 0,
            cartItems: 0,
            isAuthenticated: true,
            error: { message: 'An error occurred while fetching the cart.' }
        });
    }
});


// POST add item to cart
router.post('/add/:productId', isLoggedIn, async (req, res) => {
    try {
        const productId = req.params.productId;
        const userId = req.user._id;

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, products: [] });
        }

        const productIndex = cart.products.findIndex(p => p.productId.toString() === productId);
        if (productIndex >= 0) {
            cart.products[productIndex].quantity += 1;
        } else {
            cart.products.push({ productId, quantity: 1 });
        }

        await cart.save();
        res.status(200).json({ success: true, message: 'Product added to cart' });
    } catch (error) {
        console.error('Error adding product to cart:', error);
        res.status(500).json({ success: false, message: 'Failed to add product to cart' });
    }
});

router.post('/remove/:itemId', isLoggedIn, async (req, res) => {
    try {
        const { itemId } = req.params;
        const userId = req.user._id;

        // Use Mongoose $pull to remove the item using its _id
        const cart = await Cart.findOneAndUpdate(
            { userId },
            { $pull: { products: { _id: itemId } } }, // Removes based on item's _id
            { new: true }
        );

        if (!cart) {
            console.log('Cart not found');
            return res.redirect('/cart');
        }

        return res.redirect('/cart');
    } catch (error) {
        console.error('Remove error:', error);
        return res.redirect('/cart'); // Redirect even on error
    }
});

async function updateCartQuantity(userId, productId, newQuantity) {
    try {
        // Ensure quantity is at least 1
        if (newQuantity < 1) {
            throw new Error('Quantity must be at least 1');
        }

        // Find or create the user's cart
        const cart = await Cart.findOrCreate(userId);

        // Find the product in the cart
        const productIndex = cart.products.findIndex(p => p.productId.toString() === productId);

        if (productIndex !== -1) {
            // Update quantity if product exists
            cart.products[productIndex].quantity = newQuantity;
        } else {
            // If product is not in cart, add it
            cart.products.push({ productId, quantity: newQuantity });
        }

        // Save the updated cart
        await cart.save();
        return { success: true, message: 'Cart updated successfully', cart };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// POST update cart item quantity
router.post('/update/:productId', isLoggedIn, async (req, res) => {
    const { productId } = req.params;
    const { quantity } = req.body;
    const userId = req.user._id;

    const result = await updateCartQuantity(userId, productId, parseInt(quantity, 10));

    if (result.success) {
        res.redirect('/cart');
    } else {
        res.render('cart', { cart: result.cart, error: { itemId: productId, message: result.message } });
    }
});

// GET cart count
router.get('/cart-count', isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await Cart.findOne({ userId });
        const cartCount = cart ? cart.products.reduce((total, item) => total + (item.quantity || 0), 0) : 0;
        res.status(200).json({ success: true, cartCount });
    } catch (error) {
        console.error('Error fetching cart count:', error);
        res.status(500).json({ success: false, message: 'Error fetching cart count' });
    }
});

module.exports = router;