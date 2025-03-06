const express = require('express');
const router = express.Router();
const Cart = require('../models/cart');
const axios = require('axios');
const Order = require('../models/order');
const Transaction = require('../models/transaction');
const emailService = require('../services/emailService');

// Define pendingOrders at module scope
const pendingOrders = new Map();

// Middleware to check if the user is logged in
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/login');
}

async function processPaymentVerification(transactionRequestId) {
    try {
        const verification = await verifyPaymentStatus(transactionRequestId);
        console.log(`Verification result for ${transactionRequestId}:`, verification);

        const { orderData, transactionData } = pendingOrders.get(transactionRequestId) || {};

        if (!orderData || !transactionData) {
            console.log(`No pending order found for ${transactionRequestId}`);
            return;
        }

        if (verification.ResultCode === '200' && verification.TransactionStatus === 'Completed') {
            orderData.paymentStatus = 'completed';
            orderData.transactionRequestId = transactionRequestId;
            orderData.paymentDetails = verification;

            const order = new Order(orderData);
            await order.save();

            transactionData.orderId = order._id;
            transactionData.status = 'Completed';
            transactionData.gatewayResponse = verification;

            const transaction = new Transaction(transactionData);
            await transaction.save();

            // Use email service for confirmation
            await emailService.sendOrderConfirmation({
                customerName: orderData.customerName,
                customerEmail: orderData.customerEmail,
                cloudOrderId: order._id,
                total: orderData.total,
                items: orderData.items.map(item => ({
                    productId: { name: item.productId.name || 'Product', _id: item.productId }, // Adjust based on your product data
                    quantity: item.quantity,
                    price: item.price
                })),
                host: process.env.APP_HOST || 'cloud420.store'
            });

            pendingOrders.delete(transactionRequestId);
            console.log(`Payment completed for order: ${order._id}`);
        } else if (verification.ResultCode === '503' || 
                   verification.TransactionStatus === 'Failed' || 
                   ['1032', '1037', '1025', '9999', '2001', '1019', '1001'].includes(verification.ResultCode)) {
            transactionData.status = 'Failed';
            transactionData.gatewayResponse = verification;
            const transaction = new Transaction(transactionData);
            await transaction.save();

            // Optional: Send failure notification
            await emailService.sendPaymentFailureNotification({
                customerEmail: orderData.customerEmail,
                transactionRequestId
            });

            pendingOrders.delete(transactionRequestId);
            console.log(`Payment failed for transaction: ${transactionRequestId}`, verification);
        }
    } catch (error) {
        console.error(`Error verifying ${transactionRequestId}:`, error);
        if (error.name === 'ValidationError') {
            console.error('Validation errors:', error.errors);
        }
    }
}

// Initiate STK Push
router.post('/initiate-payment', isLoggedIn, async (req, res) => {
    const { customerName, customerEmail, customerPhone, customerLocation, cartTotal } = req.body;

    try {
        if (!customerName || !customerEmail || !customerPhone || !customerLocation || !cartTotal) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const cart = req.session.cart || [];
        if (!cart.length) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        const deliveryLocations = {
            'Kutus': 0, 'Kerugoya': 100, /* ... rest of your locations ... */
        };
        
        const calculatedDeliveryFee = deliveryLocations[customerLocation] || 250;
        const calculatedSubtotal = cart.reduce((sum, item) => sum + (item.productId.price * item.quantity), 0);
        const calculatedTotal = calculatedSubtotal + calculatedDeliveryFee;

        if (Math.abs(parseFloat(cartTotal) - calculatedTotal) > 0.01) {
            return res.status(400).json({ success: false, message: 'Total amount mismatch' });
        }

        const orderData = {
            customerName: customerName.trim(),
            customerEmail: customerEmail.trim(),
            customerPhone: customerPhone.trim(),
            customerLocation: customerLocation.trim(),
            total: calculatedTotal,
            items: cart.map(item => ({
                productId: item.productId._id || item.productId,
                quantity: item.quantity,
                price: item.productId.price
            })),
            paymentStatus: 'pending',
            shippingStatus: 'processing',
            transactionRequestId: null,
            paymentDetails: {},
            createdAt: new Date()
        };

        const transactionReference = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const stkPayload = {
            api_key: process.env.UMS_API_KEY,
            email: process.env.UMS_EMAIL,
            account_id: process.env.UMS_ACCOUNT_ID,
            amount: calculatedTotal,
            msisdn: customerPhone.replace(/^0/, '254'),
            reference: transactionReference
        };

        const stkResponse = await axios.post(
            'https://api.umeskiasoftwares.com/api/v1/intiatestk',
            stkPayload,
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        ).catch(error => {
            throw {
                message: 'STK Push request failed',
                details: error.response?.data || error.message,
                status: error.response?.status || 500
            };
        });

        const stkData = stkResponse.data;
        if (stkData.success === '200' && stkData.tranasaction_request_id) {
            const transactionRequestId = stkData.tranasaction_request_id;

            const transactionData = {
                orderId: null,
                transactionRequestId,
                amount: calculatedTotal,
                status: 'Pending',
                paymentMethod: 'Mobile',
                customerPhone: stkPayload.msisdn,
                paymentReference: transactionReference
            };

            pendingOrders.set(transactionRequestId, { orderData, transactionData });
            req.session.cart = [];

            setImmediate(() => processPaymentVerification(transactionRequestId));

            return res.json({
                success: true,
                message: 'STK Push initiated. Please check your phone.',
                transactionRequestId,
                orderReference: transactionReference
            });
        } else {
            throw { message: 'STK Push initiation failed', details: stkData };
        }
    } catch (error) {
        console.error('Payment initiation error:', error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Failed to initiate payment',
            details: error.details || 'Please try again later'
        });
    }
});

