# FITJOY Backend (FastAPI)

## 실행 방법
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

## 기본 주소
- API Docs: http://127.0.0.1:8001/docs
- Health: http://127.0.0.1:8001/health

## 환경 변수
`.env`에서 서버 포트를 관리합니다. 기본값은 `.env.example`을 참고하세요.

```env
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8001
BACKEND_RELOAD=true
CORS_ORIGINS=*
```

## 구현 범위
- 상품/고객/라이브 세션 생성/조회
- 주문 생성/조회/상세
- 주문 생성 시 `order_items` 저장 + 총액 계산 + `shipment` 자동 생성
- shipment 조회/수정
