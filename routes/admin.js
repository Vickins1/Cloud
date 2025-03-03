const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Product = require('../models/product');
const Order = require('../models/order');
const Cart = require('../models/cart');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');

// Email transporter configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-email-password'
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.isAdmin) return next();
    req.flash('error_msg', 'Unauthorized access. Admins only.');
    res.redirect('/auth/login');
}

// Products - List
router.get('/products', isAdmin, async (req, res) => {
    try {
        const products = await Product.find();
        res.render('admin/products', { 
            products, 
            currentUser: req.user, 
            activePage: 'products'
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        req.flash('error_msg', 'Server error fetching products.');
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Products - Add
router.post('/products/add', isAdmin, upload.array('images', 10), async (req, res) => {
    try {
        const { name, price, description, stockQuantity, category } = req.body;
        const imagePaths = req.files.map(file => `/uploads/${file.filename}`);

        const product = new Product({
            name,
            price,
            description,
            stockQuantity,
            category,
            imageUrl: imagePaths[0],
            additionalImages: imagePaths.slice(1)
        });
        await product.save();
        req.flash('success_msg', 'Product added successfully.');
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Error adding product:', error);
        req.flash('error_msg', 'Failed to add product.');
        res.redirect('/admin/products');
    }
});

router.post('/products/edit', async (req, res) => {
    try {
        const { id, name, price, description, stockQuantity, category } = req.body;
        await Product.findByIdAndUpdate(id, {
            name,
            price,
            description,
            stockQuantity,
            category
        });
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating product");
    }
});


router.delete('/products/delete/:id', isAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        const imagePaths = [product.imageUrl, ...(product.additionalImages || [])];
        imagePaths.forEach(imagePath => {
            if (imagePath) {
                const fullPath = path.join(__dirname, '..', 'public', imagePath);
                fs.unlink(fullPath, (err) => {
                    if (err) console.error(`Failed to delete image ${fullPath}:`, err);
                });
            }
        });
        await Product.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Product deleted' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// Dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const productCount = await Product.countDocuments();
        const orderCount = await Order.countDocuments();
        const totalSales = await Order.aggregate([
            { $match: { status: 'Completed' } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } } } }
        ]);
        const orders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('items.productId');

        const enrichedOrders = orders.map(order => {
            if (!order.total) {
                order.total = order.items.reduce((sum, item) => sum + (item.quantity * (item.productId?.price || 0)), 0);
            }
            return order;
        });

        res.render('admin/dashboard', {
            userCount,
            productCount,
            orderCount,
            totalSales: totalSales[0]?.total || 0,
            orders: enrichedOrders,
            currentUser: req.user
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Users - List
router.get('/users', isAdmin, async (req, res) => {
    try {
        const users = await User.find();
        res.render('admin/users', { users, currentUser: req.user });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Users - Delete
router.delete('/users/delete/:id', isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'User deleted' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Products - List
router.get('/products', isAdmin, async (req, res) => {
    try {
        const products = await Product.find();
        res.render('admin/products', { products, currentUser: req.user });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Products - List
router.get('/products', isAdmin, async (req, res) => {
    try {
        const products = await Product.find();
        res.render('admin/products', { products, currentUser: req.user, activePage: 'products' });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Products - Add
router.post('/products/add', isAdmin, upload.array('images', 10), async (req, res) => {
    try {
        const { name, price, description, stockQuantity, category } = req.body;
        const imagePaths = req.files.map(file => `/uploads/${file.filename}`); // Array of image URLs

        const product = new Product({
            name,
            price,
            description,
            stockQuantity,
            category,
            imageUrl: imagePaths[0], 
            additionalImages: imagePaths.slice(1) // Additional images
        });
        await product.save();
        req.flash('success_msg', 'Product added successfully.');
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Error adding product:', error);
        req.flash('error_msg', 'Failed to add product.');
        res.redirect('/admin/products');
    }
});

// Products - Delete
router.delete('/products/delete/:id', isAdmin, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Product deleted' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Products - Delete
router.delete('/products/delete/:id', isAdmin, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Product deleted' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/orders',isAdmin, async (req, res) => {
    try {
        const orders = await Order.find().populate('items.productId');
        const paymentStatusOptions = [
            { value: 'Pending', label: 'Pending' },
            { value: 'Paid', label: 'Paid' },
            { value: 'Failed', label: 'Failed' },
            { value: 'Refunded', label: 'Refunded' }
        ];

        const enhancedOrders = orders.map(order => ({
            ...order._doc,
            paymentStatusOptions: paymentStatusOptions.map(option => ({
                ...option,
                selected: option.value === order.paymentStatus
            }))
        }));

        res.render('admin/orders', { 
            orders: enhancedOrders,
            success: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        req.flash('error', 'Failed to load orders');
        res.render('admin/orders', { orders: [], success: req.flash('success'), error: req.flash('error') });
    }
});


// Confirm payment route
router.post('/orders/confirm-payment', async (req, res) => {
    const { orderId, customerEmail, customerName } = req.body;
    try {
        await Order.findByIdAndUpdate(orderId, { paymentStatus: 'Paid' });

        const mailOptions = {
            from: 'your-email@gmail.com',
            to: customerEmail,
            subject: 'Order Payment Confirmation',
            html: `
                <h2>Payment Confirmed</h2>
                <p>Dear ${customerName},</p>
                <p>Your payment for Order #${orderId} has been successfully confirmed.</p>
                <p>Thank you for your purchase!</p>
            `
        };

        await transporter.sendMail(mailOptions);
        req.flash('success', 'Payment confirmed and email sent');
        res.redirect('/admin/orders');
    } catch (error) {
        console.error('Error confirming payment:', error);
        req.flash('error', 'Failed to confirm payment');
        res.redirect('/admin/orders');
    }
});

// Update shipping status route
router.post('/orders/update-shipping-status', async (req, res) => {
    const { orderId, shippingStatus } = req.body;
    try {
        await Order.findByIdAndUpdate(orderId, { shippingStatus });
        req.flash('success', `Shipping status updated to ${shippingStatus}`);
        res.redirect('/admin/orders');
    } catch (error) {
        console.error('Error updating shipping status:', error);
        req.flash('error', 'Failed to update shipping status');
        res.redirect('/admin/orders');
    }
});

// Delete order route
router.post('/orders/delete', async (req, res) => {
    const { orderId } = req.body;
    try {
        await Order.findByIdAndDelete(orderId);
        req.flash('success', 'Order deleted successfully');
        res.redirect('/admin/orders');
    } catch (error) {
        console.error('Error deleting order:', error);
        req.flash('error', 'Failed to delete order');
        res.redirect('/admin/orders');
    }
});

// Orders - Add (manual order creation)
router.get('/orders/add', isAdmin, async (req, res) => {
    const products = await Product.find();
    res.render('admin/add-order', { products, currentUser: req.user });
});

router.post('/orders/add', isAdmin, async (req, res) => {
    try {
        const { customerName, customerEmail, customerPhone, customerLocation, items, status } = req.body;
        const orderItems = JSON.parse(items).map(item => ({
            productId: item.productId,
            quantity: parseInt(item.quantity)
        }));
        const total = orderItems.reduce(async (sum, item) => {
            const product = await Product.findById(item.productId);
            return sum + (item.quantity * (product?.price || 0));
        }, 0);

        const order = new Order({
            customerName,
            customerEmail,
            customerPhone,
            customerLocation,
            items: orderItems,
            total,
            status: status || 'Pending'
        });
        await order.save();
        req.flash('success_msg', 'Order added successfully.');
        res.redirect('/admin/orders');
    } catch (error) {
        console.error('Error adding order:', error);
        req.flash('error_msg', 'Failed to add order.');
        res.redirect('/admin/orders/add');
    }
});

// Carts - List (optional, for monitoring active carts)
router.get('/carts', isAdmin, async (req, res) => {
    try {
        const carts = await Cart.find().populate('products.productId');
        res.render('admin/carts', { carts, currentUser: req.user });
    } catch (error) {
        console.error('Error fetching carts:', error);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Carts - List
router.get('/carts', isAdmin, async (req, res) => {
    try {
        const carts = await Cart.find()
            .populate('userId', 'username') // Populate username from User
            .populate('products.productId'); // Populate product details
        res.render('admin/carts', { carts, currentUser: req.user, activePage: 'carts' });
    } catch (error) {
        console.error('Error fetching carts:', error);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Carts - Delete
router.delete('/carts/delete/:id', isAdmin, async (req, res) => {
    try {
        const cart = await Cart.findByIdAndDelete(req.params.id);
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }
        res.status(200).json({ success: true, message: 'Cart deleted' });
    } catch (error) {
        console.error('Error deleting cart:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Carts 
router.get('/carts/clear-all', isAdmin, async (req, res) => {
    try {
        await Cart.deleteMany({});
        req.flash('success_msg', 'All carts cleared successfully.');
        res.redirect('/admin/carts');
    } catch (error) {
        console.error('Error clearing carts:', error);
        req.flash('error_msg', 'Failed to clear carts.');
        res.redirect('/admin/carts');
    }
});

// Transactions - List
router.get('/transactions', isAdmin, async (req, res) => {
    try {
        // Fetch completed orders as transactions
        const transactions = await Order.find({ status: 'Completed' })
            .populate('items.productId')
            .sort({ updatedAt: -1 });
        res.render('admin/transactions', { 
            transactions, 
            currentUser: req.user, 
            activePage: 'transactions' 
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        req.flash('error_msg', 'Server error fetching transactions.');
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Settings - Display
router.get('/settings', isAdmin, async (req, res) => {
    try {
        res.render('admin/settings', { currentUser: req.user, activePage: 'settings' });
    } catch (error) {
        console.error('Error loading settings:', error);
        req.flash('error_msg', 'Server error loading settings.');
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Settings - Update
router.post('/settings/update', isAdmin, async (req, res) => {
    try {
        const { username, email, siteName } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        user.username = username;
        user.email = email;
        await user.save();
        // Note: siteName could be stored in a separate config model if needed
        res.status(200).json({ success: true, message: 'Settings updated' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/logout', isAdmin, (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            req.flash('error_msg', 'Error logging out.');
            return res.redirect('/admin/dashboard'); // Redirect to admin dashboard on error
        }
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
                return res.redirect('/admin/dashboard'); // Redirect to admin dashboard if session cleanup fails
            }
            res.redirect('/admin/login'); // Redirect to admin login page after successful logout
        });
    });
});




module.exports = router;