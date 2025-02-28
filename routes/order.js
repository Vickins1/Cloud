const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const Cart = require('../models/cart');
const { isLoggedIn } = require('../middleware/auth');


// Route to create an order
router.post('/checkout', async (req, res) => {
       console.log('Request body:', req.body); // Debugging line
   
       const { customerName, customerEmail, items, status, estimatedDelivery } = req.body;
   
       if (!customerName || !customerEmail || !items || items.length === 0) {
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
           res.status(201).json({ message: 'Order created successfully', order: newOrder });
       } catch (error) {
           console.error('Error during checkout:', error);
           if (error.name === 'ValidationError') {
               return res.status(400).json({ error: 'Validation Error', details: error.errors });
           }
           res.status(500).json({ error: 'Server Error' });
       }
   });

   
// Route to update an order
router.put('/update/:id', isLoggedIn, async (req, res) => {
    try {
        const { id } = req.params;
        const { customerName, customerEmail, items, status, estimatedDelivery } = req.body;

        // Find and update the order
        const updatedOrder = await Order.findByIdAndUpdate(
            id,
            { customerName, customerEmail, items, status, estimatedDelivery },
            { new: true, runValidators: true }
        );

        if (!updatedOrder) {
            return res.status(404).send('Order not found');
        }

        res.status(200).send('Order updated successfully');
    } catch (error) {
        if (error.name === 'ValidationError') {
            console.error('Validation Error:', error.errors);
            return res.status(400).send('Validation Error');
        }
        console.error('Error:', error);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
