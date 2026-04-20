# FITJOY Monorepo Starter

요청하신 스택 기준으로 개발 시작했습니다.

- Backend: FastAPI (`/backend`)
- Frontend: React + Vite (`/frontend`)
- 문서: `/docs`

## 빠른 시작

### 1) Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

## 주요 구현 상태
- 기본 DB 모델 6종(products/customers/live_sessions/orders/order_items/shipments)
- 주문 생성 시 order_items 생성 + total 계산 + shipment 자동 생성
- 상품/고객/라이브/주문/shipment 핵심 API
- React 관리자 시작 화면(등록 + 목록)
