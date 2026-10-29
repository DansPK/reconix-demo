// src/utils/hash.js — password hashing (intentionally vulnerable)
const crypto = require("crypto");

function hashPassword(pw) {
  return crypto.createHash('md5').update(pw).digest('hex');
}

module.exports = { hashPassword };
