const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Product = require('../models/product');
const Order = require('../models/order');
const Cart = require('../models/cart');
const multer = require('multer');
const path = require('path');
const Transaction = require('../models/transaction');
const emailService = require('../services/emailService');
const fs = require('fs');


function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.isAdmin) return next();
    req.flash('error_msg', 'Unauthorized access. Admins only.');
    res.redirect('/auth/login');
}


// Get product details (for modal population)
router.get("/products/:id", async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: "Product not found" });
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

async function countNewUsersThisMonth() {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); // 1st day of the month
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // Last day, last millisecond of the month

        const newUsersThisMonth = await User.countDocuments({
            createdAt: {
                $gte: startOfMonth,
                $lte: endOfMonth
            }
        });

        return newUsersThisMonth;
    } catch (error) {
        console.error("Error counting new users:", error);
        return 0;
    }
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
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const totalSalesResult = await Order.aggregate([
            { $match: { paymentStatus: 'completed' } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } } } }
        ]);
        const totalSales = totalSalesResult[0]?.total || 0;

        const monthlyRevenueResult = await Order.aggregate([
            { $match: { paymentStatus: 'completed', createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } } } }
        ]);
        const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;

        const [pendingOrdersPaidNotShipped, shippedOrders] = await Promise.all([
            Order.countDocuments({ paymentStatus: 'completed', shippingStatus: 'Processing' }),
            Order.countDocuments({ shippingStatus: 'Shipped' })
        ]);

        // Use the refactored function for counting new users
        const newUsersThisMonth = await countNewUsersThisMonth();

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

        const user = req.user ? await User.findById(req.user._id).lean() : null;

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
            pendingOrders: pendingOrdersPaidNotShipped,
            completedOrders: shippedOrders,
            monthlyRevenue,
            newUsersThisMonth,
            orders: enrichedOrders,
            orderAnalytics,
            currentUser: req.user || null,
            user: user || {},
            messageCount: user?.messageCount || 0
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        req.flash('error_msg', 'Server error occurred while loading the dashboard.');
        res.redirect('/admin/dashboard'); // Redirect with flash message instead of rendering error page
    }
});


