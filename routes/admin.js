const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Product = require('../models/product');
const Order = require('../models/order');
const Cart = require('../models/cart');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const Transaction = require('../models/transaction');
const emailService = require('../services/emailService');
const fs = require('fs');


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


router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const [userCount, productCount, orderCount] = await Promise.all([
            User.countDocuments(),
            Product.countDocuments(),
            Order.countDocuments()
        ]);

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const totalSalesResult = await Order.aggregate([
            { $match: { status: 'Completed' } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } } } }
        ]);
        const totalSales = totalSalesResult[0]?.total || 0;

        const monthlyRevenueResult = await Order.aggregate([
            { $match: { status: 'Completed', createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } } } }
        ]);
        const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;

        const [pendingOrders, completedOrders] = await Promise.all([
            Order.countDocuments({ status: 'Pending' }),
            Order.countDocuments({ status: 'Completed' })
        ]);

        const newUsersThisMonth = await User.countDocuments({
            createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        });

        const orders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('items.productId')
            .lean();

        const enrichedOrders = orders.map(order => {
            if (!order.total) {
                order.total = order.items.reduce((sum, item) => {
                    const price = item.productId?.price || 0;
                    return sum + (item.quantity * price);
                }, 0);
            }
            return order;
        });

        // Fetch the current user's data explicitly if messageCount is a field
        const user = req.user ? await User.findById(req.user._id).lean() : null;
        // If messageCount isn’t in the User schema, calculate it (example below assumes a messages collection)
        // const messageCount = user ? await Message.countDocuments({ recipient: user._id }) : 0;

        const orderAnalyticsResult = await Order.aggregate([
            { $match: { createdAt: { $gte: new Date(now.setDate(now.getDate() - 6)) } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const labels = [];
        const data = [];
        const dateMap = new Map(orderAnalyticsResult.map(item => [item._id, item.count]));
        const sevenDaysAgo = new Date(now.setDate(now.getDate() - 6));
        for (let i = 0; i < 7; i++) {
            const date = new Date(sevenDaysAgo);
            date.setDate(sevenDaysAgo.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            data.push(dateMap.get(dateStr) || 0);
        }

        const orderAnalytics = { labels, data };

        res.render('admin/dashboard', {
            userCount,
            productCount,
            orderCount,
            totalSales,
            pendingOrders,
            completedOrders,
            monthlyRevenue,
            newUsersThisMonth,
            orders: enrichedOrders,
            orderAnalytics,
            currentUser: req.user || null, // Pass currentUser explicitly
            user: user || {}, // Pass user with fallback
            messageCount: user?.messageCount || 0 // Default to 0 if undefined
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).render('error', { error: 'Server error occurred while loading the dashboard' });
    }
});


router.get('/products', isAdmin, async (req, res) => {
    try {
        let perPage = 10;
        let page = parseInt(req.query.page) || 1;

        const user = req.user ? await User.findById(req.user._id).lean() : null;
        const totalProducts = await Product.countDocuments();
        const totalPages = Math.ceil(totalProducts / perPage);

        const products = await Product.find()
            .skip((page - 1) * perPage)
            .limit(perPage);

        res.render('admin/products', {
            products,
            totalPages,
            currentPage: page,
            user: user || {}, // Pass user with fallback
            messageCount: user?.messageCount || 0
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        req.flash('error_msg', 'Server error');
        res.redirect('/admin');
    }
});


// Products - Add
router.post('/products/add', isAdmin, upload.array('images', 10), async (req, res) => {
    try {
<<<<<<< HEAD
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
=======
        // Validate required fields
        const { name, price, description, stockQuantity, category } = req.body;
        
        if (!name || !price || !stockQuantity || !category) {
            throw new Error('Missing required fields');
        }

        // Validate numeric fields
        const parsedPrice = parseFloat(price);
        const parsedStock = parseInt(stockQuantity, 10);
        
        if (isNaN(parsedPrice) || isNaN(parsedStock)) {
            throw new Error('Price and stock quantity must be valid numbers');
        }

        if (parsedPrice < 0 || parsedStock < 0) {
            throw new Error('Price and stock quantity cannot be negative');
        }

        // Handle image uploads
        let imagePaths = [];
        if (req.files && req.files.length > 0) {
            imagePaths = req.files.map(file => `/uploads/${file.filename}`);
        } else {
            throw new Error('At least one image is required');
        }

        // Create new product
        const product = new Product({
            name: name.trim(),
            price: parsedPrice,
            description: description ? description.trim() : '',
            stockQuantity: parsedStock,
            category: category.trim(),
            imageUrl: imagePaths[0],
            additionalImages: imagePaths.slice(1),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Save product
        await product.save();
        
        req.flash('success_msg', 'Product added successfully.');
        res.redirect('/admin/products');

    } catch (error) {
        // Clean up uploaded files on error
        if (req.files && req.files.length > 0) {
            const fs = require('fs').promises;
            const uploadDir = path.join(__dirname, '../public/uploads');
            
            try {
                await Promise.all(
                    req.files.map(file => 
                        fs.unlink(path.join(uploadDir, file.filename))
                    )
                );
            } catch (cleanupError) {
                console.error('Error cleaning up files:', cleanupError);
            }
        }

        console.error('Error adding product:', error);
        req.flash('error_msg', error.message || 'Failed to add product.');
>>>>>>> origin/main
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




router.get('/users', isAdmin, async (req, res) => {
    try {
        let page = parseInt(req.query.page) || 1;
        let limit = 10;
        let skip = (page - 1) * limit;
        const user = req.user ? await User.findById(req.user._id).lean() : null;
        let totalUsers = await User.countDocuments();
        let users = await User.find().skip(skip).limit(limit);

        res.render('admin/users', {
            users,
            currentPage: page,
            totalPages: Math.ceil(totalUsers / limit),
            user: user || {}, // Pass user with fallback
            messageCount: user?.messageCount || 0 // Default to 0 if undefined
        });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.redirect('/admin/dashboard');
    }
});


router.post('/users/delete/:id', isAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/users');
        }
        req.flash('success_msg', 'User deleted successfully');
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error deleting user:', error);
        req.flash('error_msg', 'Server error');
        res.redirect('/admin/users');
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


// Products - Delete (using POST)
router.post('/products/delete/:id', isAdmin, async (req, res) => {
    try {
        if (!req.params.id) {
            req.flash('error_msg', 'Invalid product ID');
            return res.redirect('/admin/products');
        }

        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }

        req.flash('success_msg', 'Product deleted successfully');
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Error deleting product:', error);
        req.flash('error_msg', 'Server error');
        res.redirect('/admin/products');
    }
});


router.get('/orders', isAdmin, async (req, res) => {
    try {
        const perPage = 10; // Orders per page
        const page = parseInt(req.query.page) || 1; 

        const totalOrders = await Order.countDocuments(); // Total order count
        const totalPages = Math.ceil(totalOrders / perPage); // Calculate total pages

        const user = req.user ? await User.findById(req.user._id).lean() : null;

        const orders = await Order.find()
            .populate('items.productId')
            .skip((page - 1) * perPage)
            .limit(perPage)
            .lean(); // Use lean() for performance since we don’t need Mongoose documents

        const paymentStatusOptions = [
            { value: 'Pending', label: 'Pending' },
            { value: 'Paid', label: 'Paid' },
            { value: 'Failed', label: 'Failed' },
            { value: 'Refunded', label: 'Refunded' }
        ];

        const enhancedOrders = orders.map(order => ({
            ...order,
            paymentStatusOptions: paymentStatusOptions.map(option => ({
                ...option,
                selected: option.value === order.paymentStatus
            }))
        }));

        // Render the template with fetched data
        res.render('admin/orders', {
            orders: enhancedOrders,
            totalPages,
            currentPage: page,
            success: req.flash('success_msg')[0] || null, // Consistent with your app’s convention
            error: req.flash('error_msg')[0] || null,
            user: user || {},
            messageCount: user?.messageCount || 0
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        req.flash('error_msg', 'Failed to load orders'); // Use error_msg for consistency

        // Render with fallback data in case of error
        res.render('admin/orders', {
            orders: [],
            totalPages: 1,
            currentPage: 1,
            success: req.flash('success_msg')[0] || null,
            error: req.flash('error_msg')[0] || null,
            user: req.user ? { ...req.user._doc } : {}, // Use req.user directly if not fetched
            messageCount: req.user?.messageCount || 0
        });
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

// Update shipping status and send delivery email when shipped
router.post('/orders/update-shipping-status', isAdmin, async (req, res) => {
    const { orderId, shippingStatus } = req.body;

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            req.flash('error_msg', 'Order not found');
            return res.redirect('/admin/orders');
        }

        // Update shipping status
        order.shippingStatus = shippingStatus;

        // If status is "Delivered", set deliveredAt
        if (shippingStatus === 'Delivered') {
            order.deliveredAt = new Date();
        }

        await order.save();

        // Send delivery confirmation email when status is "Shipped"
        if (shippingStatus === 'Shipped') {
            await emailService.sendDeliveryConfirmation({
                customerName: order.customerName,
                customerEmail: order.customerEmail,
                cloudOrderId: order._id.toString(),
                total: order.total,
                items: order.items,
                deliveredAt: new Date() 
            });
            console.log(`Delivery confirmation email sent for order ${order._id}`);
        }

        req.flash('success_msg', 'Shipping status updated successfully');
        res.redirect('/admin/orders');
    } catch (error) {
        console.error('Error updating shipping status:', error);
        req.flash('error_msg', 'Failed to update shipping status');
        res.redirect('/admin/orders');
    }
});


// Carts - List (optional, for monitoring active carts)
router.get('/carts', isAdmin, async (req, res) => {
    try {
        const user = req.user ? await User.findById(req.user._id).lean() : null;
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
<<<<<<< HEAD
            .populate('userId', 'username') // Populate username from User
            .populate('products.productId'); // Populate product details
        res.render('admin/carts', { carts, currentUser: req.user, activePage: 'carts' });
    } catch (error) {
        console.error('Error fetching carts:', error);
        res.status(500).render('error', { error: 'Server error' });
=======
            .populate({
                path: 'userId',
                select: 'username email', 
                model: 'User'
            })
            .populate({
                path: 'products.productId',
                select: 'name price imageUrl',
                model: 'Product' 
            })
            .lean();

        // Add fallback for missing user data
        const formattedCarts = carts.map(cart => ({
            ...cart,
            userId: cart.userId ? {
                _id: cart.userId._id,
                username: cart.userId.username || 'Unknown User',
                email: cart.userId.email || 'N/A'
            } : {
                _id: null,
                username: 'Deleted User',
                email: 'N/A'
            }
        }));

        res.render('admin/carts', { 
            carts: formattedCarts, 
            currentUser: req.user, 
            activePage: 'carts' 
        });
        
    } catch (error) {
        console.error('Error fetching carts:', error);
        req.flash('error_msg', 'Failed to load carts');
        res.status(500).render('error', { 
            error: 'Server error',
            currentUser: req.user 
        });
>>>>>>> origin/main
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

router.get('/transactions', isAdmin, async (req, res) => {
    try {
        let perPage = 10;
        let page = parseInt(req.query.page) || 1;
        const user = req.user ? await User.findById(req.user._id).lean() : null;
        const totalTransactions = await Transaction.countDocuments();
        const totalPages = Math.ceil(totalTransactions / perPage);

        const transactions = await Transaction.find()
            .sort({ createdAt: -1 })
            .skip((page - 1) * perPage)
            .limit(perPage);

        res.render('admin/transactions', {
            transactions,
            totalPages,
            currentPage: page,
            success_msg: req.flash('success'),
            error_msg: req.flash('error')
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        req.flash('error', 'Failed to load transactions');
        res.render('admin/transactions', {
            transactions: [],
            totalPages: 1,
            currentPage: 1,
            success_msg: req.flash('success'),
            error_msg: req.flash('error')
        });
    }
});


// Settings - Display
router.get('/settings', isAdmin, async (req, res) => {
    try {
        const user = req.user ? await User.findById(req.user._id).lean() : null;
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
            return res.redirect('/admin/dashboard');
        }
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
                return res.redirect('/admin/dashboard');
            }
            res.redirect('/admin/login');
        });
    });
});

module.exports = router;