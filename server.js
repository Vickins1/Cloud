const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const compression = require('compression');
const winston = require('winston');
require('dotenv').config({ path: '/home/ubuntu/.env' });
const MongoStore = require('connect-mongo');

const app = express();
app.set('view engine', 'ejs');

app.set('trust proxy', 1);
app.use(helmet());

// Security middleware
app.use(helmet());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);
app.use(cors({
  origin: ['https://cloud420.store', 'https://www.cloud420.store'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
app.use(compression());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Sphinx')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: '/var/log/cloud420/error.log', level: 'error' }),
    new winston.transports.File({ filename: '/var/log/cloud420/combined.log' }),
  ],
});
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console());
}

// Session and Passport setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'weed-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // Requires HTTPS
    httpOnly: true,
    sameSite: 'strict',
  },
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/Sphinx',
    ttl: 24 * 60 * 60, // 1 day
  }),
}));

// Middleware
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public', { maxAge: '1d' }));

// Global variables for flash messages
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.user = req.user; // Make user available in views
  next();
});

// Block sensitive paths
app.use((req, res, next) => {
  if (/^\/(laravel|xampp|node_modules|main|docker)/.test(req.path)) {
    return res.status(403).send('Forbidden');
  }
  next();
});

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/product');
const cartRoutes = require('./routes/cart');
const paymentRouter = require('./routes/payment');
const trackOrderRoute = require('./routes/trackOrder');
const orderRoutes = require('./routes/order');
const checkoutRoutes = require('./routes/checkout');

app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/cart', cartRoutes);
app.use('/api', orderRoutes);
app.use('/payment', paymentRouter);
app.use('/api', trackOrderRoute);
app.use('/', checkoutRoutes);

// Routes remain the same (e.g., /initialize-order, /home, etc.)

// Global error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 4200;
app.listen(PORT, '0.0.0.0', () => {
  const localIP = require('os').networkInterfaces()['eth0']?.[0]?.address || '127.0.0.1';
  logger.info(`Weed Store is running at:
    - Local: http://localhost:${PORT}
    - Network: http://${localIP}:${PORT}`);
});