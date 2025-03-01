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
require('dotenv').config();
const MongoStore = require('connect-mongo');
const os = require('os');

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


// Logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
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
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'strict' },
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/Sphinx',
    ttl: 24 * 60 * 60,
  }),
}));

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
  res.locals.user = req.user;
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
app.use('/payment', paymentRouter);
app.use('/api/orders', orderRoutes);
app.use('/api/track', trackOrderRoute);
app.use('/', checkoutRoutes);

// Default route using index.ejs
app.get('/', (req, res) => {
  res.render('index', { title: 'Cloud420 Store' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).send('Something broke!');
});

// Handle unhandled errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});

// Start server
const PORT = process.env.PORT || 4200;
const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const details of iface) {
      if (details.family === 'IPv4' && !details.internal) return details.address;
    }
  }
  return '127.0.0.1';
};

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Cloud420 Store is running at:
  - Local: http://localhost:${PORT}
  - Network: http://${getLocalIP()}:${PORT}`);
});
