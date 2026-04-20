# FITJOY 인스타 라이브 판매/정산 시스템 PRD

## 1. 문서 목적
이 문서는 FITJOY 인스타 라이브 판매/정산 시스템의 **MVP 개발 시작을 위한 기준 문서**입니다.  
운영자가 라이브 판매 주문을 빠르게 입력하고, 정산/입금/배송까지 한 화면 흐름으로 처리할 수 있도록 요구사항을 정의합니다.

---

## 2. 프로젝트 개요

### 2.1 프로젝트명
**FITJOY 라이브 판매 정산 관리 시스템**

### 2.2 목적
인스타 라이브 판매 데이터를 기반으로 아래 업무를 빠르게 처리합니다.
- 주문 생성
- 고객별 정산
- 입금 확인
- 배송 관리

### 2.3 운영 조건
- 1인 운영 기준
- 단일 관리자(권한 분리 없음)
- 데스크톱 관리자 UI 우선
- 단순/빠른 입력 UX 최우선

---

## 3. 핵심 목표
- 라이브 판매 입력 속도 극대화
- 고객별 주문 자동 정리
- 정산 총액 자동 계산
- 입금/배송 상태 통합 관리
- 최소 구조로 바로 운영 가능한 MVP

---

## 4. 핵심 기능 (MVP)

### 4.1 상품 관리
- 상품 등록/수정/비활성화
- 라방 가격 관리

### 4.2 고객 관리
- 인스타 ID 기준 고객 등록/검색
- 주문 중 신규 고객 간편 생성

### 4.3 라이브 방송 관리
- 방송 생성/수정
- 방송별 주문 조회

### 4.4 주문 생성 (핵심)
- 방송 선택
- 고객 선택(또는 신규 등록)
- 상품 다중 추가 + 수량 입력
- 주문 금액 자동 계산
- 주문 저장 시 shipment 자동 생성

### 4.5 정산 조회
- 주문별 총액 자동 계산
- 고객별 주문 조회
- 주문 상세 조회

### 4.6 송장(입금 + 배송) 관리
- 입금 여부/입금액/입금일시 입력
- 배송지 입력/수정
- 택배사/송장번호 입력
- 배송 상태 변경

---

## 5. 사용자 시나리오

### 시나리오 1: 라이브 중 주문 입력
1. 방송 선택
2. 고객 검색(없으면 생성)
3. 상품 선택 및 수량 입력
4. 주문 저장

### 시나리오 2: 정산 확인
1. 주문 목록 조회
2. 고객별 주문 확인
3. 총 금액 확인

### 시나리오 3: 배송 처리
1. 주문 선택
2. 입금 확인 처리
3. 배송지/송장번호 입력
4. 발송 처리

---

## 6. 비즈니스 규칙

### 6.1 주문/주문상품
- 주문은 반드시 고객 1명 + 라이브 1건에 속함
- 주문은 최소 1개 이상의 주문상품 필요
- `line_amount = quantity * unit_price`
- `total_product_amount = SUM(order_items.line_amount)`
- 주문 시점의 상품명/단가 스냅샷 저장

### 6.2 shipment
- 주문 생성 시 shipment 기본 레코드 자동 생성
- 주문 1건당 shipment 1건(1:1)
- `payment_status`: `pending | paid`
- `shipping_status`: `ready | shipped | delivered`

### 6.3 고객
- `instagram_id`는 고유값(중복 불가)

---

## 7. DB 설계

### 7.1 테이블 목록
- `products`
- `customers`
- `live_sessions`
- `orders`
- `order_items`
- `shipments`

### 7.2 ERD 관계
- customers 1 : N orders
- live_sessions 1 : N orders
- orders 1 : N order_items
- products 1 : N order_items
- orders 1 : 1 shipments

### 7.3 MySQL DDL (요약)

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

---

## 8. API 초안

### 상품
- `GET /api/products`
- `POST /api/products`
- `PATCH /api/products/:id`

### 고객
- `GET /api/customers`
- `POST /api/customers`
- `PATCH /api/customers/:id`

### 라이브 방송
- `GET /api/live-sessions`
- `POST /api/live-sessions`
- `PATCH /api/live-sessions/:id`
- `GET /api/live-sessions/:id/orders`

### 주문
- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders`

주문 생성 규칙:
- 트랜잭션 필수
- items 1개 이상 필수
- 상품 조회 후 snapshot 저장
- 총액 계산 후 orders 반영
- shipment 기본 레코드 자동 생성

### shipment
- `GET /api/shipments/:orderId`
- `PATCH /api/shipments/:orderId`

---

## 9. 개발 우선순위

### 1단계
1. DB 스키마/마이그레이션
2. 상품/고객/방송 CRUD API
3. 주문 생성 API
4. 주문 조회 API

### 2단계
1. shipment 수정 API
2. 주문 상세 화면
3. 목록 필터/검색

### 3단계
1. UI 입력 속도 개선
2. 대시보드 요약 데이터
3. 편의 기능(자동완성/단축 입력)

---

## 10. 제외 범위 (현재)
- 결제 연동
- 메시지 자동 발송
- 재고 관리
- 권한 시스템
- 통계 고도화
- 부분 배송
- 엑셀 다운로드

---

## 11. 테스트 체크리스트
- 주문 생성(단일/복수 상품) 성공
- 주문 총액 계산 정확성
- shipment 자동 생성 확인
- 고객 instagram_id 중복 등록 실패
- shipment 입금/배송 상태 업데이트 성공
- 방송별/고객별/상태별 주문 조회 필터 동작

---

## 12. 다음 작업 요청
1. 위 스키마 기준으로 프로젝트 초기 세팅
2. Prisma schema 또는 SQL migration 작성
3. REST API 구현
4. 관리자 웹 UI 구현
5. 주문 입력 화면(빠른 입력 중심) 구현
6. 주문 생성 시 shipment 자동 생성 로직 구현
7. 주문 상세에서 주문상품 + 입금 + 배송 통합 조회 구현
