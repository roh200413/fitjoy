import { useEffect, useMemo, useState } from 'react'

const API_BASE = 'http://127.0.0.1:8000'

async function api(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

function Section({ title, children }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export default function App() {
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [liveSessions, setLiveSessions] = useState([])
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')

  const [productForm, setProductForm] = useState({ product_name: '', live_price: 0, wholesale_price_jpy: 0, retail_price_krw: 0 })
  const [customerForm, setCustomerForm] = useState({ instagram_id: '', customer_name: '' })
  const [liveForm, setLiveForm] = useState({ live_title: '' })
  const [orderForm, setOrderForm] = useState({ customer_id: '', live_id: '', product_id: '', quantity: 1, unit_price: 0 })

  async function refreshAll() {
    try {
      setError('')
      const [p, c, l, o] = await Promise.all([
        api('/api/products'),
        api('/api/customers'),
        api('/api/live-sessions'),
        api('/api/orders'),
      ])
      setProducts(p)
      setCustomers(c)
      setLiveSessions(l)
      setOrders(o)
    } catch (e) {
      setError(String(e.message || e))
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === String(orderForm.product_id)),
    [products, orderForm.product_id],
  )

  async function submitProduct(e) {
    e.preventDefault()
    await api('/api/products', { method: 'POST', body: JSON.stringify({ ...productForm, live_price: Number(productForm.live_price), wholesale_price_jpy: Number(productForm.wholesale_price_jpy), retail_price_krw: Number(productForm.retail_price_krw) }) })
    setProductForm({ product_name: '', live_price: 0, wholesale_price_jpy: 0, retail_price_krw: 0 })
    refreshAll()
  }

  async function submitCustomer(e) {
    e.preventDefault()
    await api('/api/customers', { method: 'POST', body: JSON.stringify(customerForm) })
    setCustomerForm({ instagram_id: '', customer_name: '' })
    refreshAll()
  }

  async function submitLive(e) {
    e.preventDefault()
    await api('/api/live-sessions', { method: 'POST', body: JSON.stringify(liveForm) })
    setLiveForm({ live_title: '' })
    refreshAll()
  }

  async function submitOrder(e) {
    e.preventDefault()
    const unitPrice = Number(orderForm.unit_price || selectedProduct?.live_price || 0)
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: Number(orderForm.customer_id),
        live_id: Number(orderForm.live_id),
        items: [{ product_id: Number(orderForm.product_id), quantity: Number(orderForm.quantity), unit_price: unitPrice }],
      }),
    })
    setOrderForm({ customer_id: '', live_id: '', product_id: '', quantity: 1, unit_price: 0 })
    refreshAll()
  }

  return (
    <main className="container">
      <h1>FITJOY Admin Starter (React + FastAPI)</h1>
      <p className="sub">MVP 개발 시작용 최소 관리자 화면</p>

      {error ? <div className="error">오류: {error}</div> : null}

      <div className="grid">
        <Section title="상품 등록">
          <form onSubmit={submitProduct} className="form">
            <input placeholder="상품명" value={productForm.product_name} onChange={(e) => setProductForm((s) => ({ ...s, product_name: e.target.value }))} required />
            <input type="number" placeholder="라이브 가격" value={productForm.live_price} onChange={(e) => setProductForm((s) => ({ ...s, live_price: e.target.value }))} required />
            <button type="submit">등록</button>
          </form>
        </Section>

        <Section title="고객 등록">
          <form onSubmit={submitCustomer} className="form">
            <input placeholder="인스타 ID" value={customerForm.instagram_id} onChange={(e) => setCustomerForm((s) => ({ ...s, instagram_id: e.target.value }))} required />
            <input placeholder="고객명" value={customerForm.customer_name} onChange={(e) => setCustomerForm((s) => ({ ...s, customer_name: e.target.value }))} />
            <button type="submit">등록</button>
          </form>
        </Section>

        <Section title="라이브 생성">
          <form onSubmit={submitLive} className="form">
            <input placeholder="라이브 제목" value={liveForm.live_title} onChange={(e) => setLiveForm({ live_title: e.target.value })} required />
            <button type="submit">생성</button>
          </form>
        </Section>

        <Section title="주문 생성 (단일 품목)">
          <form onSubmit={submitOrder} className="form">
            <select value={orderForm.customer_id} onChange={(e) => setOrderForm((s) => ({ ...s, customer_id: e.target.value }))} required>
              <option value="">고객 선택</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.instagram_id}</option>)}
            </select>
            <select value={orderForm.live_id} onChange={(e) => setOrderForm((s) => ({ ...s, live_id: e.target.value }))} required>
              <option value="">라이브 선택</option>
              {liveSessions.map((l) => <option key={l.id} value={l.id}>{l.live_title}</option>)}
            </select>
            <select value={orderForm.product_id} onChange={(e) => setOrderForm((s) => ({ ...s, product_id: e.target.value, unit_price: selectedProduct?.live_price || 0 }))} required>
              <option value="">상품 선택</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.product_name}</option>)}
            </select>
            <input type="number" min="1" value={orderForm.quantity} onChange={(e) => setOrderForm((s) => ({ ...s, quantity: e.target.value }))} required />
            <input type="number" min="0" value={orderForm.unit_price} onChange={(e) => setOrderForm((s) => ({ ...s, unit_price: e.target.value }))} required />
            <button type="submit">주문 저장</button>
          </form>
        </Section>
      </div>

      <Section title="최근 주문">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>주문코드</th>
              <th>고객ID</th>
              <th>라이브ID</th>
              <th>총액</th>
              <th>입금</th>
              <th>배송</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.order_code}</td>
                <td>{o.customer_id}</td>
                <td>{o.live_id}</td>
                <td>{o.total_product_amount.toLocaleString()}</td>
                <td>{o.shipment?.payment_status}</td>
                <td>{o.shipment?.shipping_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </main>
  )
}
