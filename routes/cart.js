const express = require('express');
const router = express.Router();
const Cart = require('../models/cart');
const Order = require('../models/order');
const mongoose = require('mongoose');

// Middleware to check if the user is logged in
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/login');
}

// GET cart page
router.get('/', isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await Cart.findOne({ userId }).populate('products.productId');

        let cartItems = 0;
        let total = 0;
        let products = [];

        if (cart && cart.products.length > 0) {
            products = cart.products;
            cartItems = cart.products.reduce((sum, item) => sum + (item.quantity || 0), 0);
            total = cart.products.reduce((sum, item) => sum + ((item.productId?.price || 0) * (item.quantity || 1)), 0);
        }

        res.render('cart', {
            cart: products, // Pass the products array directly
            total,
            cartItems,
            isAuthenticated: true
        });
    } catch (error) {
        console.error('Error retrieving cart:', error);
        res.status(500).render('error', { error: 'An error occurred while retrieving the cart' });
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

// PATCH update cart item quantity
router.patch('/update/:itemId', isLoggedIn, async (req, res) => {
    const { itemId } = req.params; // itemId is the subdocument _id from products array
    const { quantity } = req.body;
    const userId = req.user._id;

    try {
        const cart = await Cart.findOne({ userId }).populate('products.productId');
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const productIndex = cart.products.findIndex(p => p._id.toString() === itemId);
        if (productIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        // Validate quantity against stock
        const product = cart.products[productIndex].productId;
        if (quantity > product.stockQuantity) {
            return res.status(400).json({ success: false, message: `Only ${product.stockQuantity} items in stock` });
        }

        cart.products[productIndex].quantity = quantity;
        await cart.save();

        const total = cart.products.reduce((sum, item) => sum + ((item.productId?.price || 0) * (item.quantity || 1)), 0);
        res.status(200).json({ success: true, message: 'Quantity updated', total });
    } catch (error) {
        console.error('Error updating cart quantity:', error);
        res.status(500).json({ success: false, message: 'Error updating quantity' });
    }
});

// DELETE remove item from cart
router.delete('/remove/:itemId', isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id;
        const itemId = req.params.itemId;

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const productIndex = cart.products.findIndex(item => item._id.toString() === itemId);
        if (productIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        cart.products.splice(productIndex, 1); // Remove the item
        if (cart.products.length === 0) {
            await Cart.deleteOne({ _id: cart._id });
        } else {
            await cart.save();
        }

        res.status(200).json({ success: true, message: 'Item removed successfully' });
    } catch (error) {
        console.error('Error while removing item:', error);
        res.status(500).json({ success: false, message: 'Server error' });
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

// POST checkout
router.post('/checkout', isLoggedIn, async (req, res) => {
    const { customerName, customerEmail, customerPhone, customerLocation, cartTotal, cart } = req.body;

    if (!customerName || !customerEmail || !customerPhone || !customerLocation || !cartTotal || !cart || !Array.isArray(cart)) {
        return res.status(400).json({ success: false, message: 'All fields and cart items are required' });
    }

    try {
        const items = cart.map(item => ({
            productId: item.productId._id || item.productId, // Handle populated vs. raw data
            quantity: item.quantity,
            price: item.productId.price || 0
        }));

        const newOrder = new Order({
            userId: req.user._id,
            customerName,
            customerEmail,
            customerPhone,
            customerLocation,
            items,
            total: parseFloat(cartTotal),
            status: 'Pending',
            estimatedDelivery: req.body.estimatedDelivery || null
        });

        await newOrder.save();
        await Cart.deleteOne({ userId: req.user._id }); // Clear cart after checkout

        res.status(201).json({ success: true, message: 'Order created successfully', transaction_request_id: newOrder._id });
    } catch (error) {
        console.error('Error during checkout:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;