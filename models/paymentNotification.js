const mongoose = require('mongoose');

const paymentNotificationSchema = new mongoose.Schema({
  order_id: String,
  payment_status: String,
  notification_date: Date
});

const PaymentNotification = mongoose.model('PaymentNotification', paymentNotificationSchema);

module.exports = PaymentNotification;