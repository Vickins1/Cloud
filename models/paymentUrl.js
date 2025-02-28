const mongoose = require('mongoose');

const paymentUrlSchema = new mongoose.Schema({
  order_id: String,
  payment_url: String
});

const PaymentUrl = mongoose.model('PaymentUrl', paymentUrlSchema);

module.exports = PaymentUrl;