router.get('/products', isAdmin, async (req, res) => {
    try {
        let perPage = 10;
        let page = parseInt(req.query.page) || 1;

        // Fetch user data if logged in
        const user = req.user ? await User.findById(req.user._id).lean() : null;

        // Get total product count and calculate pages
        const totalProducts = await Product.countDocuments();
        const totalPages = Math.ceil(totalProducts / perPage);

        // Fetch products sorted by createdAt (newest first) with pagination
        const products = await Product.find()
            .sort({ createdAt: -1 }) // Sort by creation date, descending
            .skip((page - 1) * perPage)
            .limit(perPage)
            .lean(); // Use .lean() for plain JS objects

        if (!products || products.length === 0) {
            console.warn('No products found for page:', page);
        }

        res.render('admin/products', {
            products: products || [], // Fallback to empty array if no products
            totalPages,
            currentPage: page,
            user: user || {}, // Pass user with fallback
            messageCount: user?.messageCount || 0,
            success_msg: req.flash('success_msg'), // Include flash messages
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        req.flash('error_msg', 'Server error');
        res.redirect('/admin/dashboard');
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage: storage });


router.post('/products/add', isAdmin, upload.array('images', 10), async (req, res) => {
    try {
        const { name, price, description, stockQuantity, category, quantityType } = req.body;
        console.log('Received quantityType:', quantityType); // Log the received value

        // Validate required fields
        if (!name || !price || !stockQuantity || !category || !quantityType) {
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

        // Validate category
        const validCategories = [
            'Indica', 'Sativa', 'Hybrid', 'CBD', 'THC', 'Exotic',
            'Cigarettes', 'Cigars', 'Rolling-Tobacco', 'Hookah',
            'Nicotine-Pouches', 'Vapes', 'Accessories', 'Edibles'
        ];

        if (!validCategories.includes(category)) {
            throw new Error(`Invalid category selected. Must be one of: ${validCategories.join(', ')}`);
        }

        // Validate quantityType
        const validQuantityTypes = ['piece', 'gram', 'pack'];
        if (!quantityType || !validQuantityTypes.includes(quantityType)) {
            throw new Error(`Invalid quantity type selected. Must be one of: ${validQuantityTypes.join(', ')}`);
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
            category: category,
            quantityType: quantityType,
            imageUrl: imagePaths[0],
            additionalImages: imagePaths.slice(1)
        });

        await product.save();

        req.flash('success_msg', 'Product added successfully.');
        res.redirect('/admin/products');

    } catch (error) {
        // File cleanup on error
        if (req.files && req.files.length > 0) {
            const fs = require('fs').promises;
            const path = require('path');
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
        res.redirect('/admin/products');
    }
});

router.post('/products/edit', isAdmin, upload.array('images', 10), async (req, res) => {
    try {
        const { id, name, price, description, stockQuantity, category, quantityType } = req.body;
        console.log('Received quantityType:', quantityType); // Log the received value

        // Validate required fields
        if (!id || !name || !price || !stockQuantity || !category || !quantityType) {
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

        // Validate category
        const validCategories = [
            'Indica', 'Sativa', 'Hybrid', 'CBD', 'THC', 'Exotic',
            'Cigarettes', 'Cigars', 'Rolling-Tobacco', 'Hookah',
            'Nicotine-Pouches', 'Vapes', 'Accessories'
        ];

        if (!validCategories.includes(category)) {
            throw new Error(`Invalid category selected. Must be one of: ${validCategories.join(', ')}`);
        }

        // Validate quantityType
        const validQuantityTypes = ['piece', 'gram', 'pack'];
        if (!quantityType || !validQuantityTypes.includes(quantityType)) {
            throw new Error(`Invalid quantity type selected. Must be one of: ${validQuantityTypes.join(', ')}`);
        }

        // Find the product
        const product = await Product.findById(id);
        if (!product) {
            throw new Error('Product not found');
        }

        // Store old image paths
        let imagePaths = [product.imageUrl, ...product.additionalImages];

        // Handle image uploads (update only if new images are uploaded)
        if (req.files && req.files.length > 0) {
            const newImagePaths = req.files.map(file => `/uploads/${file.filename}`);

            // Clean up old images only if new ones are uploaded
            const fs = require('fs').promises;
            const path = require('path');
            const uploadDir = path.join(__dirname, '../public/uploads');

            try {
                await Promise.all(
                    imagePaths.map(imagePath =>
                        fs.unlink(path.join(uploadDir, path.basename(imagePath)))
                    )
                );
            } catch (cleanupError) {
                console.error('Error cleaning up old files:', cleanupError);
            }

            imagePaths = newImagePaths;
        }

        // Update product
        product.name = name.trim();
        product.price = parsedPrice;
        product.description = description ? description.trim() : '';
        product.stockQuantity = parsedStock;
        product.category = category;
        product.quantityType = quantityType;
        product.imageUrl = imagePaths[0] !== undefined ? imagePaths[0] : product.imageUrl;
        product.additionalImages = imagePaths.length > 1 ? imagePaths.slice(1) : product.additionalImages;

        await product.save();

        req.flash('success_msg', 'Product updated successfully.');
        res.redirect('/admin/products');

    } catch (error) {
        // Clean up uploaded files on error
        if (req.files && req.files.length > 0) {
            const fs = require('fs').promises;
            const path = require('path');
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

        console.error('Error updating product:', error);
        req.flash('error_msg', error.message || 'Failed to update product.');
        res.redirect('/admin/products');
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
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        // Fetch current user (if logged in)
        const currentUser = req.user ? await User.findById(req.user._id).lean() : null;

        // Fetch total users and paginated users
        const totalUsers = await User.countDocuments();
        const users = await User.find()
            .skip(skip)
            .limit(limit)
            .lean();

        // Calculate total pages
        const totalPages = Math.ceil(totalUsers / limit);

        // Render the users page
        res.render('admin/users', {
            users,
            currentPage: page,
            totalPages,
            user: currentUser || {}, // Fallback to empty object if null
            messageCount: currentUser?.messageCount || 0, // Safe default
            success_msg: req.flash('success_msg'), // Add success flash message
            error_msg: req.flash('error_msg') // Add error flash message
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        req.flash('error_msg', 'Failed to load users. Please try again.');
        res.redirect('/admin/dashboard');
    }
});

// Toggle Admin Status
router.post('/users/toggle-admin/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/admin/users');
        }

        // Toggle isAdmin status
        user.isAdmin = !user.isAdmin;
        await user.save();

        req.flash('success_msg', `User ${user.username} ${user.isAdmin ? 'promoted to' : 'demoted from'} admin status.`);
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Error toggling admin status:', err);
        req.flash('error_msg', 'Failed to update admin status.');
        res.redirect('/admin/users');
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

        // Fetch orders sorted by newest first
        const orders = await Order.find()
            .populate('items.productId')
            .sort({ createdAt: -1 }) // Sort by latest orders first
            .skip((page - 1) * perPage)
            .limit(perPage)
            .lean(); // Use lean() for performance 

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
            success: req.flash('success_msg')[0] || null,
            error: req.flash('error_msg')[0] || null,
            user: req.user || {}, // Directly use req.user
            messageCount: req.user?.messageCount || 0
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        req.flash('error_msg', 'Failed to load orders');

        // Render with fallback data in case of error
        res.render('admin/orders', {
            orders: [],
            totalPages: 1,
            currentPage: 1,
            success: req.flash('success_msg')[0] || null,
            error: req.flash('error_msg')[0] || null,
            user: req.user || {}, // Directly use req.user
            messageCount: req.user?.messageCount || 0
        });
    }
});


router.post('/orders/update-shipping-status', isAdmin, async (req, res) => {
    try {
        const { orderId, shippingStatus } = req.body;

        // Fetch the full order with populated items
        const order = await Order.findById(orderId).populate('items.productId');
        if (!order) {
            req.flash('error_msg', 'Order not found');
            return res.redirect('/admin/orders');
        }

        // Update the shipping status
        order.shippingStatus = shippingStatus;
        await order.save();

        // Prepare email data
        const emailData = {
            customerName: order.customerName || 'Customer',
            customerEmail: order.customerEmail,
            cloudOrderId: order._id.toString(),
            total: order.total,
            items: order.items || [],
            deliveredAt: shippingStatus === 'Delivered' ? new Date() : null,
            host: req.get('host') || 'cloud420.store',
        };

        // Send email based on shipping status
        try {
            if (shippingStatus === 'Delivered') {
                await emailService.sendDeliveryConfirmation(emailData);
            } else {
                await emailService.sendShippingUpdate({
                    ...emailData,
                    shippingStatus,
                });
            }
        } catch (emailError) {
            console.error('Failed to send shipping update email:', emailError);
            // Don’t block redirect; just log the error
        }

        req.flash('success_msg', `Shipping status updated to ${shippingStatus}`);
        res.redirect('/admin/orders');
    } catch (error) {
        console.error('Error updating shipping status:', error);
        req.flash('error_msg', 'Failed to update shipping status');
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

        const startTime = Date.now(); // Start timer
        const transactions = await Transaction.find()
            .populate('orderId', 'customerName total')
            .sort({ createdAt: -1 })
            .skip((page - 1) * perPage)
            .limit(perPage)
            .lean();
        const fetchTime = Date.now() - startTime;

        const enrichedTransactions = transactions.map(transaction => ({
            ...transaction,
            transactionId: transaction._id,
            orderId: transaction.orderId?._id || transaction._id,
            customerName: transaction.orderId?.customerName || transaction.customerPhone || 'Cloud Wanderer',
            total: transaction.orderId?.total || transaction.amount || 0,
            paymentDate: (transaction.status === 'completed' && transaction.updatedAt)
                ? transaction.updatedAt
                : transaction.createdAt,
            status: transaction.status || 'Unknown'
        }));


        res.render('admin/transactions', {
            transactions: enrichedTransactions,
            totalPages,
            currentPage: page,
            success_msg: req.flash('success'),
            error_msg: req.flash('error'),
            user,
            currentTime: new Date().toISOString(),
            fetchTime // Pass fetch time in milliseconds
        });
    } catch (error) {
        // Error handling unchanged, add fetchTime: 0
        res.render('admin/transactions', { /* ... */ fetchTime: 0 });
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
