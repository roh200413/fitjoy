# FITJOY API 명세 (MVP)

## 공통
- Base Path: `/api`
- Content-Type: `application/json`
- 금액: 0 이상 정수
- 수량: 1 이상 정수

---

## 1) Products
### GET /api/products
- Query: `keyword`, `is_active`

### POST /api/products
- 상품 등록

### PATCH /api/products/:id
- 상품 수정/비활성화

---

## 2) Customers
### GET /api/customers
- Query: `instagram_id`, `keyword`

### POST /api/customers
- 고객 등록 (`instagram_id` unique)

### PATCH /api/customers/:id
- 고객 수정/비활성화

---

## 3) Live Sessions
### GET /api/live-sessions
- 방송 목록

### POST /api/live-sessions
- 방송 생성

### PATCH /api/live-sessions/:id
- 방송 수정

### GET /api/live-sessions/:id/orders
- 해당 방송 주문 목록

---

## 4) Orders
### GET /api/orders
- Query: `live_id`, `instagram_id`, `payment_status`, `shipping_status`, `date_from`, `date_to`

### GET /api/orders/:id
- 주문 상세(orders + order_items + shipment)

### POST /api/orders
- 주문 생성 (트랜잭션 필수)

#### Request Example
```json
{
  "customer_id": 1,
  "live_id": 3,
  "note": "DM 확인",
  "items": [
    { "product_id": 10, "quantity": 2, "unit_price": 15000 },
    { "product_id": 12, "quantity": 1, "unit_price": 22000 }
  ]
}
```

#### 처리 규칙
- items 비어 있으면 실패
- 상품 존재 여부 검증
- `product_name_snapshot` 저장
- `line_amount = quantity * unit_price`
- `total_product_amount = SUM(line_amount)`
- shipment 기본 레코드 자동 생성

---

## 5) Shipments
### GET /api/shipments/:orderId
- shipment 조회

### PATCH /api/shipments/:orderId
- 수정 항목: `payment_status`, `paid_at`, `paid_amount`, 배송지, `courier_name`, `tracking_number`, `shipping_status`, `memo`

#### 상태 유효성
- payment_status: `pending | paid`
- shipping_status: `ready | shipped | delivered`
