# FITJOY Backend (FastAPI)

## 실행 방법
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## 기본 주소
- API Docs: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

## 구현 범위
- 상품/고객/라이브 세션 생성/조회
- 주문 생성/조회/상세
- 주문 생성 시 `order_items` 저장 + 총액 계산 + `shipment` 자동 생성
- shipment 조회/수정
