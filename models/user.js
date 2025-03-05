const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, },
  email: { type: String, required: true, unique: true },
  lastLogin: { type: Date, default: Date.now },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  isAdmin: { type: Boolean, default: false },
  verificationToken: { type: String }, // Token for email verification
});

// Add passport-local-mongoose plugin for authentication
userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model('User', userSchema);