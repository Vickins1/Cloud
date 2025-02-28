const express = require('express');
const router = express.Router();
const Cart = require('../models/cart');
const Order = require('../models/order'); // Make sure you have this model
const mongoose = require('mongoose');

// Middleware to check if the user is logged in
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/login');
}

// Route to display cart
router.get('/', isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await Cart.findOne({ userId }).populate('products.productId');
        
        if (!cart || cart.products.length === 0) {
            return res.render('cart', { cart: [], total: 0 });
        }
        
        let total = cart.products.reduce((acc, item) => acc + item.productId.price * item.quantity, 0);

        res.render('cart', { cart: cart.products, total });
    } catch (error) {
        console.error('Error retrieving cart:', error);
        res.status(500).render('error', { error: 'An error occurred while retrieving the cart' });
    }
});

// Add item to cart
router.post('/add/:productId', isLoggedIn, async (req, res) => {
    try {
        const productId = req.params.productId;
        const userId = req.user._id;

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, products: [] });
        }

        // Check if the product is already in the cart
        const productIndex = cart.products.findIndex(p => p.productId.toString() === productId);
        if (productIndex >= 0) {
            cart.products[productIndex].quantity += 1; // Increase quantity if product exists
        } else {
            cart.products.push({ productId, quantity: 1 }); // Add new product to cart
        }

        await cart.save();
        res.json({ success: true, message: 'Product added to cart' });
    } catch (error) {
        console.error('Error adding product to cart:', error);
        res.status(500).json({ success: false, message: 'Failed to add product to cart' });
    }
});

// Route to get cart count
router.get('/cart-count', (req, res) => {
    const userId = req.user._id;
    Cart.findOne({ userId: userId })
        .then(cart => {
            const cartCount = cart
                ? cart.products.reduce((total, item) => total + item.quantity, 0)
                : 0;
            res.json({ cartCount });
        })
        .catch(err => {
            console.error("Error fetching cart count:", err);
            res.status(500).json({ error: 'Error fetching cart count' });
        });
});

router.delete('/remove/:itemId', isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id;
        const itemId = req.params.itemId;

        // Find the cart of the user
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        // Find the product in the cart
        const productIndex = cart.products.findIndex(item => item._id.toString() === itemId);
        if (productIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in the cart' });
        }

        // Decrement the quantity or remove the item if quantity reaches zero
        if (cart.products[productIndex].quantity > 1) {
            cart.products[productIndex].quantity -= 1;
        } else {
            // Remove the product if its quantity becomes zero
            cart.products.splice(productIndex, 1);
        }

        // If the cart becomes empty after removal, delete the cart document
        if (cart.products.length === 0) {
            await Cart.findByIdAndDelete(cart._id);
        } else {
            // Save the updated cart
            await cart.save();
        }

        res.status(200).json({ success: true, message: 'Item removed successfully' });
    } catch (error) {
        console.error('Error while removing item:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// Checkout route
router.post('/checkout', isLoggedIn, async (req, res) => {
    const { customerName, customerEmail, items, status, estimatedDelivery } = req.body;

    if (!customerName || !customerEmail || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Customer name, email, and items are required' });
    }

    try {
        const newOrder = new Order({
            customerName,
            customerEmail,
            items,
            status: status || 'Pending',
            estimatedDelivery
        });

        await newOrder.save();

        // Optionally, clear the cart after successful checkout
        await Cart.findOneAndDelete({ userId: req.user._id });

        res.status(201).json({ message: 'Order created successfully', order: newOrder });
    } catch (error) {
        console.error('Error during checkout:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
