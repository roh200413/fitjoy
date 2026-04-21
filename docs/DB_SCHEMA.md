# FITJOY DB 스키마 문서 (MVP)

## 1) 테이블 목록
- products
- customers
- live_sessions
- orders
- order_items
- shipments

## 2) 관계(ERD)
- customers 1 : N orders
- live_sessions 1 : N orders
- orders 1 : N order_items
- products 1 : N order_items
- orders 1 : 1 shipments

## 3) 핵심 설계 원칙
- 주문 금액은 order_items의 합계로 계산
- 주문 생성 시점의 상품명/단가를 order_items에 snapshot 저장
- shipments는 주문당 1건만 생성

## 4) 상태값
- payment_status: pending | paid
- shipping_status: ready | shipped | delivered

## 5) MySQL DDL
```sql
CREATE TABLE products (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_name VARCHAR(200) NOT NULL,
  wholesale_price_jpy INT NOT NULL DEFAULT 0,
  retail_price_krw INT NOT NULL DEFAULT 0,
  live_price INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE customers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  instagram_id VARCHAR(100) NOT NULL UNIQUE,
  customer_name VARCHAR(100),
  phone_number VARCHAR(30),
  address1 VARCHAR(255),
  address2 VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE live_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  live_title VARCHAR(200) NOT NULL,
  live_started_at DATETIME,
  live_ended_at DATETIME,
  memo TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  live_id BIGINT NOT NULL,
  order_code VARCHAR(50),
  total_product_amount INT NOT NULL DEFAULT 0,
  note TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_order_code (order_code),
  KEY idx_orders_customer_id (customer_id),
  KEY idx_orders_live_id (live_id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_orders_live FOREIGN KEY (live_id) REFERENCES live_sessions(id)
);

CREATE TABLE order_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(200) NOT NULL,
  quantity INT NOT NULL,
  unit_price INT NOT NULL,
  line_amount INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_order_items_order_id (order_id),
  KEY idx_order_items_product_id (product_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE shipments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE,
  payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  paid_at DATETIME,
  paid_amount INT,
  receiver_name VARCHAR(100),
  receiver_phone VARCHAR(30),
  shipping_address1 VARCHAR(255),
  shipping_address2 VARCHAR(255),
  courier_name VARCHAR(100),
  tracking_number VARCHAR(100),
  shipping_status VARCHAR(30) NOT NULL DEFAULT 'ready',
  shipped_at DATETIME,
  delivered_at DATETIME,
  memo TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_shipments_payment_status (payment_status),
  KEY idx_shipments_shipping_status (shipping_status),
  CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES orders(id)
);
```
