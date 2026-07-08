# FITJOY Frontend (React + Vite)

## 실행 방법
```bash
cd frontend
npm install
npm run dev
```

기본 개발 서버: http://127.0.0.1:5173

## 현재 구현 (페이지)
- 대시보드
- 주문 입력 (다중 상품 라인 추가/삭제 + 총액 미리보기)
- 주문 / 정산 목록
- 송장 관리 (payment/shipping 상태 업데이트)
- 라이브 방송 관리
- 상품 관리
- 고객 관리

## 참고
- 백엔드 API 기본 주소는 `.env`의 `VITE_API_BASE`에서 관리합니다. 기본값은 `http://127.0.0.1:8001`입니다.
- 사이드바 기반 단일 페이지 구조로 모든 화면을 구성했습니다.