// Verify payment status
async function verifyPaymentStatus(transactionRequestId) {
    try {
        const verifyPayload = {
            api_key: process.env.UMS_API_KEY,
            email: process.env.UMS_EMAIL,
            transaction_request_id: transactionRequestId
        };

        const response = await axios.post(
            'https://api.umeskiasoftwares.com/api/v1/transactionstatus',
            verifyPayload,
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );

        return response.data;
    } catch (error) {
        console.error('Payment verification failed:', error.response?.data || error.message);
        throw {
            message: 'Verification request failed',
            details: error.response?.data || error.message,
            status: error.response?.status || 500
        };
    }
}

// Simplified periodic cleanup (runs every 5 minutes)
setInterval(async () => {
    const now = Date.now();
    for (const [transactionRequestId, { orderData, transactionData }] of pendingOrders) {
        if ((now - orderData.createdAt) > 1000 * 60 * 30) { // 30 minutes timeout
            transactionData.status = 'Failed';
            transactionData.gatewayResponse = { message: 'Payment timeout', ResultCode: 'TIMEOUT' };
            pendingOrders.delete(transactionRequestId);
            console.log(`Cleaned up expired transaction: ${transactionRequestId}`);
        }
    }
}, 1000 * 60 * 5);

// Updated verify payment endpoint
router.get('/verify-payment/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const verification = await verifyPaymentStatus(transactionId);
        const pendingOrder = pendingOrders.get(transactionId);

        const response = {
            status: verification.TransactionStatus?.toLowerCase() || 'pending',
            message: verification.message || 'Payment status updated',
            orderId: pendingOrder?.orderData?._id
        };

        if (verification.ResultCode === '200' && verification.TransactionStatus === 'Completed') {
            response.status = 'completed';
            response.message = 'Payment successful!';
            pendingOrders.delete(transactionId); // Clean up on success
        } else if (verification.ResultCode === '503') {
            response.status = 'pending';
            response.message = 'Payment service unavailable, please wait';
        } else if (verification.TransactionStatus === 'Failed') {
            response.status = 'failed';
            response.message = 'Payment failed';
            pendingOrders.delete(transactionId); // Clean up on failure
        }

        res.json(response);
    } catch (error) {
        res.status(error.status || 500).json({ 
            status: 'error', 
            message: 'Verification error',
            details: error.details
        });
    }
});

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

// Order Confirmation Route
router.get('/order-confirmation/:orderId', isLoggedIn, async (req, res) => {
    try {
        const orderId = req.params.orderId;

        // Fetch order details
        const order = await Order.findById(orderId)
            .populate('items.productId', 'name price imageUrl') 
            .lean();

        if (!order) {
            req.flash('error_msg', 'Order not found');
            return res.redirect('/cart');
        }

        // Ensure the order belongs to the current user
        if (order.customerEmail !== req.user.email) {
            req.flash('error_msg', 'Unauthorized access to order');
            return res.redirect('/cart');
        }

        // Format order data for display
        const orderDetails = {
            orderId: order._id,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            customerPhone: order.customerPhone,
            customerLocation: order.customerLocation,
            total: order.total,
            paymentStatus: order.paymentStatus,
            shippingStatus: order.shippingStatus,
            transactionRequestId: order.transactionRequestId,
            createdAt: new Date(order.createdAt).toLocaleString(),
            items: order.items.map(item => ({
                productName: item.productId.name,
                quantity: item.quantity,
                price: item.productId.price,
                imageUrl: item.productId.imageUrl,
                subtotal: (item.quantity * item.productId.price).toFixed(2)
            })),
            subtotal: order.items.reduce((sum, item) => sum + (item.quantity * item.productId.price), 0).toFixed(2),
            deliveryFee: (order.total - order.items.reduce((sum, item) => sum + (item.quantity * item.productId.price), 0)).toFixed(2)
        };

        res.render('order-confirmation', {
            order: orderDetails,
            currentUser: req.user,
            activePage: 'orders',
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error fetching order confirmation:', error);
        req.flash('error_msg', 'Failed to load order confirmation');
        res.redirect('/cart');
    }
});

module.exports = router;