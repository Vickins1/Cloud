const express = require('express');
const router = express.Router();
const Cart = require('../models/cart');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const Order = require('../models/order');
const Transaction = require('../models/transaction');
const emailService = require('../services/emailService');
const Product = require('../models/product');
const PDFDocument = require('pdfkit');


// Define pendingOrders at module scope
const pendingOrders = new Map();

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/login');
}

// Verify payment status
async function verifyPaymentStatus(transactionRequestId) {
    try {
        const verifyPayload = {
            api_key: process.env.UMS_API_KEY,
            email: process.env.UMS_EMAIL,
            tranasaction_request_id: transactionRequestId // Fixed typo
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

// Process payment verification
async function processPaymentVerification(transactionRequestId) {
    try {
        const verification = await verifyPaymentStatus(transactionRequestId);
        console.log(`Verification result for ${transactionRequestId}:`, verification);

        const pendingOrder = pendingOrders.get(transactionRequestId);
        if (!pendingOrder) {
            console.log(`No pending order found for ${transactionRequestId}`);
            return { status: 'error', orderId: null, message: 'No pending order found' };
        }

        const { orderData, transactionData } = pendingOrder;

        if (verification.ResultCode === '200' && verification.TransactionStatus === 'Completed') {
            orderData.paymentStatus = 'completed';
            orderData.transactionRequestId = transactionRequestId;
            orderData.paymentDetails = verification;

            const order = new Order(orderData);
            await order.save();

            transactionData.orderId = order._id;
            transactionData.status = 'completed';
            transactionData.gatewayResponse = verification;

            const transaction = new Transaction(transactionData);
            await transaction.save();

            // Fetch product details with flair
            const enrichedItems = await Promise.all(orderData.items.map(async (item) => {
                const product = await Product.findById(item.productId);
                return {
                    productId: {
                        name: product?.name || item.productId.name || 'Mystery Goodie',
                        _id: item.productId
                    },
                    quantity: item.quantity,
                    price: item.price || product?.price || 0 // Fallback to 0 if no price
                };
            }));

            // Send Payment Confirmation Email
            await emailService.sendPaymentConfirmation({
                customerName: orderData.customerName,
                customerEmail: orderData.customerEmail,
                transactionRequestId,
                amount: orderData.total, // Assuming total is the payment amount
                host: process.env.APP_HOST || 'cloud420.store'
            });

            // Send Order Confirmation Email
            await emailService.sendOrderConfirmation({
                customerName: orderData.customerName,
                customerEmail: orderData.customerEmail,
                cloudOrderId: order._id,
                total: orderData.total,
                items: enrichedItems,
                host: process.env.APP_HOST || 'cloud420.store'
            });

            // Generate receipt for successful payment
            const receiptBuffer = await generateReceiptPDF({
                transactionRequestId,
                customerName: pendingOrder?.orderData?.customerName,
                amount: pendingOrder?.orderData?.amount || verification.amount
            });

            // Send JSON response with receipt info
            res.json({
                status: 'completed',
                orderId,
                message: 'Payment successful!',
                receipt: {
                    filename: `receipt-${transactionRequestId}.pdf`,
                    data: receiptBuffer.toString('base64'),
                    contentType: 'application/pdf'
                }
            });

            pendingOrders.delete(transactionRequestId);
            console.log(`Payment completed for order: ${order._id}`);
            return { status: 'completed', orderId: order._id, message: 'Payment successful' };
        } else if (
            verification.ResultCode === '503' ||
            verification.TransactionStatus === 'Failed' ||
            ['1032', '1037', '1025', '9999', '2001', '1019', '1001'].includes(verification.ResultCode)
        ) {
            transactionData.status = 'failed';
            transactionData.orderId = null;
            transactionData.gatewayResponse = verification;

            const transaction = new Transaction(transactionData);
            await transaction.save();

            // No change here since you didn't ask for failure email adjustment
            pendingOrders.delete(transactionRequestId);
            console.log(`Payment failed for transaction: ${transactionRequestId}`, verification);
            return { status: 'failed', orderId: null, message: 'Payment declined' };
        }
        return { status: 'pending', orderId: null, message: 'Payment still processing' };
    } catch (error) {
        console.error(`Error verifying ${transactionRequestId}:`, error);
        if (error.name === 'ValidationError') {
            console.error('Validation errors:', error.errors);
            return { status: 'error', orderId: null, message: 'Validation failed', details: error.errors };
        }
        return { status: 'error', orderId: null, message: error.message || 'Verification error' };
    }
}

// Define the PDF generation function
async function generateReceiptPDF({ transactionRequestId, customerName, amount }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        let buffers = [];

        // Collect buffer chunks
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(buffers);
            resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // PDF content
        doc.fontSize(16).text('Payment Receipt', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Transaction ID: ${transactionRequestId}`);
        doc.text(`Customer: ${customerName || 'N/A'}`);
        doc.text(`Amount: ${amount ? `KES ${amount}` : 'N/A'}`);
        doc.text(`Date: ${new Date().toLocaleString()}`);
        doc.moveDown();
        doc.text('Thank you for your purchase!', { align: 'center' });

        doc.end();
    });
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
            'Pick-Up':0,
            'Kutus': 50,
            'Kerugoya': 50,
            'Kagio': 100,
            'Sagana': 100,
            'Karatina': 150,
            'Embu University': 150,
            "Murang'a University": 200,
            'Nyeri': 250,
            'Thika': 200,
            'Nairobi': 200,
            'Machakos': 350,
            'Meru': 350,
            'Nanyuki': 400,
            'Mwea': 100,
            'Kiambu': 250,
            'Ruiru': 200,
            'Kikuyu': 300,
            'Karatina University': 150,
            'Mombasa': 1000,
            'Kisumu': 1000,
            'Eldoret': 1000,
            'Nakuru': 500,
            'Kisii': 1200,
            'Kakamega': 1000,
            'Kabarnet': 1000,
            'Kericho': 1000,
            'Kitale': 1200,
            'Bungoma': 1200,
            'Busia': 1200,
            'Kapsabet': 1000,
            'Kisii University': 1200,
            'Kisumu University': 1200,
            'Maseno University': 1200,
            'Moi University': 1200,
            'Egerton University': 600,
            'Masinde Muliro University': 1200,
            'Kirinyaga University': 50,
            'Kangai': 50,
            'Kiamutugu': 50,
            'Baricho': 100,
            "Wang'uru": 100,
            'Makutano': 150,
            'Juja': 200,
            'Embu': 200,
            "Murang'a": 200,
            'Kangema': 200,
            'Othaya': 200,
            'Mukurweini': 200,
            'Naromoru': 350,
            'Isiolo': 500,
            'Kitui': 500,
            'Wote': 500,
            'Gilgil': 400,
            'Naivasha': 400,
            'Limuru': 300,
            'Ngong': 350,
            'Ongata Rongai': 350,
            'Kitengela': 350,
            'Athi River': 350,
            'Malindi': 1200,
            'Lamu': 1500,
            'Voi': 1000,
            'Taveta': 1200,
            'Iten': 1000,
            'Kapenguria': 1200,
            'Lodwar': 1500,
            'Maralal': 600,
            'Rumuruti': 500,
            'Siaya': 1200,
            'Homa Bay': 1200,
            'Migori': 1200,
            'Keroka': 1000,
            'Nyamira': 1000,
            'Kilifi': 1200,
            'University of Nairobi': 200,
            'KCA University': 200,
            'Mount Kenya University': 200,
            'Kabarak University': 600,
            'Kaimosi Friends University': 1200,
            'Tom Mboya University': 1200,
            'Kenyatta University': 200,
            'Jomo Kenyatta University (JKUAT)': 200,
            'Technical University of Kenya': 200,
            'Technical University of Mombasa': 1200,
            'Dedan Kimathi University': 200,
            'Chuka University': 300,
            'Meru University': 350,
            'Multimedia University': 250,
            'South Eastern Kenya University': 500,
            'Pwani University': 1200,
            'Maasai Mara University': 1000,
            'University of Eldoret': 1200,
            'Kibabii University': 1200,
            'Rongo University': 1200,
            'Jaramogi Oginga Odinga University': 1200,
            'Laikipia University': 400,
            'Garissa University': 1200,
            'Taita Taveta University': 1200,
            'Bomet University College': 1000,
            'Strathmore University': 200,
            'USIU Africa': 250,
            'Gatundu': 250,
            'Kajiado': 400,
            'Namanga': 600,
            'Molo': 600,
            'Njoro': 600,
            'Ol Kalou': 400,
            'Nyandarua': 400,
            'Kinangop': 400,
            'Matuu': 350,
            'Mwingi': 500,
            'Nkubu': 350,
            'Chogoria': 300,
            'Timau': 400,
            'Marsabit': 1200,
            'Moyale': 1500,
            'Wajir': 1500,
            'Mandera': 1500,
            'Hola': 1200,
            'Mtwapa': 1200,
            'Ukunda': 1200,
            'Diani': 1200,
            'Msambweni': 1200,
            'Lunga Lunga': 1200,
            'Bondo': 1200,
            'Ugunja': 1200,
            'Mbale': 1200,
            'Webuye': 1200,
            'Kimilili': 1200,
            'Malaba': 1200,
            'Luanda': 1200,
            'Sotik': 1000,
            'Bomet': 1000,
            'Litein': 1000,
            'Londiani': 600,
            'Muhoroni': 1000,
            'Ahero': 1000,
            'Nyansiongo': 1000,
            'Oyugis': 1200,
            'Rachuonyo': 1200,
            'Kendubay': 1200,
            'Kehancha': 1200,
            'Isebania': 1200,
            'Suna': 1200,
            'Kapchorua': 1000,
            'Kapsowar': 1000,
            'Chepkorio': 1000,
            'Cheptais': 1200,
            'Kiminini': 1200,
            'Kaptumo': 1000,
            'Nandi Hills': 1000,
            'Kakuma': 1500,
            'Lokichoggio': 1500,
            'Archers Post': 600,
            'Laisamis': 1000,
            'Loiyangalani': 1500,
            'North Horr': 1500,
            'Sololo': 1500,
            'Kenya Methodist University': 350,
            'Pan Africa Christian University': 300,
            'Daystar University': 350,
            'Africa Nazarene University': 350,
            'Catholic University of Eastern Africa': 250,
            'KAG East University': 300,
            'Gretsa University': 200,
            'Zetech University': 200,
            'Riara University': 200,
            'Pioneer International University': 200,
            'Adventist University of Africa': 350,
            'Management University of Africa': 200,
            'Africa International University': 200,
            "St. Paul’s University": 300,
            'Presbyterian University of East Africa': 300,
            'Co-operative University of Kenya': 200,
            'Umma University': 400,
            'Lukenya University': 350,
            'Scott Christian University': 500,
            'Karatina Town': 150,
            'Kianyaga': 100,
            'Ngariama': 100,
            'Kibirigwi': 50,
            'Kagumo': 100,
            'Kamacharia': 200,
            'Kiganjo': 250,
            'Karaba': 150,
            'Diffathas': 100,
            'Mutira': 50,
            'Kithumbu': 50,
            'Kiamwathi': 50
        };
        
        const calculatedDeliveryFee = deliveryLocations[customerLocation] || 0;
        const calculatedSubtotal = cart.reduce((sum, item) => sum + (item.productId.price * item.quantity), 0);
        const calculatedTotal = calculatedSubtotal + calculatedDeliveryFee;

        if (parseFloat(cartTotal) !== calculatedTotal) {
            return res.status(400).json({ success: false, message: 'Total amount mismatch' });
        }

        const orderData = {
            customerName,
            customerEmail,
            customerPhone,
            customerLocation,
            total: calculatedTotal,
            items: cart.map(item => ({
                productId: item.productId._id || item.productId,
                quantity: item.quantity,
                price: item.productId.price
            })),
            paymentStatus: 'Pending',
            shippingStatus: 'Processing',
            transactionRequestId: null,
            paymentDetails: {},
            createdAt: new Date()
        };

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
            const transactionRequestId = stkData.tranasaction_request_id; // Fixed typo

            const transactionData = {
                orderId: null,
                transactionRequestId,
                amount: calculatedTotal,
                status: 'Pending',
                paymentMethod: 'Mobile',
                customerPhone: stkPayload.msisdn,
                paymentReference: stkPayload.reference
            };

            pendingOrders.set(transactionRequestId, { orderData, transactionData });

            req.session.cart = [];

            setImmediate(() => processPaymentVerification(transactionRequestId));

            return res.json({
                success: true,
                transactionRequestId, // Match frontend expectation
                message: 'STK Push initiated. Please check your phone to complete payment.'
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

// Verify payment endpoint
router.get('/verify-payment/:transactionRequestId', async (req, res) => {
    const { transactionRequestId } = req.params;
    try {
        const verification = await verifyPaymentStatus(transactionRequestId);
        const pendingOrder = pendingOrders.get(transactionRequestId);

        if (verification.ResultCode === '200' && verification.TransactionStatus === 'Completed') {
            // Ensure order is saved before responding
            if (pendingOrder && !pendingOrder.orderData._id) {
                await processPaymentVerification(transactionRequestId);
            }
            const orderId = pendingOrder?.transactionData?.orderId || null;
            res.json({
                status: 'completed',
                orderId,
                message: 'Payment successful!'
            });
        } else if (
            verification.ResultCode === '503' ||
            verification.TransactionStatus === 'Failed' ||
            ['1032', '1037', '1025', '9999', '2001', '1019', '1001'].includes(verification.ResultCode)
        ) {
            if (pendingOrder) {
                await processPaymentVerification(transactionRequestId);
            }
            res.json({
                status: 'failed',
                orderId: null,
                message: verification.message || 'Payment failed'
            });
        } else {
            res.json({
                status: 'pending',
                orderId: null,
                message: 'Payment still processing'
            });
        }
    } catch (error) {
        res.status(error.status || 500).json({
            status: 'error',
            orderId: null,
            message: 'Verification error',
            details: error.details
        });
    }
});

// Periodic cleanup
setInterval(async () => {
    const now = Date.now();
    for (const [transactionRequestId, { orderData, transactionData }] of pendingOrders.entries()) {
        if ((now - orderData.createdAt.getTime()) > 1000 * 60 * 30) { // 30 minutes
            try {
                transactionData.status = 'Failed';
                transactionData.gatewayResponse = { message: 'Payment timeout', ResultCode: 'TIMEOUT' };
                const transaction = new Transaction(transactionData);
                await transaction.save();

                await emailService.sendPaymentFailureNotification({
                    customerEmail: orderData.customerEmail,
                    transactionRequestId
                });

                pendingOrders.delete(transactionRequestId);
                console.log(`Cleaned up expired transaction: ${transactionRequestId}`);
            } catch (error) {
                console.error(`Error cleaning up ${transactionRequestId}:`, error);
            }
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

// My Orders Page
router.get('/my-orders', isLoggedIn, async (req, res) => {
    try {
        let perPage = 5; // Fewer per page for a sleek look
        let page = parseInt(req.query.page) || 1;

        // Fetch total orders
        const totalOrders = await Order.countDocuments({ customerEmail: req.user.email });
        const totalPages = Math.ceil(totalOrders / perPage);

        // Fetch orders
        const orders = await Order.find({ customerEmail: req.user.email })
            .sort({ createdAt: -1 }) // Newest first
            .skip((page - 1) * perPage)
            .limit(perPage)
            .lean();

        // Enrich orders with status flair
        const enrichedOrders = orders.map(order => ({
            ...order,
            orderId: order._id,
            total: Number(order.total).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,'),
            createdAt: new Date(order.createdAt),
            paymentStatus: order.paymentStatus || 'pending',
            shippingStatus: order.shippingStatus || 'Not Shipped',
            itemsCount: order.items.length
        }));

        // Fetch cart items count (assuming a Cart model exists)
        const cart = await Cart.findOne({ userEmail: req.user.email }).lean();
        const cartItems = cart ? cart.items.length : 0; // Default to 0 if no cart exists

        res.render('my-orders', {
            orders: enrichedOrders,
            totalPages,
            currentPage: page,
            user: req.user,
            cartItems, // Add cartItems here
            success_msg: req.flash('success'),
            error_msg: req.flash('error'),
            cosmicTime: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching my orders:', error);
        req.flash('error', 'Failed to load your cosmic orders!');
        res.render('my-orders', {
            orders: [],
            totalPages: 1,
            currentPage: 1,
            user: req.user,
            cartItems: 0, // Default to 0 on error
            success_msg: req.flash('success'),
            error_msg: req.flash('error'),
            cosmicTime: new Date().toISOString()
        });
    }
});

// POST remove item from cart
router.post('/remove/:itemId', isLoggedIn, async (req, res) => {
    try {
        const { itemId } = req.params;
        const userId = req.user._id;

        // Use Mongoose $pull to remove the item using its _id
        const cart = await Cart.findOneAndUpdate(
            { userId },
            { $pull: { products: { _id: itemId } } },
            { new: true }
        );

        if (!cart) {
            console.log('Cart not found');
            return res.redirect('/cart');
        }

        return res.redirect('/cart');
    } catch (error) {
        console.error('Remove error:', error);
        return res.redirect('/cart');
    }
});

// Update cart item quantity
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

router.get('/order-confirmation/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { status, message } = req.query;

    try {
        let order = null;
        if (orderId !== 'null') {
            order = await Order.findById(orderId)
                .populate('items.productId')
                .lean();
            if (!order) {
                return res.status(404).render('order-confirmation', {
                    order: null,
                    status: 'error',
                    message: 'Order not found'
                });
            }
            // Add calculated fields
            order.subtotal = order.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
            order.deliveryFee = order.total - order.subtotal;
            order.items = order.items.map(item => ({
                productName: item.productId.name,
                quantity: item.quantity,
                price: item.price,
                subtotal: item.quantity * item.price
            }));
        }

        res.render('order-confirmation', {
            order,
            status: status || (order ? 'success' : 'warning'),
            message: message || (order ? 'Your order has been placed successfully!' : 'No order details available'),
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Order confirmation error:', error);
        res.status(500).render('order-confirmation', {
            order: null,
            status: 'error',
            message: 'An error occurred while loading your order'
        });
    }
});

module.exports = router;
