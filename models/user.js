const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    googleId: { type: String, unique: true, sparse: true }, 
    lastLogin: { type: Date, default: Date.now },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    isAdmin: { type: Boolean, default: false },
    verificationCode: String,
    verificationCodeExpires: Date,
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Enable username and password hashing for local authentication
userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);
