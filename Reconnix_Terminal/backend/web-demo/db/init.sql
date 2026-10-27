-- ShopWave demo schema + seed. Lab target; passwords stored in plaintext on purpose.

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,          -- plaintext (planted vuln)
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  category TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📦',
  stock INT NOT NULL DEFAULT 50,
  rating NUMERIC(2,1) NOT NULL DEFAULT 4.5
);

CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id),
  author TEXT NOT NULL,
  body TEXT NOT NULL,              -- rendered unsanitized (stored XSS, planted)
  stars INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  total NUMERIC(10,2) NOT NULL,    -- trusts client total at checkout (planted)
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id),
  product_id INT REFERENCES products(id),
  qty INT NOT NULL,
  price NUMERIC(10,2) NOT NULL
);

INSERT INTO users (email, password, name, role, address) VALUES
  ('admin@shopwave.test', 'admin123', 'Site Admin', 'admin', 'HQ, 1 Market St'),
  ('alice@example.com', 'password1', 'Alice Nguyen', 'user', '42 Rose Ave'),
  ('bob@example.com', 'hunter2', 'Bob Carter', 'user', '9 Pine Rd'),
  ('carol@example.com', 'letmein', 'Carol Diaz', 'user', '17 Oak Blvd');

INSERT INTO products (name, description, price, category, emoji, stock, rating) VALUES
  ('Aurora Wireless Headphones', 'Immersive over-ear sound with 40h battery and active noise cancelling.', 199.00, 'Audio', '🎧', 120, 4.8),
  ('Nimbus Mechanical Keyboard', 'Hot-swappable switches, aluminium frame, per-key RGB.', 139.00, 'Peripherals', '⌨️', 80, 4.7),
  ('Solstice Smartwatch', 'AMOLED display, GPS, SpO2 and 7-day battery.', 249.00, 'Wearables', '⌚', 60, 4.6),
  ('Pulse 4K Action Cam', 'Waterproof 4K60 camera with hypersmooth stabilisation.', 329.00, 'Cameras', '📷', 35, 4.5),
  ('Zephyr Portable SSD 2TB', 'USB-C, 1050MB/s, pocket-sized and shock resistant.', 189.00, 'Storage', '💾', 150, 4.9),
  ('Lumen Desk Lamp', 'Warm/cool dimmable LED lamp with wireless charging base.', 59.00, 'Home', '💡', 200, 4.4),
  ('Cometica Espresso Maker', '15-bar pump espresso with milk frother.', 279.00, 'Kitchen', '☕', 40, 4.6),
  ('Terra Hiking Backpack 30L', 'Weatherproof, ventilated back panel, lifetime warranty.', 119.00, 'Outdoors', '🎒', 90, 4.7),
  ('Vortex Gaming Mouse', 'Ultralight 58g, 26K DPI sensor, 90h wireless.', 79.00, 'Peripherals', '🖱️', 110, 4.6),
  ('Echo Mini Bluetooth Speaker', 'Room-filling 360° sound, IP67, 20h battery.', 89.00, 'Audio', '🔊', 130, 4.5),
  ('Halo Webcam 2K', 'Sharp 2K video, dual mics, privacy shutter.', 69.00, 'Peripherals', '📹', 75, 4.3),
  ('Drift Ergo Office Chair', 'Breathable mesh, adjustable lumbar and armrests.', 219.00, 'Home', '🪑', 25, 4.5);

INSERT INTO reviews (product_id, author, body, stars) VALUES
  (1, 'Alice', 'Best headphones I have owned. The ANC is incredible.', 5),
  (1, 'Bob', 'Great sound, comfy for long sessions.', 4),
  (2, 'Carol', 'The thock is unreal. Typing feels premium.', 5),
  (3, 'Alice', 'Battery easily lasts a week.', 5);

INSERT INTO orders (user_id, total, status) VALUES
  (2, 338.00, 'paid'),
  (3, 189.00, 'paid'),
  (2, 59.00, 'shipped');

INSERT INTO order_items (order_id, product_id, qty, price) VALUES
  (1, 1, 1, 199.00), (1, 9, 1, 79.00), (1, 6, 1, 59.00),
  (2, 5, 1, 189.00),
  (3, 6, 1, 59.00);
