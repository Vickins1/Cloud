const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const compression = require('compression');
const passport = require('passport');
const Product = require('./models/product');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/product');
const LocalStrategy = require('passport-local').Strategy;
const MongoStore = require('connect-mongo');
const User = require('./models/user');
const { isLoggedIn } = require('./middleware/auth');
const cartRoutes = require('./routes/cart');
const paymentRouter = require('./routes/payment');
const trackOrderRoute = require('./routes/trackOrder');
const orderRoutes = require('./routes/order');
const checkoutRoutes = require('./routes/checkout');
const PaymentUrl = require('./models/paymentUrl');
const PaymentNotification = require('./models/paymentNotification');
const Order = require('./models/order');
const axios = require('axios');
require('dotenv').config();
const helmet = require('helmet');

const app = express();
app.set('view engine', 'ejs');
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(cors({
  origin: ['https://cloud420.store', 'https://www.cloud420.store'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
app.use(compression());

const uri = "mongodb+srv://Admin:Kefini360@cluster0.5ib26.mongodb.net/Cloud-db?retryWrites=true&w=majority&appName=Cluster0";

async function createDatabaseAndCollections() {
    try {
        await mongoose.connect(uri);
        console.log("Connected to MongoDB!");

        const modelNames = mongoose.modelNames();

        if (modelNames.length === 0) {
            return;
        }

        const db = mongoose.connection.db;

        for (const modelName of modelNames) {
            const model = mongoose.model(modelName);

            const collectionName = model.collection.collectionName;
            const existingCollections = await db.listCollections({ name: collectionName }).toArray();

            if (existingCollections.length > 0) {
            } else {
                await model.init();
            }
        }

        console.log("Database and collections checked successfully!");
    } catch (error) {
        console.error("Error creating database and collections:", error);
    }
}

createDatabaseAndCollections().catch(console.dir);

// Session and Passport setup
app.use(session({
  secret: 'weed-secret',
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({
    mongoUrl: 'mongodb://localhost:27017/Sphinx',
  })
}));


// Middleware for flash messages
app.use(flash());

// Global variables for flash messages
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    next();
});

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Middleware to make user available in views
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

// Use routes
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/cart', cartRoutes);
app.use('/api', orderRoutes);
app.use('/payment', paymentRouter);
app.use('/api', trackOrderRoute);
app.use('/', checkoutRoutes);

// Route to initialize an order and payment URL
app.post('/initialize-order', async (req, res) => {
  try {
    const { userId, productId, quantity, customerEmail, customerName } = req.body;

    // Validate required fields
    if (!userId || !productId || !quantity || !customerEmail || !customerName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Fetch product details
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Create a new order
    const newOrder = new Order({
      user_id: userId,
      items: [{
        productId: mongoose.Types.ObjectId(productId),
        quantity: quantity
      }],
      total: product.price * quantity,
      customerEmail: customerEmail,
      customerName: customerName
    });

    // Save the order
    const savedOrder = await newOrder.save();
    console.log('Order created:', savedOrder);

    // Generate payment URL with the created order ID
    const paymentUrl = new PaymentUrl({
      order_id: savedOrder._id,
      payment_url: `https://paymentgateway.com/pay?orderId=${savedOrder._id}`
    });

    // Save the payment URL
    const doc = await paymentUrl.save();
    console.log('Payment URL created:', doc);

    // Send response with order and payment URL details
    res.status(200).json({
      order: savedOrder,
      paymentUrl: doc.payment_url
    });

  } catch (err) {
    console.error('Error initializing order and payment URL:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route for home page
app.get('/home', isLoggedIn, async (req, res) => {
  try {
    const products = await Product.find();
    res.render('home', { products, user: req.user, featuredProducts: products });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).send('Server Error');
  }
});

// Render the landing page
app.get('/', (req, res) => {
  res.render('index');
});

// Endpoint to get cart data
app.get('/cart/data', async (req, res) => {
  try {
    const cart = req.user.cart || [];
    res.set("Content-Type", "application/json");
    res.status(200).json(cart);
  } catch (err) {
    console.error('Error fetching cart data:', err);
    res.status(500).send({ error: 'Server Error' });
  }
});

// Render payment page
app.get('/payment', (req, res) => {
  const cart = req.user.cart || [];
  const cartTotal = cart.reduce((total, item) => total + item.productId.price * item.quantity, 0);
  console.log('Cart Total:', cartTotal); 
  res.render('payment', { cartTotal });
});

// Handle payment notifications
app.post('/umspay/callback', async (req, res) => {
  const paymentStatus = req.body.payment_status;
  const orderId = req.body.order_id;
  const notificationDate = new Date();

  const paymentNotification = new PaymentNotification({
    order_id: orderId,
    payment_status: paymentStatus,
    notification_date: notificationDate
  });

  try {
    await paymentNotification.save();
    console.log('Payment notification received:', paymentNotification);
  } catch (err) {
    console.error(err);
  }
  res.send('Payment notification received');
});

// Endpoint to initiate STK Push
app.post('/initiate-stk', async (req, res) => {
  const { amount, msisdn, reference } = req.body;

  try {
    const response = await axios.post('https://api.umeskiasoftwares.com/api/v1/intiatestk', {
      api_key: process.env.UMS_API_KEY,
      email: process.env.UMS_EMAIL,
      account_id: process.env.UMS_ACCOUNT_ID,
      amount,
      msisdn,
      reference
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error initiating STK push:', error.response ? error.response.data : error.message);
    res.status(500).send('Error initiating STK push.');
  }
});

// Endpoint to check transaction status
app.post('/transaction-status', async (req, res) => {
  const { transaction_request_id } = req.body;
  try {
    const response = await axios.post('https://api.umeskiasoftwares.com/api/v1/transactionstatus', {
      api_key: process.env.UMS_API_KEY,
      email: process.env.UMS_EMAIL,
      transaction_request_id
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error checking transaction status:', error.response ? error.response.data : error.message);
    res.status(500).send('Error checking transaction status.');
  }
});


// Webhook to handle transaction notifications and forward data
app.post('/webhook/transaction-status', async (req, res) => {
  try {
    const webhookData = req.body; // The incoming webhook payload

    const transactionId = webhookData.transaction_id;
    const status = webhookData.status;

    console.log('Webhook received:', webhookData);

    // Find the order using the transaction ID
    const order = await Order.findOne({ transactionId });
    if (order) {
      // Calculate the cart total based on the order items
      const cartTotal = order.items.reduce((total, item) => total + (item.quantity * item.productId.price), 0);

      // Update the order status in your database
      order.status = status;
      await order.save();
      console.log('Order updated successfully');

      // Prepare the data to send to the external webhook
      const externalWebhookData = {
        transaction_id: transactionId,
        status: status,
        cartTotal: cartTotal,
        order_id: order._id,
        customerEmail: order.customerEmail,
        customerName: order.customerName
      };

      // Forward the data to the external webhook URL
      await axios.post('https://portal.umeskiasoftwares.com/externalapi/umspaycallback', externalWebhookData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('Data successfully forwarded to external webhook URL');
    } else {
      console.log('Order not found');
    }

    // Respond to the incoming webhook
    res.status(200).send('Webhook received and forwarded successfully');
  } catch (error) {
    console.error('Error processing webhook:', error.message);

    // Handle error and send failure response
    res.status(500).send('Error processing webhook');
  }
});

const os = require('os');

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1'; 
}

// Start server
app.listen(4200, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`Weed Store is running at:
    - Local: http://localhost:4200
    - Network: http://${localIP}:4200`);
});



