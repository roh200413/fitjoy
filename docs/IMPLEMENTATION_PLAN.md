# FITJOY 구현 계획 (MVP)

## 1단계: 데이터/기반
- [ ] DB 스키마 적용 (MySQL DDL 또는 Prisma migration)
- [ ] 기본 시드 데이터 전략 수립 (상품/고객 샘플)
- [ ] 공통 에러 포맷/검증 정책 정의

## 2단계: 핵심 API
- [ ] 상품 CRUD
- [ ] 고객 CRUD
- [ ] 라이브 방송 CRUD
- [ ] 주문 생성 API (트랜잭션 + shipment 자동 생성)
- [ ] 주문 목록/상세 조회 API
- [ ] shipment 수정 API

## 3단계: 관리자 UI
- [ ] 상품 관리 화면
- [ ] 고객 관리 화면
- [ ] 라이브 방송 관리 화면
- [ ] 주문 입력 화면(빠른 입력 중심)
- [ ] 주문 목록/상세 화면
- [ ] 송장 처리 화면

## 4단계: 운영 편의
- [ ] 페이지네이션
- [ ] 부분 일치 검색
- [ ] 금액 천단위 포맷
- [ ] 한국시간(KST) 표시 정책

## 수용 기준 (Acceptance)
- 주문 생성 시 order_items 합계가 orders.total_product_amount와 일치
- 주문 생성 시 shipments 레코드 자동 생성
- instagram_id 중복 고객 생성 불가
- payment_status / shipping_status enum 검증 동작
