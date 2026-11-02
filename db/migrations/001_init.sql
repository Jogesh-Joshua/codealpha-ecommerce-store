-- 001_init.sql
-- Authoritative schema from reconciliation §2.3.
-- Runs inside the migration runner's transaction; no BEGIN or COMMIT here.

-- Shared trigger to maintain updated_at
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  email         text NOT NULL CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email)
);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sessions (opaque token; only its SHA-256 digest is stored)
CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  CONSTRAINT sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT sessions_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Categories
CREATE TABLE categories (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  sort_order integer NOT NULL DEFAULT 0,
  image_url  text CHECK (image_url IS NULL OR image_url ~ '^/images/[A-Za-z0-9._/-]+$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_slug_key UNIQUE (slug)
);

-- Products (price_minor is paise; whole-rupee rule: multiple of 100)
CREATE TABLE products (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id    integer NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  slug           text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  summary        text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 300),
  description    text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 5000),
  specs          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(specs) = 'array'),
  price_minor    integer NOT NULL CHECK (price_minor > 0 AND price_minor % 100 = 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_active      boolean NOT NULL DEFAULT true,
  featured_rank  integer CHECK (featured_rank IS NULL OR featured_rank > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_slug_key UNIQUE (slug)
);
CREATE INDEX products_category_idx ON products (category_id) WHERE is_active;
CREATE INDEX products_newest_idx   ON products (created_at DESC, id DESC) WHERE is_active;
CREATE INDEX products_price_idx    ON products (price_minor, id) WHERE is_active;
CREATE INDEX products_featured_idx ON products (featured_rank, id) WHERE is_active AND featured_rank IS NOT NULL;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Product images (url is a path under /images, never an external URL)
CREATE TABLE product_images (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        text NOT NULL CHECK (url ~ '^/images/[A-Za-z0-9._/-]+$'),
  alt        text NOT NULL CHECK (char_length(alt) BETWEEN 1 AND 200),
  width      integer NOT NULL CHECK (width > 0),
  height     integer NOT NULL CHECK (height > 0),
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT product_images_order_key UNIQUE (product_id, sort_order)
);

-- Orders
CREATE SEQUENCE order_number_seq START WITH 100001;

CREATE TABLE orders (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number           text NOT NULL,
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status                 text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed')),
  currency               char(3) NOT NULL CHECK (currency = 'INR'),
  subtotal_minor         bigint NOT NULL CHECK (subtotal_minor >= 0),
  shipping_minor         bigint NOT NULL CHECK (shipping_minor >= 0),
  total_minor            bigint NOT NULL,
  shipping_full_name     text NOT NULL CHECK (char_length(shipping_full_name) BETWEEN 1 AND 100),
  shipping_phone         text NOT NULL CHECK (shipping_phone ~ '^[0-9]{10,15}$'),
  shipping_address_line1 text NOT NULL CHECK (char_length(shipping_address_line1) BETWEEN 1 AND 150),
  shipping_address_line2 text CHECK (shipping_address_line2 IS NULL OR char_length(shipping_address_line2) <= 150),
  shipping_city          text NOT NULL CHECK (char_length(shipping_city) BETWEEN 1 AND 80),
  shipping_region        text NOT NULL CHECK (char_length(shipping_region) BETWEEN 1 AND 80),
  shipping_postal_code   text NOT NULL CHECK (shipping_postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$'),
  idempotency_key        uuid NOT NULL,
  request_hash           bytea NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_order_number_key UNIQUE (order_number),
  CONSTRAINT orders_idempotency_key UNIQUE (user_id, idempotency_key),
  CONSTRAINT orders_total_check CHECK (total_minor = subtotal_minor + shipping_minor)
);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC, id DESC);

-- Order items (name, slug, and unit price are snapshots taken at purchase time)
CREATE TABLE order_items (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name     text NOT NULL,
  product_slug     text NOT NULL,
  unit_price_minor integer NOT NULL CHECK (unit_price_minor > 0),
  quantity         integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  line_total_minor bigint NOT NULL,
  CONSTRAINT order_items_line_unique UNIQUE (order_id, product_id),
  CONSTRAINT order_items_total_check CHECK (line_total_minor = unit_price_minor::bigint * quantity)
);
CREATE INDEX order_items_product_idx ON order_items (product_id);

-- DB-backed rate limiting (works across serverless instances)
CREATE TABLE rate_limits (
  bucket       text NOT NULL,
  key_hash     bytea NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, key_hash, window_start)
);
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);

