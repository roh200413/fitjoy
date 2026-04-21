import { useEffect, useMemo, useState } from 'react'

const API_BASE = 'http://127.0.0.1:8000'

const MENU = [
  { key: 'dashboard', label: '대시보드', group: 'main' },
  { key: 'order-entry', label: '주문 입력', group: 'main' },
  { key: 'orders', label: '주문 / 정산', group: 'main' },
  { key: 'shipments', label: '송장 관리', group: 'main' },
  { key: 'live-sessions', label: '라이브 방송', group: 'management' },
  { key: 'products', label: '상품 관리', group: 'management' },
  { key: 'customers', label: '고객 관리', group: 'management' },
]

const money = (value) => Number(value || 0).toLocaleString('ko-KR')

async function api(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    throw new Error(await res.text())
  }
  return res.json()
}

function NavButton({ active, onClick, children }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

function Card({ title, sub, action, children }) {
  return (
    <section className="card">
      {(title || action) && (
        <div className="section-head">
          <div>
            {title ? <h4>{title}</h4> : null}
            {sub ? <span>{sub}</span> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [liveSessions, setLiveSessions] = useState([])
  const [orders, setOrders] = useState([])

  const [productForm, setProductForm] = useState({
    product_name: '',
    wholesale_price_jpy: 0,
    retail_price_krw: 0,
    live_price: 0,
    is_active: true,
  })

  const [customerForm, setCustomerForm] = useState({
    instagram_id: '',
    customer_name: '',
    phone_number: '',
    address1: '',
    address2: '',
    is_active: true,
  })

  const [liveForm, setLiveForm] = useState({
    live_title: '',
    live_started_at: '',
    live_ended_at: '',
    memo: '',
  })

  const [orderForm, setOrderForm] = useState({
    customer_id: '',
    live_id: '',
    note: '',
    items: [{ product_id: '', quantity: 1, unit_price: 0 }],
  })

  const [shipmentForm, setShipmentForm] = useState({
    order_id: '',
    payment_status: 'pending',
    paid_amount: '',
    shipping_status: 'ready',
    courier_name: '',
    tracking_number: '',
    shipping_address1: '',
    shipping_address2: '',
    memo: '',
  })

  const orderStats = useMemo(() => {
    const totalCount = orders.length
    const totalAmount = orders.reduce((acc, cur) => acc + cur.total_product_amount, 0)
    const pendingPayments = orders.filter((o) => o.shipment?.payment_status === 'pending').length
    const readyShipments = orders.filter((o) => o.shipment?.shipping_status === 'ready').length
    return { totalCount, totalAmount, pendingPayments, readyShipments }
  }, [orders])

  const activeLive = useMemo(() => {
    if (!liveSessions.length) return null
    return liveSessions[0]
  }, [liveSessions])

  async function refreshAll() {
    try {
      setLoading(true)
      setError('')
      const [p, c, l, o] = await Promise.all([
        api('/api/products').catch(() => []),
        api('/api/customers').catch(() => []),
        api('/api/live-sessions').catch(() => []),
        api('/api/orders').catch(() => []),
      ])
      setProducts(p)
      setCustomers(c)
      setLiveSessions(l)
      setOrders(o)
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  function setOrderItem(index, key, value) {
    setOrderForm((prev) => {
      const nextItems = [...prev.items]
      nextItems[index] = { ...nextItems[index], [key]: value }
      return { ...prev, items: nextItems }
    })
  }

  function addOrderItem() {
    setOrderForm((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: 1, unit_price: 0 }],
    }))
  }

  function removeOrderItem(index) {
    setOrderForm((prev) => {
      const nextItems = prev.items.filter((_, idx) => idx !== index)
      return { ...prev, items: nextItems.length ? nextItems : [{ product_id: '', quantity: 1, unit_price: 0 }] }
    })
  }

  const orderTotalPreview = orderForm.items.reduce(
    (acc, item) => acc + Number(item.quantity || 0) * Number(item.unit_price || 0),
    0,
  )

  async function submitProduct(e) {
    e.preventDefault()
    await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        ...productForm,
        wholesale_price_jpy: Number(productForm.wholesale_price_jpy),
        retail_price_krw: Number(productForm.retail_price_krw),
        live_price: Number(productForm.live_price),
      }),
    })
    setProductForm({ product_name: '', wholesale_price_jpy: 0, retail_price_krw: 0, live_price: 0, is_active: true })
    refreshAll()
  }

  async function submitCustomer(e) {
    e.preventDefault()
    await api('/api/customers', { method: 'POST', body: JSON.stringify(customerForm) })
    setCustomerForm({ instagram_id: '', customer_name: '', phone_number: '', address1: '', address2: '', is_active: true })
    refreshAll()
  }

  async function submitLive(e) {
    e.preventDefault()
    await api('/api/live-sessions', {
      method: 'POST',
      body: JSON.stringify({
        ...liveForm,
        live_started_at: liveForm.live_started_at || null,
        live_ended_at: liveForm.live_ended_at || null,
      }),
    })
    setLiveForm({ live_title: '', live_started_at: '', live_ended_at: '', memo: '' })
    refreshAll()
  }

  async function submitOrder(e) {
    e.preventDefault()
    if (!orderForm.items.length) return
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: Number(orderForm.customer_id),
        live_id: Number(orderForm.live_id),
        note: orderForm.note,
        items: orderForm.items.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
        })),
      }),
    })
    setOrderForm({ customer_id: '', live_id: '', note: '', items: [{ product_id: '', quantity: 1, unit_price: 0 }] })
    setActiveMenu('orders')
    refreshAll()
  }

  async function submitShipment(e) {
    e.preventDefault()
    await api(`/api/shipments/${shipmentForm.order_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        payment_status: shipmentForm.payment_status,
        paid_amount: shipmentForm.paid_amount ? Number(shipmentForm.paid_amount) : null,
        shipping_status: shipmentForm.shipping_status,
        courier_name: shipmentForm.courier_name || null,
        tracking_number: shipmentForm.tracking_number || null,
        shipping_address1: shipmentForm.shipping_address1 || null,
        shipping_address2: shipmentForm.shipping_address2 || null,
        memo: shipmentForm.memo || null,
      }),
    })
    refreshAll()
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-badge">FJ</div>
          <div className="brand-text">
            <h1>FITJOY</h1>
            <p>라이브 판매 관리자</p>
          </div>
        </div>

        <div className="nav-group">
          <div className="nav-label">Main</div>
          {MENU.filter((m) => m.group === 'main').map((item) => (
            <NavButton key={item.key} active={activeMenu === item.key} onClick={() => setActiveMenu(item.key)}>
              {item.label}
            </NavButton>
          ))}
        </div>

        <div className="nav-group">
          <div className="nav-label">Management</div>
          {MENU.filter((m) => m.group === 'management').map((item) => (
            <NavButton key={item.key} active={activeMenu === item.key} onClick={() => setActiveMenu(item.key)}>
              {item.label}
            </NavButton>
          ))}
        </div>

        <div className="sidebar-footer">
          오늘 라이브 운영 포인트
          <br />- 미입금 주문 우선 확인
          <br />- 발송 대기건 송장 입력
          <br />- 신규 고객 주소 누락 확인
        </div>
      </aside>

      <main className="main">
        <section className="topbar">
          <div>
            <h2>{MENU.find((m) => m.key === activeMenu)?.label || '대시보드'}</h2>
            <p>FITJOY 라이브 판매 현황을 한눈에 확인하고 바로 다음 작업으로 이동할 수 있습니다.</p>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-light" onClick={() => setActiveMenu('live-sessions')}>라이브 생성</button>
            <button className="btn btn-primary" onClick={() => setActiveMenu('order-entry')}>주문 입력 시작</button>
          </div>
        </section>

        {error ? <div className="error-banner">오류: {error}</div> : null}
        {loading ? <div className="muted">데이터 불러오는 중...</div> : null}

        {activeMenu === 'dashboard' && (
          <>
            <section className="hero">
              <div>
                <h3>오늘 저녁 라이브 운영 현황</h3>
                <p>
                  주문 생성, 입금 확인, 송장 입력까지 한 화면 흐름으로 처리할 수 있도록 설계된
                  FITJOY 내부 관리자 홈입니다. MVP 기준으로 가장 자주 쓰는 지표와 최근 주문을 우선 배치했습니다.
                </p>
                <div className="hero-tags">
                  <span className="tag">1인 운영 최적화</span>
                  <span className="tag">주문 총액 자동 계산</span>
                  <span className="tag">입금/배송 통합 관리</span>
                </div>
              </div>
              <div className="hero-side">
                <div>
                  <div className="label">현재 활성 방송</div>
                  <div className="value">{liveSessions.length ? '1건' : '0건'}</div>
                </div>
                <div>
                  <div className="label">방송명</div>
                  <strong>{activeLive?.live_title || '진행 중 방송 없음'}</strong>
                </div>
                <div>
                  <div className="label">진행 메모</div>
                  <span>{activeLive?.memo || '신상 캐릭터 키링 / 파우치 중심 판매'}</span>
                </div>
              </div>
            </section>

            <section className="grid-4">
              <div className="card">
                <div className="stat-title">오늘 주문 수</div>
                <div className="stat-value">{orderStats.totalCount}</div>
                <div className="stat-sub success">최근 입력 데이터 기준</div>
              </div>
              <div className="card">
                <div className="stat-title">오늘 주문 금액</div>
                <div className="stat-value">₩{money(orderStats.totalAmount)}</div>
                <div className="stat-sub blue">주문상품 합계 기준</div>
              </div>
              <div className="card">
                <div className="stat-title">입금 대기</div>
                <div className="stat-value">{orderStats.pendingPayments}건</div>
                <div className="stat-sub warn">빠른 확인 필요</div>
              </div>
              <div className="card">
                <div className="stat-title">발송 대기</div>
                <div className="stat-value">{orderStats.readyShipments}건</div>
                <div className="stat-sub">송장 입력 후 처리 가능</div>
              </div>
            </section>

            <section className="content-grid">
              <Card
                title="최근 주문"
                sub="최신 주문 5건"
                action={<button className="btn btn-light" onClick={() => setActiveMenu('orders')}>전체 보기</button>}
              >
                <table>
                  <thead>
                    <tr>
                      <th>주문번호</th>
                      <th>고객ID</th>
                      <th>방송ID</th>
                      <th>총금액</th>
                      <th>입금</th>
                      <th>배송</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 5).map((o) => (
                      <tr key={o.id}>
                        <td>{o.order_code}</td>
                        <td>{o.customer_id}</td>
                        <td>{o.live_id}</td>
                        <td>₩{money(o.total_product_amount)}</td>
                        <td><span className={`pill ${o.shipment?.payment_status}`}>{o.shipment?.payment_status || '-'}</span></td>
                        <td><span className={`pill ${o.shipment?.shipping_status}`}>{o.shipment?.shipping_status || '-'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card title="처리 우선 목록" sub="오늘 바로 확인할 항목">
                <div className="list">
                  <div className="list-item">
                    <div>
                      <h5>미입금 주문 확인</h5>
                      <p>입금 대기 상태 주문 중 오래된 순으로 확인이 필요합니다.</p>
                    </div>
                    <div className="amount">{orderStats.pendingPayments}건</div>
                  </div>
                  <div className="list-item">
                    <div>
                      <h5>송장 입력 대기</h5>
                      <p>입금 완료되었지만 아직 발송 처리되지 않은 주문입니다.</p>
                    </div>
                    <div className="amount">{orderStats.readyShipments}건</div>
                  </div>
                  <div className="list-item">
                    <div>
                      <h5>신규 고객 주소 보완</h5>
                      <p>주문은 있으나 연락처 또는 주소 정보가 누락된 고객입니다.</p>
                    </div>
                    <div className="amount">{Math.max(customers.length - 2, 0)}건</div>
                  </div>
                </div>
              </Card>
            </section>
          </>
        )}

        {activeMenu === 'order-entry' && (
          <Card title="주문 입력" sub="고객/방송 선택 후 다중 상품을 추가하세요.">
            <form className="form-grid" onSubmit={submitOrder}>
              <label>
                고객
                <select value={orderForm.customer_id} onChange={(e) => setOrderForm((s) => ({ ...s, customer_id: e.target.value }))} required>
                  <option value="">선택</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.instagram_id} ({c.customer_name || '-'})</option>)}
                </select>
              </label>
              <label>
                방송
                <select value={orderForm.live_id} onChange={(e) => setOrderForm((s) => ({ ...s, live_id: e.target.value }))} required>
                  <option value="">선택</option>
                  {liveSessions.map((l) => <option key={l.id} value={l.id}>{l.live_title}</option>)}
                </select>
              </label>
              <label className="full">
                메모
                <input value={orderForm.note} onChange={(e) => setOrderForm((s) => ({ ...s, note: e.target.value }))} placeholder="DM 확인 등" />
              </label>

              <div className="full">
                <div className="section-head compact">
                  <h4>주문 상품</h4>
                  <button type="button" className="btn btn-light" onClick={addOrderItem}>상품 추가</button>
                </div>
                <div className="line-items">
                  {orderForm.items.map((item, idx) => (
                    <div className="line-item" key={`${idx}-${item.product_id}`}>
                      <select value={item.product_id} onChange={(e) => {
                        const selected = products.find((p) => String(p.id) === e.target.value)
                        setOrderItem(idx, 'product_id', e.target.value)
                        if (selected) setOrderItem(idx, 'unit_price', selected.live_price)
                      }} required>
                        <option value="">상품 선택</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.product_name}</option>)}
                      </select>
                      <input type="number" min="1" value={item.quantity} onChange={(e) => setOrderItem(idx, 'quantity', e.target.value)} required />
                      <input type="number" min="0" value={item.unit_price} onChange={(e) => setOrderItem(idx, 'unit_price', e.target.value)} required />
                      <div className="line-total">₩{money(Number(item.quantity) * Number(item.unit_price))}</div>
                      <button type="button" className="btn btn-light" onClick={() => removeOrderItem(idx)}>삭제</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="full actions-row">
                <strong>총액: ₩{money(orderTotalPreview)}</strong>
                <button className="btn btn-primary" type="submit">주문 저장</button>
              </div>
            </form>
          </Card>
        )}

        {activeMenu === 'orders' && (
          <Card title="주문 / 정산" sub="주문 상세와 입금/배송 상태를 함께 확인합니다.">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>주문번호</th>
                  <th>고객ID</th>
                  <th>방송ID</th>
                  <th>총금액</th>
                  <th>입금</th>
                  <th>배송</th>
                  <th>아이템 수</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.id}</td>
                    <td>{o.order_code}</td>
                    <td>{o.customer_id}</td>
                    <td>{o.live_id}</td>
                    <td>₩{money(o.total_product_amount)}</td>
                    <td><span className={`pill ${o.shipment?.payment_status}`}>{o.shipment?.payment_status || '-'}</span></td>
                    <td><span className={`pill ${o.shipment?.shipping_status}`}>{o.shipment?.shipping_status || '-'}</span></td>
                    <td>{o.items?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {activeMenu === 'shipments' && (
          <Card title="송장 관리" sub="주문별 입금/배송 정보를 업데이트합니다.">
            <form className="form-grid" onSubmit={submitShipment}>
              <label>
                주문 ID
                <select value={shipmentForm.order_id} onChange={(e) => setShipmentForm((s) => ({ ...s, order_id: e.target.value }))} required>
                  <option value="">선택</option>
                  {orders.map((o) => <option key={o.id} value={o.id}>{o.id} / {o.order_code}</option>)}
                </select>
              </label>
              <label>
                입금 상태
                <select value={shipmentForm.payment_status} onChange={(e) => setShipmentForm((s) => ({ ...s, payment_status: e.target.value }))}>
                  <option value="pending">pending</option>
                  <option value="paid">paid</option>
                </select>
              </label>
              <label>
                입금 금액
                <input type="number" min="0" value={shipmentForm.paid_amount} onChange={(e) => setShipmentForm((s) => ({ ...s, paid_amount: e.target.value }))} />
              </label>
              <label>
                배송 상태
                <select value={shipmentForm.shipping_status} onChange={(e) => setShipmentForm((s) => ({ ...s, shipping_status: e.target.value }))}>
                  <option value="ready">ready</option>
                  <option value="shipped">shipped</option>
                  <option value="delivered">delivered</option>
                </select>
              </label>
              <label>
                택배사
                <input value={shipmentForm.courier_name} onChange={(e) => setShipmentForm((s) => ({ ...s, courier_name: e.target.value }))} />
              </label>
              <label>
                송장번호
                <input value={shipmentForm.tracking_number} onChange={(e) => setShipmentForm((s) => ({ ...s, tracking_number: e.target.value }))} />
              </label>
              <label>
                배송지1
                <input value={shipmentForm.shipping_address1} onChange={(e) => setShipmentForm((s) => ({ ...s, shipping_address1: e.target.value }))} />
              </label>
              <label>
                배송지2
                <input value={shipmentForm.shipping_address2} onChange={(e) => setShipmentForm((s) => ({ ...s, shipping_address2: e.target.value }))} />
              </label>
              <label className="full">
                메모
                <textarea value={shipmentForm.memo} onChange={(e) => setShipmentForm((s) => ({ ...s, memo: e.target.value }))} />
              </label>
              <div className="full actions-row">
                <button className="btn btn-primary" type="submit">송장 정보 저장</button>
              </div>
            </form>
          </Card>
        )}

        {activeMenu === 'live-sessions' && (
          <div className="content-grid single">
            <Card title="라이브 방송 생성" sub="방송명/시간/메모를 입력하세요.">
              <form className="form-grid" onSubmit={submitLive}>
                <label>
                  방송명
                  <input value={liveForm.live_title} onChange={(e) => setLiveForm((s) => ({ ...s, live_title: e.target.value }))} required />
                </label>
                <label>
                  시작일시
                  <input type="datetime-local" value={liveForm.live_started_at} onChange={(e) => setLiveForm((s) => ({ ...s, live_started_at: e.target.value }))} />
                </label>
                <label>
                  종료일시
                  <input type="datetime-local" value={liveForm.live_ended_at} onChange={(e) => setLiveForm((s) => ({ ...s, live_ended_at: e.target.value }))} />
                </label>
                <label className="full">
                  메모
                  <textarea value={liveForm.memo} onChange={(e) => setLiveForm((s) => ({ ...s, memo: e.target.value }))} />
                </label>
                <div className="full actions-row"><button className="btn btn-primary" type="submit">방송 생성</button></div>
              </form>
            </Card>

            <Card title="방송 목록" sub="최근 생성 순">
              <table>
                <thead><tr><th>ID</th><th>방송명</th><th>시작</th><th>종료</th></tr></thead>
                <tbody>
                  {liveSessions.map((l) => <tr key={l.id}><td>{l.id}</td><td>{l.live_title}</td><td>{l.live_started_at || '-'}</td><td>{l.live_ended_at || '-'}</td></tr>)}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {activeMenu === 'products' && (
          <div className="content-grid single">
            <Card title="상품 등록" sub="라방 가격 포함">
              <form className="form-grid" onSubmit={submitProduct}>
                <label>
                  상품명
                  <input value={productForm.product_name} onChange={(e) => setProductForm((s) => ({ ...s, product_name: e.target.value }))} required />
                </label>
                <label>
                  일본 도매가(엔)
                  <input type="number" min="0" value={productForm.wholesale_price_jpy} onChange={(e) => setProductForm((s) => ({ ...s, wholesale_price_jpy: e.target.value }))} />
                </label>
                <label>
                  일본 소매가(원)
                  <input type="number" min="0" value={productForm.retail_price_krw} onChange={(e) => setProductForm((s) => ({ ...s, retail_price_krw: e.target.value }))} />
                </label>
                <label>
                  라방 가격
                  <input type="number" min="0" value={productForm.live_price} onChange={(e) => setProductForm((s) => ({ ...s, live_price: e.target.value }))} required />
                </label>
                <div className="full actions-row"><button className="btn btn-primary" type="submit">상품 저장</button></div>
              </form>
            </Card>
            <Card title="상품 목록" sub="최신순">
              <table>
                <thead><tr><th>ID</th><th>상품명</th><th>도매가</th><th>소매가</th><th>라방가</th><th>상태</th></tr></thead>
                <tbody>
                  {products.map((p) => <tr key={p.id}><td>{p.id}</td><td>{p.product_name}</td><td>{money(p.wholesale_price_jpy)}</td><td>{money(p.retail_price_krw)}</td><td>{money(p.live_price)}</td><td>{p.is_active ? '사용' : '비활성'}</td></tr>)}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {activeMenu === 'customers' && (
          <div className="content-grid single">
            <Card title="고객 등록" sub="인스타 ID 고유값">
              <form className="form-grid" onSubmit={submitCustomer}>
                <label>
                  인스타 ID
                  <input value={customerForm.instagram_id} onChange={(e) => setCustomerForm((s) => ({ ...s, instagram_id: e.target.value }))} required />
                </label>
                <label>
                  이름
                  <input value={customerForm.customer_name} onChange={(e) => setCustomerForm((s) => ({ ...s, customer_name: e.target.value }))} />
                </label>
                <label>
                  연락처
                  <input value={customerForm.phone_number} onChange={(e) => setCustomerForm((s) => ({ ...s, phone_number: e.target.value }))} />
                </label>
                <label>
                  주소1
                  <input value={customerForm.address1} onChange={(e) => setCustomerForm((s) => ({ ...s, address1: e.target.value }))} />
                </label>
                <label className="full">
                  주소2
                  <input value={customerForm.address2} onChange={(e) => setCustomerForm((s) => ({ ...s, address2: e.target.value }))} />
                </label>
                <div className="full actions-row"><button className="btn btn-primary" type="submit">고객 저장</button></div>
              </form>
            </Card>
            <Card title="고객 목록" sub="최근 등록순">
              <table>
                <thead><tr><th>ID</th><th>인스타 ID</th><th>이름</th><th>연락처</th><th>주소</th></tr></thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      <td>{c.instagram_id}</td>
                      <td>{c.customer_name || '-'}</td>
                      <td>{c.phone_number || '-'}</td>
                      <td>{[c.address1, c.address2].filter(Boolean).join(' ') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
