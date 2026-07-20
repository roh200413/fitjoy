import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const EXCHANGE_RATE_STORAGE_KEY = 'fitjoy-exchange-rates'
const DEFAULT_SHIPPING_FEE_STORAGE_KEY = 'fitjoy-default-shipping-fee'
const PIN_UNLOCKED_STORAGE_KEY = 'fitjoy-pin-unlocked'

const MENU = [
  { key: 'dashboard', label: '대시보드', group: 'main' },
  { key: 'calendar', label: '캘린더', group: 'main' },
  { key: 'orders', label: '주문 / 정산', group: 'main' },
  { key: 'live-sessions', label: '라이브 관리', group: 'management' },
  { key: 'products', label: '상품 관리', group: 'management' },
  { key: 'inventory', label: '입고 관리', group: 'management' },
  { key: 'customers', label: '고객 관리', group: 'management' },
]

const MENU_ROUTE_MAP = {
  dashboard: '/dashboard',
  calendar: '/calendar',
  orders: '/orders',
  'live-sessions': '/live-sessions',
  products: '/products',
  inventory: '/inventory',
  customers: '/customers',
}

const ROUTE_MENU_MAP = {
  ...Object.fromEntries(Object.entries(MENU_ROUTE_MAP).map(([menuKey, path]) => [path, menuKey])),
  '/invoices': 'orders',
}

const PAYMENT_LABELS = {
  pending: '입금 대기',
  paid: '입금 완료',
}

const SHIPPING_LABELS = {
  ready: '배송 준비',
  shipped: '배송 중',
  delivered: '배송 완료',
}

const SHIPPING_TYPE_LABELS = {
  direct: '바로 배송',
  keep: 'Keep',
}

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

const HISTORY_FIELD_LABELS = {
  payment_status: '결제 상태',
  paid_amount: '입금액',
  receiver_name: '수령인',
  receiver_phone: '연락처',
  shipping_status: '배송 상태',
  courier_name: '택배사',
  tracking_number: '운송장 번호',
  shipping_address1: '주소 1',
  shipping_address2: '주소 2',
  memo: '메모',
}

const money = (value) => Number(value || 0).toLocaleString('ko-KR')
const todayKey = () => new Intl.DateTimeFormat('sv-SE').format(new Date())
const todayMonthKey = () => todayKey().slice(0, 7)
const getProductRowKey = (product) => (product.localId ? `draft-${product.localId}` : `product-${product.id}`)

function getMenuKeyFromHash() {
  if (typeof window === 'undefined') return 'orders'
  const hash = window.location.hash || ''
  const route = hash.startsWith('#') ? hash.slice(1) : hash
  return ROUTE_MENU_MAP[route] || 'orders'
}

function getHashFromMenuKey(menuKey) {
  return `#${MENU_ROUTE_MAP[menuKey] || MENU_ROUTE_MAP.orders}`
}

function normalizeProductRow(product = {}) {
  return {
    barcode: product.barcode || '',
    product_name: product.product_name || '',
    wholesale_price_jpy: Number(product.wholesale_price_jpy || 0),
    retail_price_krw: Number(product.retail_price_krw || 0),
    live_price: Number(product.live_price || 0),
    stock_quantity: Number(product.stock_quantity || 0),
    is_active: product.is_active !== false,
  }
}

function toDateKey(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('sv-SE').format(date)
}

function toMonthKey(value) {
  const dateKey = toDateKey(value)
  return dateKey ? dateKey.slice(0, 7) : ''
}

function getCalendarDates(baseDateKey) {
  const baseDate = new Date(`${baseDateKey}T00:00:00`)
  const day = baseDate.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const startDate = new Date(baseDate)
  startDate.setDate(baseDate.getDate() + mondayOffset - 7)

  return Array.from({ length: 28 }, (_, index) => {
    const current = new Date(startDate)
    current.setDate(startDate.getDate() + index)
    return new Intl.DateTimeFormat('sv-SE').format(current)
  })
}

function formatDateTime(value) {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getInvoiceDocumentName(order, customer) {
  if (!order) return '-'
  const createdDate = toDateKey(order.created_at) || toDateKey(order.settlement_date) || '날짜없음'
  const instagramId = customer?.instagram_id || `고객${order.customer_id}`
  const customerLabel = customer?.customer_name ? `${customer.customer_name}(${instagramId})` : instagramId
  return `${createdDate}_${customerLabel}`
}

function getCustomerOptionLabel(customer) {
  if (!customer) return ''
  return customer.customer_name ? `${customer.customer_name} (${customer.instagram_id})` : customer.instagram_id
}

function formatHistoryValue(fieldName, value) {
  if (value === null || value === undefined || value === '') return '-'
  if (fieldName === 'payment_status') return PAYMENT_LABELS[value] || value
  if (fieldName === 'shipping_status') return SHIPPING_LABELS[value] || value
  if (fieldName === 'paid_amount') return `₩ ${money(value)}`
  return value
}

function loadExchangeRates() {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadDefaultShippingFee() {
  if (typeof window === 'undefined') return 0

  try {
    const raw = window.localStorage.getItem(DEFAULT_SHIPPING_FEE_STORAGE_KEY)
    return raw ? Number(raw) || 0 : 0
  } catch {
    return 0
  }
}

async function api(path, options) {
  const normalizedBase = API_BASE.replace(/\/$/, '')
  const normalizedPath = normalizedBase.endsWith('/api') && path.startsWith('/api/')
    ? path.slice(4)
    : path
  const response = await fetch(`${normalizedBase}${normalizedPath}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json()
}

function getReadableErrorMessage(caughtError, fallbackMessage = '처리 중 오류가 발생했습니다.') {
  const rawMessage = String(caughtError?.message || caughtError || '').trim()
  if (!rawMessage) return fallbackMessage

  try {
    const parsed = JSON.parse(rawMessage)
    const detail = typeof parsed?.detail === 'string' ? parsed.detail : ''
    if (detail === 'barcode already exists') {
      return '이미 등록된 바코드입니다.'
    }
    if (detail) return detail
  } catch {
    // Keep the original message when it is not JSON.
  }

  if (rawMessage === 'barcode already exists') {
    return '이미 등록된 바코드입니다.'
  }

  return rawMessage
}

function NavButton({ active, onClick, children }) {
  return (
    <button type="button" className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

function Card({ title, sub, titleBadge, className = '', action, children, ...props }) {
  return (
    <section className={`card ${className}`.trim()} {...props}>
      {(title || sub || action) && (
        <div className="section-head">
          <div>
            {title ? (
              <div className="section-title-row">
                <h4>{title}</h4>
                {titleBadge ? <span className="section-badge">{titleBadge}</span> : null}
              </div>
            ) : null}
            {sub ? <span>{sub}</span> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

function Modal({ title, sub, onClose, children, hideCloseButton = false }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            {title ? <h4>{title}</h4> : null}
            {sub ? <span>{sub}</span> : null}
          </div>
          {hideCloseButton ? null : (
            <button type="button" className="btn btn-light" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
        {children}
      </section>
    </div>
  )
}

function InvoiceViewer({ order, customer }) {
  if (!order) {
    return (
      <div className="invoice-empty">
        <strong>왼쪽 목록에서 정산서를 선택해 주세요.</strong>
        <p>주문과 배송 정보를 반 A4 문서형 정산서로 미리볼 수 있습니다.</p>
      </div>
    )
  }

  const shipment = order.shipment || {}
  const receiverName = shipment.receiver_name || customer?.customer_name || customer?.instagram_id || '-'
  const receiverPhone = shipment.receiver_phone || customer?.phone_number || '-'
  const address =
    [shipment.shipping_address1, shipment.shipping_address2].filter(Boolean).join(' ') ||
    [customer?.address1, customer?.address2].filter(Boolean).join(' ') ||
    '-'
  const paidAmount = shipment.paid_amount ?? order.total_product_amount
  const shippingFee = Number(order.shipping_fee || 0)
  const settlementTotal = Number(order.total_product_amount || 0) + shippingFee
  const settlementGap = Math.max(settlementTotal - Number(paidAmount || 0), 0)
  const invoiceDocumentName = getInvoiceDocumentName(order, customer)

  return (
    <div className="invoice-sheet-wrap">
      <article className="invoice-sheet">
        <header className="invoice-header">
          <div>
            <div className="invoice-eyebrow">FITJOY Settlement Viewer</div>
            <h3>정산서</h3>
            <p>주문과 배송 정보를 한 장의 문서로 정리한 뷰어입니다.</p>
          </div>
          <div className="invoice-badge">
            <span>문서명</span>
            <strong>{invoiceDocumentName}</strong>
          </div>
        </header>

        <section className="invoice-meta-grid">
          <div className="meta-box">
            <span>결제 상태</span>
            <strong>{PAYMENT_LABELS[shipment.payment_status] || shipment.payment_status || '-'}</strong>
            <small>{shipment.paid_at ? formatDateTime(shipment.paid_at) : '결제 일시 없음'}</small>
          </div>
          <div className="meta-box">
            <span>배송 상태</span>
            <strong>{SHIPPING_LABELS[shipment.shipping_status] || shipment.shipping_status || '-'}</strong>
            <small>{shipment.tracking_number || '운송장 정보 없음'}</small>
          </div>
        </section>

        <section className="invoice-summary-line">
          <span>
            입금액 <strong>₩ {money(paidAmount)}</strong>
          </span>
          <span>
            미정산액 <strong>₩ {money(settlementGap)}</strong>
          </span>
          <span className="accent">
            최종 정산 금액 <strong>₩ {money(settlementTotal)}</strong>
          </span>
        </section>

        <section className="invoice-table-block">
          <div className="invoice-table-title">판매 항목</div>
          <table className="compact-table">
            <thead>
              <tr>
                <th>상품명</th>
                <th>수량</th>
                <th>단가</th>
                <th>금액</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.product_name_snapshot}</td>
                  <td>{item.quantity}</td>
                  <td>₩ {money(item.unit_price)}</td>
                  <td>₩ {money(item.line_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="invoice-shipping-row">
                <td colSpan={3}>배송비</td>
                <td>₩ {money(shippingFee)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="invoice-detail-grid">
          <div className="detail-box">
            <div className="invoice-table-title">수령 정보</div>
            <dl>
              <div>
                <dt>수령인</dt>
                <dd>{receiverName}</dd>
              </div>
              <div>
                <dt>연락처</dt>
                <dd>{receiverPhone}</dd>
              </div>
              <div>
                <dt>주소</dt>
                <dd>{address}</dd>
              </div>
            </dl>
          </div>

          <div className="detail-box">
            <div className="invoice-table-title">배송 메모</div>
            <dl>
              <div>
                <dt>배송 유형</dt>
                <dd>{SHIPPING_TYPE_LABELS[shipment.shipping_type || 'direct'] || '-'}</dd>
              </div>
              <div>
                <dt>택배사</dt>
                <dd>{shipment.courier_name || '-'}</dd>
              </div>
              <div>
                <dt>운송장 번호</dt>
                <dd>{shipment.tracking_number || '-'}</dd>
              </div>
              <div>
                <dt>메모</dt>
                <dd>{shipment.memo || order.note || '-'}</dd>
              </div>
            </dl>
          </div>
        </section>

        <footer className="invoice-footer">
          <span>생성 시각</span>
          <strong>{formatDateTime(new Date().toISOString())}</strong>
        </footer>
      </article>
    </div>
  )
}

function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsVerifying(true)
    try {
      await api('/api/auth/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      })
      onUnlock()
    } catch (caughtError) {
      setError('PIN이 올바르지 않습니다.')
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="pin-gate">
      <form className="pin-gate-card" onSubmit={handleSubmit}>
        <div className="brand-badge">FJ</div>
        <h2>FITJOY</h2>
        <p>접근 PIN을 입력하세요.</p>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          autoFocus
          required
        />
        {error ? <div className="error-banner">{error}</div> : null}
        <button type="submit" className="btn btn-primary" disabled={isVerifying}>
          {isVerifying ? '확인 중...' : '입장'}
        </button>
      </form>
    </div>
  )
}

export default function App() {
  const today = todayKey()
  const emptyCustomerForm = {
    instagram_id: '',
    customer_name: '',
    phone_number: '',
    address1: '',
    address2: '',
    is_active: true,
  }
  const emptyLiveForm = {
    live_title: '',
    live_started_at: today,
    memo: '',
  }
  const [isPinUnlocked, setIsPinUnlocked] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(PIN_UNLOCKED_STORAGE_KEY) === 'true'
  })
  const [isPinChangeModalOpen, setIsPinChangeModalOpen] = useState(false)
  const [pinChangeForm, setPinChangeForm] = useState({ current_pin: '', new_pin: '', confirm_pin: '' })
  const [isChangingPin, setIsChangingPin] = useState(false)
  const [activeMenu, setActiveMenu] = useState(() => getMenuKeyFromHash())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [liveSessions, setLiveSessions] = useState([])
  const [orders, setOrders] = useState([])
  const [changeHistories, setChangeHistories] = useState([])
  const [inventoryMovements, setInventoryMovements] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [invoiceFilterDate, setInvoiceFilterDate] = useState(today)
  const [invoiceFilterMonth, setInvoiceFilterMonth] = useState(todayMonthKey())
  const [expandedOrderId, setExpandedOrderId] = useState(null)
  const [expandedInboundGroupKey, setExpandedInboundGroupKey] = useState(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [defaultShippingFee, setDefaultShippingFee] = useState(() => loadDefaultShippingFee())
  const [calendarShippingTypeFilter, setCalendarShippingTypeFilter] = useState('all')

  const [exchangeRates, setExchangeRates] = useState(() => loadExchangeRates())
  const [exchangeRateForm, setExchangeRateForm] = useState({ date: today, rate: '' })

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false)
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isCreateOrderPanelOpen, setIsCreateOrderPanelOpen] = useState(false)
  const [isConfirmingBuyer, setIsConfirmingBuyer] = useState(false)
  const [isInboundModalOpen, setIsInboundModalOpen] = useState(false)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [editingCustomerId, setEditingCustomerId] = useState(null)
  const [editingLiveId, setEditingLiveId] = useState(null)
  const [productDrafts, setProductDrafts] = useState([])
  const [editingProductRows, setEditingProductRows] = useState({})
  const [productScanValue, setProductScanValue] = useState('')
  const [savingProductKey, setSavingProductKey] = useState(null)
  const [highlightedProductKey, setHighlightedProductKey] = useState(null)
  const [productActivePanel, setProductActivePanel] = useState('list')
  const [isProductListScanArmed, setIsProductListScanArmed] = useState(true)
  const [isInboundSaving, setIsInboundSaving] = useState(false)
  const [isOrderSaving, setIsOrderSaving] = useState(false)
  const [releasingOrderId, setReleasingOrderId] = useState(null)
  const [updatingPaymentOrderId, setUpdatingPaymentOrderId] = useState(null)
  const [updatingShippingOrderId, setUpdatingShippingOrderId] = useState(null)
  const [updatingShippingTypeOrderId, setUpdatingShippingTypeOrderId] = useState(null)
  const [updatingSettlementDateOrderId, setUpdatingSettlementDateOrderId] = useState(null)
  const [memoOrderId, setMemoOrderId] = useState(null)
  const [memoDraft, setMemoDraft] = useState('')
  const [isSavingMemo, setIsSavingMemo] = useState(false)
  const [selectedInvoiceLiveId, setSelectedInvoiceLiveId] = useState('')

  const productRowRefs = useRef({})
  const nextProductDraftId = useRef(1)
  const activeProductRowKeyRef = useRef(null)
  const productRowsRef = useRef([])
  const productScanBufferRef = useRef('')
  const productScanLastAtRef = useRef(0)
  const productScanProcessingRef = useRef(false)
  const productSearchInputRef = useRef(null)

  const [customerForm, setCustomerForm] = useState(emptyCustomerForm)

  const [liveForm, setLiveForm] = useState(emptyLiveForm)

  const [orderForm, setOrderForm] = useState({
    customer_id: '',
    settlement_date: today,
    shipping_fee: loadDefaultShippingFee(),
    shipping_type: 'direct',
    note: '',
  })

  const [orderDetailForm, setOrderDetailForm] = useState({
    live_id: null,
    settlement_date: today,
    shipping_fee: 0,
    shipping_type: 'direct',
    note: '',
    items: [{ product_id: '', quantity: 1, unit_price: 0 }],
  })

  const [shipmentForm, setShipmentForm] = useState({
    order_id: '',
    payment_status: 'pending',
    paid_amount: '',
    receiver_name: '',
    receiver_phone: '',
    shipping_status: 'ready',
    courier_name: '',
    tracking_number: '',
    shipping_address1: '',
    shipping_address2: '',
    memo: '',
  })

  function goToMenu(menuKey) {
    const nextHash = getHashFromMenuKey(menuKey)
    if (typeof window !== 'undefined' && window.location.hash !== nextHash) {
      window.location.hash = nextHash
      return
    }
    setActiveMenu(menuKey)
  }

  function clearFocusedProductEditor() {
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement) {
      activeElement.blur()
    }
    activeProductRowKeyRef.current = null
  }

  function activateProductListPanel() {
    clearFocusedProductEditor()
    setProductActivePanel('list')
    setIsProductListScanArmed(true)
  }

  function activateProductScannerPanel() {
    clearFocusedProductEditor()
    setProductActivePanel('scanner')
    setIsProductListScanArmed(false)
    window.setTimeout(() => {
      productSearchInputRef.current?.focus()
    }, 0)
  }

  function isProductControlTarget(target) {
    return Boolean(target?.closest?.('input, select, textarea, button, a, [contenteditable="true"]'))
  }

  function handleProductListPanelClick(event) {
    setProductActivePanel('list')
    if (isProductControlTarget(event.target)) {
      setIsProductListScanArmed(false)
      return
    }
    activateProductListPanel()
  }

  function handleProductListPanelFocus(event) {
    setProductActivePanel('list')
    if (isProductControlTarget(event.target)) {
      setIsProductListScanArmed(false)
    }
  }

  const [inboundForm, setInboundForm] = useState({
    items: [{ product_id: '', quantity: 1 }],
    memo: '',
  })

  const orderStats = useMemo(() => {
    const totalCount = orders.length
    const totalAmount = orders.reduce((acc, order) => acc + Number(order.total_product_amount || 0), 0)
    const pendingPayments = orders.filter((order) => order.shipment?.payment_status === 'pending').length
    const readyShipments = orders.filter((order) => order.shipment?.shipping_status === 'ready').length
    const pendingStockRelease = orders.filter((order) => !order.stock_released_at).length
    return { totalCount, totalAmount, pendingPayments, readyShipments, pendingStockRelease }
  }, [orders])

  const selectedOrder = useMemo(() => {
    if (!orders.length) return null
    return orders.find((order) => order.id === selectedOrderId) || orders[0]
  }, [orders, selectedOrderId])

  const selectedCustomer = useMemo(() => {
    if (!selectedOrder) return null
    return customers.find((customer) => customer.id === selectedOrder.customer_id) || null
  }, [customers, selectedOrder])

  const selectedFilteredOrder = useMemo(() => {
    if (!selectedOrder) return null
    return toDateKey(selectedOrder.settlement_date) === invoiceFilterDate ? selectedOrder : null
  }, [invoiceFilterDate, selectedOrder])

  const filteredInvoiceOrders = useMemo(
    () => orders.filter((order) => toDateKey(order.settlement_date) === invoiceFilterDate),
    [invoiceFilterDate, orders],
  )
  const filteredInvoiceTotal = useMemo(
    () => filteredInvoiceOrders.reduce((acc, order) => acc + Number(order.total_product_amount || 0) + Number(order.shipping_fee || 0), 0),
    [filteredInvoiceOrders],
  )
  const customerSuggestions = useMemo(() => {
    const keyword = customerQuery.trim().toLowerCase()
    if (!keyword) return customers.slice(0, 5)

    return [...customers]
      .map((customer) => {
        const label = getCustomerOptionLabel(customer)
        const haystack = `${label} ${customer.instagram_id} ${customer.customer_name || ''}`.toLowerCase()
        const startsWith = haystack.startsWith(keyword) || customer.instagram_id.toLowerCase().startsWith(keyword)
        const index = haystack.indexOf(keyword)
        return {
          customer,
          rank: startsWith ? 0 : index >= 0 ? 1 : 2,
          index: index >= 0 ? index : Number.MAX_SAFE_INTEGER,
        }
      })
      .filter((entry) => entry.rank < 2)
      .sort((a, b) => a.rank - b.rank || a.index - b.index || a.customer.id - b.customer.id)
      .slice(0, 5)
      .map((entry) => entry.customer)
  }, [customerQuery, customers])

  const calendarDates = useMemo(() => getCalendarDates(today), [today])
  const calendarOrderMap = useMemo(() => {
    const grouped = {}
    for (const order of orders) {
      if (
        calendarShippingTypeFilter !== 'all' &&
        (order.shipment?.shipping_type || 'direct') !== calendarShippingTypeFilter
      ) {
        continue
      }
      const key = toDateKey(order.settlement_date)
      if (!key) continue
      grouped[key] = [...(grouped[key] || []), order]
    }
    return grouped
  }, [calendarShippingTypeFilter, orders])
  const calendarLiveMap = useMemo(() => {
    const grouped = {}
    for (const live of liveSessions) {
      const key = toDateKey(live.live_started_at)
      if (!key) continue
      grouped[key] = [...(grouped[key] || []), live]
    }
    return grouped
  }, [liveSessions])

  const activeLive = useMemo(() => liveSessions[0] || null, [liveSessions])
  const expandedOrder = useMemo(
    () => orders.find((order) => order.id === expandedOrderId) || null,
    [orders, expandedOrderId],
  )
  const memoOrder = useMemo(
    () => orders.find((order) => order.id === memoOrderId) || null,
    [orders, memoOrderId],
  )
  const invoiceLiveCards = useMemo(() => {
    return liveSessions
      .filter((live) => {
        if (!invoiceFilterMonth) return true
        return toMonthKey(live.live_started_at) === invoiceFilterMonth
      })
      .map((live) => {
        const liveOrders = orders.filter((order) => String(order.live_id || '') === String(live.id))
        return {
          ...live,
          orderCount: liveOrders.length,
          totalAmount: liveOrders.reduce(
            (acc, order) => acc + Number(order.total_product_amount || 0) + Number(order.shipping_fee || 0),
            0,
          ),
        }
      })
      .sort((a, b) => String(b.live_started_at || '').localeCompare(String(a.live_started_at || '')))
  }, [invoiceFilterMonth, liveSessions, orders])
  const selectedInvoiceLive = useMemo(() => {
    if (!invoiceLiveCards.length) return null
    return invoiceLiveCards.find((live) => String(live.id) === String(selectedInvoiceLiveId)) || invoiceLiveCards[0]
  }, [invoiceLiveCards, selectedInvoiceLiveId])
  const liveInvoiceOrders = useMemo(() => {
    if (!selectedInvoiceLive) return []
    return orders
      .filter((order) => String(order.live_id || '') === String(selectedInvoiceLive.id))
      .sort((a, b) => new Date(b.created_at || b.settlement_date) - new Date(a.created_at || a.settlement_date))
  }, [orders, selectedInvoiceLive])
  const liveInvoiceCustomerGroups = useMemo(() => {
    const grouped = new Map()
    liveInvoiceOrders.forEach((order) => {
      const key = String(order.customer_id)
      const customer = customers.find((item) => String(item.id) === key) || null
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          customer,
          order,
          totalAmount: 0,
        })
      }
      const entry = grouped.get(key)
      entry.totalAmount += Number(order.total_product_amount || 0) + Number(order.shipping_fee || 0)
      if (new Date(order.created_at || order.settlement_date) > new Date(entry.order.created_at || entry.order.settlement_date)) {
        entry.order = order
      }
    })
    return [...grouped.values()].sort((a, b) => {
      const left = a.customer?.customer_name || a.customer?.instagram_id || a.key
      const right = b.customer?.customer_name || b.customer?.instagram_id || b.key
      return left.localeCompare(right, 'ko')
    })
  }, [customers, liveInvoiceOrders])
  const shipmentHistories = useMemo(
    () => changeHistories.filter((history) => history.entity_type === 'shipment').slice(0, 8),
    [changeHistories],
  )
  const recentInboundMovements = useMemo(
    () => inventoryMovements.filter((movement) => movement.movement_type === 'inbound').slice(0, 8),
    [inventoryMovements],
  )
  const inboundGroups = useMemo(() => {
    const grouped = new Map()
    const inboundMovements = inventoryMovements.filter((movement) => movement.movement_type === 'inbound')

    for (const movement of inboundMovements) {
      const dateKey = toDateKey(movement.created_at)
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, {
          key: dateKey,
          date: dateKey,
          totalQuantity: 0,
          items: [],
        })
      }

      const group = grouped.get(dateKey)
      group.items.push(movement)
      group.totalQuantity += Number(movement.quantity || 0)
    }

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 12)
  }, [inventoryMovements])
  const exchangeRateEntries = useMemo(
    () => Object.entries(exchangeRates).sort((a, b) => b[0].localeCompare(a[0])),
    [exchangeRates],
  )

  const todayExchangeRate = Number(exchangeRates[today] || 0)
  const hasTodayExchangeRate = todayExchangeRate > 0

  const productTableRows = useMemo(() => {
    const drafts = productDrafts.map((draft) => ({
      ...draft,
      isDraft: true,
      rowKey: getProductRowKey(draft),
    }))
    const savedRows = products.map((product) => ({
      ...product,
      ...normalizeProductRow(product),
      ...(editingProductRows[product.id] || {}),
      isDraft: false,
      rowKey: getProductRowKey(product),
    }))

    return [...drafts, ...savedRows].map((product) => ({
      ...product,
      exchangeWholesalePrice: Math.round(Number(product.wholesale_price_jpy || 0) * todayExchangeRate),
      exchangeRetailPrice: Math.round(Number(product.retail_price_krw || 0) * todayExchangeRate),
    }))
  }, [editingProductRows, productDrafts, products, todayExchangeRate])

  useEffect(() => {
    productRowsRef.current = productTableRows
  }, [productTableRows])

  async function refreshAll() {
    try {
      setLoading(true)
      setError('')

      const [productRows, customerRows, liveRows, orderRows, historyRows, movementRows] = await Promise.all([
        api('/api/products').catch(() => []),
        api('/api/customers').catch(() => []),
        api('/api/live-sessions').catch(() => []),
        api('/api/orders').catch(() => []),
        api('/api/change-histories').catch(() => []),
        api('/api/inventory-movements').catch(() => []),
      ])

      setProducts(productRows)
      setCustomers(customerRows)
      setLiveSessions(liveRows)
      setOrders(orderRows)
      setChangeHistories(historyRows)
      setInventoryMovements(movementRows)
      setSelectedOrderId((prev) => prev ?? orderRows[0]?.id ?? null)
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  useEffect(() => {
    function syncMenuFromHash() {
      setActiveMenu(getMenuKeyFromHash())
    }

    if (typeof window !== 'undefined' && !window.location.hash) {
      window.location.hash = getHashFromMenuKey(activeMenu)
    }

    syncMenuFromHash()
    window.addEventListener('hashchange', syncMenuFromHash)
    return () => window.removeEventListener('hashchange', syncMenuFromHash)
  }, [])

  useEffect(() => {
    const currentMenu = MENU.find((item) => item.key === activeMenu)
    document.title = currentMenu ? `FITJOY | ${currentMenu.label}` : 'FITJOY'
  }, [activeMenu])

  useEffect(() => {
    function handleProductListScannerKeydown(event) {
      if (activeMenu !== 'products' || productActivePanel !== 'list') return
      if (!isProductListScanArmed) return
      if (productScanProcessingRef.current) return

      const target = event.target
      const isSearchField = Boolean(target?.closest?.('.barcode-scan-form'))
      if (isSearchField) return

      const now = Date.now()
      if (now - productScanLastAtRef.current > 120) {
        productScanBufferRef.current = ''
      }
      productScanLastAtRef.current = now

      if (event.key === 'Enter') {
        const barcode = productScanBufferRef.current.trim()
        productScanBufferRef.current = ''
        if (!barcode) return
        event.preventDefault()
        productScanProcessingRef.current = true
        void processProductBarcode(barcode, 'list').finally(() => {
          productScanProcessingRef.current = false
        })
        return
      }

      if (event.key.length === 1) {
        productScanBufferRef.current += event.key
        event.preventDefault()
      }
    }

    window.addEventListener('keydown', handleProductListScannerKeydown, true)
    return () => window.removeEventListener('keydown', handleProductListScannerKeydown, true)
  }, [
    activeMenu,
    productActivePanel,
    isProductListScanArmed,
    products,
    productDrafts,
    editingProductRows,
    savingProductKey,
  ])

  useEffect(() => {
    window.localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, JSON.stringify(exchangeRates))
  }, [exchangeRates])

  useEffect(() => {
    window.localStorage.setItem(DEFAULT_SHIPPING_FEE_STORAGE_KEY, String(defaultShippingFee))
  }, [defaultShippingFee])

  useEffect(() => {
    if (!selectedOrderId && orders[0]?.id) {
      setSelectedOrderId(orders[0].id)
    }
  }, [orders, selectedOrderId])

  useEffect(() => {
    if (!filteredInvoiceOrders.length) return
    if (!filteredInvoiceOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredInvoiceOrders[0].id)
    }
  }, [filteredInvoiceOrders, selectedOrderId])

  useEffect(() => {
    if (!invoiceLiveCards.length) {
      if (selectedInvoiceLiveId) setSelectedInvoiceLiveId('')
      return
    }
    if (!selectedInvoiceLiveId || !invoiceLiveCards.some((live) => String(live.id) === String(selectedInvoiceLiveId))) {
      setSelectedInvoiceLiveId(String(invoiceLiveCards[0].id))
    }
  }, [invoiceLiveCards, selectedInvoiceLiveId])

  useEffect(() => {
    if (!orderForm.customer_id) return
    const selectedCustomer = customers.find((customer) => String(customer.id) === String(orderForm.customer_id))
    if (selectedCustomer) {
      setCustomerQuery(getCustomerOptionLabel(selectedCustomer))
    }
  }, [customers, orderForm.customer_id])

  useEffect(() => {
    setOrderForm((prev) => (prev.customer_id || prev.note ? prev : {
      ...prev,
      shipping_fee: defaultShippingFee,
    }))
  }, [defaultShippingFee])

  useEffect(() => {
    if (!expandedOrderId) return
    if (!expandedOrder) {
      setExpandedOrderId(null)
      return
    }
    hydrateOrderDetailForm(expandedOrder)
  }, [expandedOrder, expandedOrderId])

  useEffect(() => {
    function clearProductActivePanel() {
      setProductActivePanel(null)
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        clearProductActivePanel()
      }
    }

    window.addEventListener('blur', clearProductActivePanel)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('blur', clearProductActivePanel)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  function getProductSearchValue(item) {
    if (item.product_query !== undefined) return item.product_query
    return products.find((product) => String(product.id) === String(item.product_id))?.product_name || ''
  }

  function applyProductSearchSelection(setItemFn, index, typedValue) {
    const matched = products.find((product) => product.product_name === typedValue)
    setItemFn(index, 'product_query', typedValue)
    setItemFn(index, 'product_id', matched ? String(matched.id) : '')
    if (matched) {
      setItemFn(index, 'unit_price', matched.live_price)
    }
  }

  function hydrateOrderDetailForm(order) {
    setOrderDetailForm({
      live_id: order?.live_id ?? null,
      settlement_date: toDateKey(order?.settlement_date) || today,
      shipping_fee: Number(order?.shipping_fee || 0),
      shipping_type: order?.shipment?.shipping_type || 'direct',
      note: order?.note || '',
      items:
        order?.items?.map((item) => ({
          product_id: String(item.product_id),
          quantity: Number(item.quantity || 1),
          unit_price: Number(item.unit_price || 0),
        })) || [{ product_id: '', quantity: 1, unit_price: 0 }],
    })
  }

  function setOrderDetailItem(index, key, value) {
    setOrderDetailForm((prev) => {
      const nextItems = [...prev.items]
      nextItems[index] = { ...nextItems[index], [key]: value }
      return { ...prev, items: nextItems }
    })
  }

  function addOrderDetailItem() {
    setOrderDetailForm((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: 1, unit_price: 0 }],
    }))
  }

  function removeOrderDetailItem(index) {
    setOrderDetailForm((prev) => {
      const nextItems = prev.items.filter((_, itemIndex) => itemIndex !== index)
      return {
        ...prev,
        items: nextItems.length ? nextItems : [{ product_id: '', quantity: 1, unit_price: 0 }],
      }
    })
  }

  function selectCustomer(customer) {
    setOrderForm((prev) => ({ ...prev, customer_id: String(customer.id) }))
    setCustomerQuery(getCustomerOptionLabel(customer))
  }

  async function confirmOrderHeader() {
    if (!selectedInvoiceLive) {
      setError('라이브를 먼저 선택해 주세요.')
      return
    }
    if (!orderForm.customer_id) {
      setError('구매자를 먼저 선택해 주세요.')
      return
    }

    setError('')
    setIsConfirmingBuyer(true)
    try {
      await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: Number(orderForm.customer_id),
          live_id: Number(selectedInvoiceLive.id),
          settlement_date: orderForm.settlement_date || today,
          shipping_fee: Number(orderForm.shipping_fee || 0),
          shipping_type: orderForm.shipping_type,
          note: orderForm.note,
          items: [],
        }),
      })
      await refreshAll()
      resetOrderFormState()
      setIsCreateOrderPanelOpen(false)
      setIsOrderModalOpen(false)
    } catch (caughtError) {
      setError(getReadableErrorMessage(caughtError))
    } finally {
      setIsConfirmingBuyer(false)
    }
  }

  function setInboundItem(index, key, value) {
    setInboundForm((prev) => {
      const nextItems = [...prev.items]
      nextItems[index] = { ...nextItems[index], [key]: value }
      return { ...prev, items: nextItems }
    })
  }

  function addInboundItem() {
    setInboundForm((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: 1 }],
    }))
  }

  function removeInboundItem(index) {
    setInboundForm((prev) => {
      const nextItems = prev.items.filter((_, itemIndex) => itemIndex !== index)
      return {
        ...prev,
        items: nextItems.length ? nextItems : [{ product_id: '', quantity: 1 }],
      }
    })
  }

  function resetInboundFormState() {
    setInboundForm({
      items: [{ product_id: '', quantity: 1 }],
      memo: '',
    })
  }

  function openInboundModal() {
    resetInboundFormState()
    setIsInboundModalOpen(true)
  }

  function closeInboundModal() {
    setIsInboundModalOpen(false)
    resetInboundFormState()
  }

  function hydrateShipmentForm(order) {
    const shipment = order?.shipment || {}
    const customer = customers.find((item) => item.id === order?.customer_id)

    setShipmentForm({
      order_id: String(order?.id || ''),
      payment_status: shipment.payment_status || 'pending',
      paid_amount: shipment.paid_amount ?? '',
      receiver_name: shipment.receiver_name || customer?.customer_name || '',
      receiver_phone: shipment.receiver_phone || customer?.phone_number || '',
      shipping_status: shipment.shipping_status || 'ready',
      courier_name: shipment.courier_name || '',
      tracking_number: shipment.tracking_number || '',
      shipping_address1: shipment.shipping_address1 || customer?.address1 || '',
      shipping_address2: shipment.shipping_address2 || customer?.address2 || '',
      memo: shipment.memo || order?.note || '',
    })
  }

  function focusProductRow(rowKey, shouldFocusInput = true) {
    window.setTimeout(() => {
      const target = productRowRefs.current[rowKey]
      if (!target) return

      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if (shouldFocusInput) {
        target.querySelector('input, select')?.focus()
      }
    }, 0)
  }

  function getPendingProductDraft() {
    return productDrafts[0] || null
  }

  function addProductDraft(prefill = {}, shouldFocusInput = true) {
    const pendingDraft = getPendingProductDraft()
    if (pendingDraft) {
      const nextBarcode = String(prefill.barcode || '').trim()
      const currentBarcode = String(pendingDraft.barcode || '').trim()

      if (nextBarcode && !currentBarcode) {
        setProductDrafts((prev) =>
          prev.map((draft, index) =>
            index === 0
              ? { ...draft, barcode: nextBarcode, stock_quantity: Math.max(Number(draft.stock_quantity || 0), 1) }
              : draft,
          ),
        )
      } else if (nextBarcode && currentBarcode === nextBarcode) {
        setProductDrafts((prev) =>
          prev.map((draft, index) =>
            index === 0 ? { ...draft, stock_quantity: Number(draft.stock_quantity || 0) + 1 } : draft,
          ),
        )
      } else if (nextBarcode && currentBarcode && nextBarcode !== currentBarcode) {
        setError('신규 상품 행을 먼저 저장하거나 삭제하세요.')
      }

      const pendingRowKey = getProductRowKey(pendingDraft)
      setHighlightedProductKey(pendingRowKey)
      focusProductRow(pendingRowKey, shouldFocusInput)
      window.setTimeout(() => {
        setHighlightedProductKey((current) => (current === pendingRowKey ? null : current))
      }, 1800)
      return
    }

    const draft = {
      localId: `${Date.now()}-${nextProductDraftId.current}`,
      ...normalizeProductRow(prefill),
    }
    nextProductDraftId.current += 1

    const rowKey = getProductRowKey(draft)
    setProductDrafts((prev) => [draft, ...prev])
    setHighlightedProductKey(rowKey)
    focusProductRow(rowKey, shouldFocusInput)
    window.setTimeout(() => {
      setHighlightedProductKey((current) => (current === rowKey ? null : current))
    }, 1800)
  }

  async function processProductBarcode(barcode, mode = 'list') {
    if (!barcode) return
    setError('')

    const matchedProduct = products.find((product) => String(product.barcode || '').trim() === barcode)

    if (mode === 'scanner') {
      if (matchedProduct) {
        const rowKey = getProductRowKey(matchedProduct)
        setHighlightedProductKey(rowKey)
        focusProductRow(rowKey, false)
        window.setTimeout(() => setHighlightedProductKey(null), 1800)
      } else {
        setError('등록되지 않은 바코드입니다. 상품 목록을 활성화한 뒤 다시 스캔하세요.')
      }
      return
    }

    const pendingDraft = getPendingProductDraft()
    if (pendingDraft) {
      addProductDraft({ barcode, stock_quantity: 1 }, false)
      setProductScanValue('')
      return
    }

    if (matchedProduct) {
      try {
        await api('/api/inventory-movements/inbound', {
          method: 'POST',
          body: JSON.stringify({
            product_id: matchedProduct.id,
            quantity: 1,
            memo: 'barcode_scan',
          }),
        })
        await refreshAll()
        const rowKey = getProductRowKey(matchedProduct)
        setHighlightedProductKey(rowKey)
        focusProductRow(rowKey, false)
      } catch (caughtError) {
        setError(String(caughtError.message || caughtError))
        return
      }
    } else {
      addProductDraft({ barcode, stock_quantity: 1 }, false)
    }

    window.setTimeout(() => setHighlightedProductKey(null), 1800)
  }

  async function handleProductScanSubmit(event) {
    event.preventDefault()
    const barcode = productScanValue.trim()
    await processProductBarcode(barcode, 'scanner')
    setProductScanValue('')
  }

  function setProductRowValue(product, key, value) {
    if (product.isDraft) {
      setProductDrafts((prev) =>
        prev.map((draft) => (draft.localId === product.localId ? { ...draft, [key]: value } : draft)),
      )
      return
    }

    setEditingProductRows((prev) => ({
      ...prev,
      [product.id]: {
        ...normalizeProductRow(product),
        ...(prev[product.id] || {}),
        [key]: value,
      },
    }))
  }

  function isProductDraftEmpty(product) {
    return (
      !String(product.barcode || '').trim() &&
      !String(product.product_name || '').trim() &&
      Number(product.wholesale_price_jpy || 0) === 0 &&
      Number(product.retail_price_krw || 0) === 0 &&
      Number(product.live_price || 0) === 0
    )
  }

  function shouldAutoSaveProductRow(product) {
    if (savingProductKey === product.rowKey) return false
    if (product.isDraft) return !isProductDraftEmpty(product)
    return Boolean(editingProductRows[product.id])
  }

  function isProductRowDirty(product) {
    if (product.isDraft) return !isProductDraftEmpty(product)
    return Boolean(editingProductRows[product.id])
  }

  function commitProductRowIfNeeded(product) {
    if (!product) return

    if (product.isDraft && isProductDraftEmpty(product)) {
      resetProductRow(product)
      return
    }

    if (shouldAutoSaveProductRow(product)) {
      void saveProductRow(product)
    }
  }

  function handleProductRowFocus(product) {
    setIsProductListScanArmed(false)
    const previousRowKey = activeProductRowKeyRef.current
    if (previousRowKey && previousRowKey !== product.rowKey) {
      const previousRow = productRowsRef.current.find((row) => row.rowKey === previousRowKey)
      commitProductRowIfNeeded(previousRow)
    }
    activeProductRowKeyRef.current = product.rowKey
  }

  function handleProductRowBlur(event, product) {
    const nextFocusTarget = event.relatedTarget
    if (nextFocusTarget && event.currentTarget.contains(nextFocusTarget)) {
      return
    }

    if (activeProductRowKeyRef.current === product.rowKey) {
      activeProductRowKeyRef.current = null
    }
    commitProductRowIfNeeded(product)
  }

  function resetProductRow(product) {
    if (product.isDraft) {
      setProductDrafts((prev) => prev.filter((draft) => draft.localId !== product.localId))
      return
    }

    setEditingProductRows((prev) => {
      const next = { ...prev }
      delete next[product.id]
      return next
    })
  }

  function openCreateCustomerModal() {
    setEditingCustomerId(null)
    setCustomerForm(emptyCustomerForm)
    setIsCustomerModalOpen(true)
  }

  function openEditCustomerModal(customer) {
    setEditingCustomerId(customer.id)
    setCustomerForm({
      instagram_id: customer.instagram_id || '',
      customer_name: customer.customer_name || '',
      phone_number: customer.phone_number || '',
      address1: customer.address1 || '',
      address2: customer.address2 || '',
      is_active: Boolean(customer.is_active),
    })
    setIsCustomerModalOpen(true)
  }

  function closeCustomerModal() {
    setIsCustomerModalOpen(false)
    setEditingCustomerId(null)
    setCustomerForm(emptyCustomerForm)
  }

  function openCreateLiveModal() {
    setEditingLiveId(null)
    setLiveForm(emptyLiveForm)
    setIsLiveModalOpen(true)
  }

  function openEditLiveModal(live) {
    setEditingLiveId(live.id)
    setLiveForm({
      live_title: live.live_title || '',
      live_started_at: toDateKey(live.live_started_at),
      memo: live.memo || '',
    })
    setIsLiveModalOpen(true)
  }

  function closeLiveModal() {
    setIsLiveModalOpen(false)
    setEditingLiveId(null)
    setLiveForm(emptyLiveForm)
  }

  function resetOrderFormState() {
    setOrderForm({
      customer_id: '',
      settlement_date: today,
      shipping_fee: defaultShippingFee,
      shipping_type: 'direct',
      note: '',
    })
    setCustomerQuery('')
  }

  function openOrderModal() {
    if (!selectedInvoiceLive) {
      setError('라이브를 먼저 선택해 주세요.')
      return
    }
    resetOrderFormState()
    setIsOrderModalOpen(true)
  }

  function closeOrderModal() {
    setIsOrderModalOpen(false)
    resetOrderFormState()
  }

  async function saveProductRow(product) {
    setError('')
    setSavingProductKey(product.rowKey)

    try {
      const payload = {
        barcode: product.barcode?.trim() || '',
        product_name: product.product_name.trim(),
        wholesale_price_jpy: Number(product.wholesale_price_jpy || 0),
        retail_price_krw: Number(product.retail_price_krw || 0),
        live_price: Number(product.live_price || 0),
        stock_quantity: Number(product.stock_quantity || 0),
        is_active: true,
      }

      if (!payload.barcode) {
        throw new Error('바코드를 입력하세요.')
      }

      if (!payload.product_name) {
        throw new Error('상품명을 입력하세요.')
      }

      const matchedProduct = products.find(
        (item) => String(item.barcode || '').trim() === payload.barcode && (product.isDraft || item.id !== product.id),
      )

      if (product.isDraft && matchedProduct) {
        const hasNonStockDraftChanges =
          String(payload.product_name || '').trim() !== String(matchedProduct.product_name || '').trim() ||
          Number(payload.wholesale_price_jpy || 0) !== Number(matchedProduct.wholesale_price_jpy || 0) ||
          Number(payload.retail_price_krw || 0) !== Number(matchedProduct.retail_price_krw || 0) ||
          Number(payload.live_price || 0) !== Number(matchedProduct.live_price || 0)

        if (Number(payload.stock_quantity || 0) > 0 && !hasNonStockDraftChanges) {
          await api('/api/inventory-movements/inbound', {
            method: 'POST',
            body: JSON.stringify({
              product_id: matchedProduct.id,
              quantity: Number(payload.stock_quantity || 0),
              memo: 'draft_merge',
            }),
          })
          setProductDrafts((prev) => prev.filter((draft) => draft.localId !== product.localId))
          await refreshAll()
          const rowKey = getProductRowKey(matchedProduct)
          setHighlightedProductKey(rowKey)
          focusProductRow(rowKey, false)
          window.setTimeout(() => setHighlightedProductKey(null), 1800)
          return
        }

        const rowKey = getProductRowKey(matchedProduct)
        setHighlightedProductKey(rowKey)
        focusProductRow(rowKey, false)
        window.setTimeout(() => setHighlightedProductKey(null), 1800)
        throw new Error('이미 등록된 바코드입니다. 기존 상품 행에서 수정하거나 신규 행을 삭제하세요.')
      }

      await api(product.isDraft ? '/api/products' : `/api/products/${product.id}`, {
        method: product.isDraft ? 'POST' : 'PUT',
        body: JSON.stringify(payload),
      })

      if (product.isDraft) {
        setProductDrafts((prev) => prev.filter((draft) => draft.localId !== product.localId))
      } else {
        setEditingProductRows((prev) => {
          const next = { ...prev }
          delete next[product.id]
          return next
        })
      }

      await refreshAll()
      goToMenu('products')
    } catch (caughtError) {
      setError(getReadableErrorMessage(caughtError))
    } finally {
      setSavingProductKey(null)
    }
  }

  async function submitCustomer(event) {
    event.preventDefault()
    setError('')

    try {
      await api(editingCustomerId ? `/api/customers/${editingCustomerId}` : '/api/customers', {
        method: editingCustomerId ? 'PUT' : 'POST',
        body: JSON.stringify(customerForm),
      })
      await refreshAll()
      closeCustomerModal()
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    }
  }

  async function submitLive(event) {
    event.preventDefault()
    setError('')

    try {
      await api(editingLiveId ? `/api/live-sessions/${editingLiveId}` : '/api/live-sessions', {
        method: editingLiveId ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...liveForm,
          live_started_at: liveForm.live_started_at || null,
        }),
      })
      await refreshAll()
      closeLiveModal()
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    }
  }

  async function submitShipment(event) {
    event.preventDefault()
    setError('')

    try {
      await api(`/api/shipments/${shipmentForm.order_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          payment_status: shipmentForm.payment_status,
          paid_amount: shipmentForm.paid_amount === '' ? null : Number(shipmentForm.paid_amount),
          receiver_name: shipmentForm.receiver_name || null,
          receiver_phone: shipmentForm.receiver_phone || null,
          shipping_status: shipmentForm.shipping_status,
          courier_name: shipmentForm.courier_name || null,
          tracking_number: shipmentForm.tracking_number || null,
          shipping_address1: shipmentForm.shipping_address1 || null,
          shipping_address2: shipmentForm.shipping_address2 || null,
          memo: shipmentForm.memo || null,
        }),
      })

      await refreshAll()
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    }
  }

  async function submitOrderDetail(event) {
    event.preventDefault()
    if (!expandedOrderId || !orderDetailForm.items.length) return

    if (expandedOrder?.stock_released_at) {
      const confirmed = window.confirm(
        '이미 출고 처리된 주문입니다. 품목을 변경해도 이미 차감된 재고 수량은 자동으로 되돌아가지 않습니다.\n그래도 판매 항목을 변경하시겠습니까?',
      )
      if (!confirmed) return
    }

    setError('')
    setIsOrderSaving(true)

    try {
      await api(`/api/orders/${expandedOrderId}`, {
        method: 'PUT',
        body: JSON.stringify({
          live_id: orderDetailForm.live_id ?? null,
          settlement_date: orderDetailForm.settlement_date || today,
          shipping_fee: Number(orderDetailForm.shipping_fee || 0),
          shipping_type: orderDetailForm.shipping_type,
          note: orderDetailForm.note || null,
          items: orderDetailForm.items.map((item) => ({
            product_id: Number(item.product_id),
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
          })),
        }),
      })
      await refreshAll()
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    } finally {
      setIsOrderSaving(false)
    }
  }

  async function submitInbound(event) {
    event.preventDefault()
    setError('')
    setIsInboundSaving(true)

    try {
      await api('/api/inventory-movements/inbound/bulk', {
        method: 'POST',
        body: JSON.stringify({
          items: inboundForm.items.map((item) => ({
            product_id: Number(item.product_id),
            quantity: Number(item.quantity),
          })),
          memo: inboundForm.memo || null,
        }),
      })

      resetInboundFormState()
      setIsInboundModalOpen(false)
      await refreshAll()
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    } finally {
      setIsInboundSaving(false)
    }
  }

  async function releaseOrderStock(orderId) {
    setError('')
    setReleasingOrderId(orderId)

    try {
      await api(`/api/orders/${orderId}/release-stock`, {
        method: 'POST',
      })
      await refreshAll()
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    } finally {
      setReleasingOrderId(null)
    }
  }

  async function unreleaseOrderStock(orderId) {
    setError('')
    setReleasingOrderId(orderId)

    try {
      await api(`/api/orders/${orderId}/unrelease-stock`, {
        method: 'POST',
      })
      await refreshAll()
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    } finally {
      setReleasingOrderId(null)
    }
  }

  function toggleOrderStockRelease(order) {
    if (order.stock_released_at) {
      const confirmed = window.confirm('정말 되돌리시겠습니까? 차감된 재고 수량이 복구됩니다.')
      if (!confirmed) return
      unreleaseOrderStock(order.id)
      return
    }

    const confirmed = window.confirm('출고 완료 처리하시겠습니까? 실제로 출고된 게 맞는지 확인해 주세요.')
    if (!confirmed) return
    releaseOrderStock(order.id)
  }

  async function updateOrderPaymentStatus(order, nextStatus) {
    if (!order?.id) return
    setError('')
    setUpdatingPaymentOrderId(order.id)

    const isPaid = nextStatus === 'paid'
    const existingPaidAmount = order.shipment?.paid_amount
    const fallbackPaidAmount = Number(order.total_product_amount || 0) + Number(order.shipping_fee || 0)

    try {
      await api(`/api/shipments/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          payment_status: nextStatus,
          paid_at: isPaid ? new Date().toISOString() : null,
          paid_amount: isPaid ? (existingPaidAmount ?? fallbackPaidAmount) : null,
        }),
      })
      await refreshAll()
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    } finally {
      setUpdatingPaymentOrderId(null)
    }
  }

  async function updateOrderShippingStatus(order, nextStatus) {
    if (!order?.id) return
    setError('')
    setUpdatingShippingOrderId(order.id)

    const now = new Date().toISOString()
    const payload = {
      shipping_status: nextStatus,
      shipped_at: nextStatus === 'shipped' || nextStatus === 'delivered' ? (order.shipment?.shipped_at || now) : null,
      delivered_at: nextStatus === 'delivered' ? now : null,
    }

    try {
      await api(`/api/shipments/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      await refreshAll()
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    } finally {
      setUpdatingShippingOrderId(null)
    }
  }

  async function updateOrderShippingType(order, nextType) {
    if (!order?.id) return
    setError('')
    setUpdatingShippingTypeOrderId(order.id)

    try {
      await api(`/api/shipments/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ shipping_type: nextType }),
      })
      await refreshAll()
    } catch (caughtError) {
      setError(String(caughtError.message || caughtError))
    } finally {
      setUpdatingShippingTypeOrderId(null)
    }
  }

  async function updateOrderSettlementDate(order, nextDate) {
    if (!order?.id || !nextDate) return
    setError('')
    setUpdatingSettlementDateOrderId(order.id)

    try {
      await api(`/api/orders/${order.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          live_id: order.live_id ?? null,
          settlement_date: nextDate,
          shipping_fee: Number(order.shipping_fee || 0),
          shipping_type: order.shipment?.shipping_type || 'direct',
          note: order.note || null,
          items: order.items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
        }),
      })
      await refreshAll()
    } catch (caughtError) {
      setError(getReadableErrorMessage(caughtError))
    } finally {
      setUpdatingSettlementDateOrderId(null)
    }
  }

  function openMemoPopup(order) {
    setMemoOrderId(order.id)
    setMemoDraft(order.note || '')
  }

  function closeMemoPopup() {
    setMemoOrderId(null)
    setMemoDraft('')
  }

  async function submitMemo(event) {
    event.preventDefault()
    if (!memoOrder) return
    setError('')
    setIsSavingMemo(true)

    try {
      await api(`/api/orders/${memoOrder.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          live_id: memoOrder.live_id ?? null,
          settlement_date: toDateKey(memoOrder.settlement_date) || today,
          shipping_fee: Number(memoOrder.shipping_fee || 0),
          shipping_type: memoOrder.shipment?.shipping_type || 'direct',
          note: memoDraft || null,
          items: memoOrder.items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
        }),
      })
      await refreshAll()
      closeMemoPopup()
    } catch (caughtError) {
      setError(getReadableErrorMessage(caughtError))
    } finally {
      setIsSavingMemo(false)
    }
  }

  function openInvoiceViewerForOrder(order) {
    if (!order) return
    setSelectedOrderId(order.id)
    if (order.live_id) {
      setSelectedInvoiceLiveId(String(order.live_id))
    }
    setInvoiceFilterDate(toDateKey(order.settlement_date) || today)
    setIsInvoiceModalOpen(true)
    goToMenu('orders')
  }

  function closeInvoiceModal() {
    setIsInvoiceModalOpen(false)
  }

  function submitExchangeRate(event) {
    event.preventDefault()

    const normalizedDate = exchangeRateForm.date || today
    const normalizedRate = Number(exchangeRateForm.rate)

    if (!normalizedDate || normalizedRate <= 0) {
      setError('환율 날짜와 0보다 큰 값을 입력해 주세요.')
      return
    }

    setError('')
    setExchangeRates((prev) => ({
      ...prev,
      [normalizedDate]: normalizedRate,
    }))
    setExchangeRateForm({ date: normalizedDate, rate: String(normalizedRate) })
  }

  function removeExchangeRate(date) {
    setExchangeRates((prev) => {
      const next = { ...prev }
      delete next[date]
      return next
    })
  }

  function lockApp() {
    window.localStorage.removeItem(PIN_UNLOCKED_STORAGE_KEY)
    setIsPinUnlocked(false)
  }

  function closePinChangeModal() {
    setIsPinChangeModalOpen(false)
    setPinChangeForm({ current_pin: '', new_pin: '', confirm_pin: '' })
  }

  async function submitPinChange(event) {
    event.preventDefault()
    setError('')

    if (pinChangeForm.new_pin !== pinChangeForm.confirm_pin) {
      setError('새 PIN이 일치하지 않습니다.')
      return
    }

    setIsChangingPin(true)
    try {
      await api('/api/auth/change-pin', {
        method: 'POST',
        body: JSON.stringify({
          current_pin: pinChangeForm.current_pin,
          new_pin: pinChangeForm.new_pin,
        }),
      })
      closePinChangeModal()
    } catch (caughtError) {
      setError(getReadableErrorMessage(caughtError))
    } finally {
      setIsChangingPin(false)
    }
  }

  if (!isPinUnlocked) {
    return (
      <PinGate
        onUnlock={() => {
          window.localStorage.setItem(PIN_UNLOCKED_STORAGE_KEY, 'true')
          setIsPinUnlocked(true)
        }}
      />
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-badge">FJ</div>
          <div className="brand-text">
            <h1>FITJOY</h1>
            <p>라이브 커머스 운영 콘솔</p>
          </div>
        </div>

        <div className="nav-group">
          <div className="nav-label">Main</div>
          {MENU.filter((item) => item.group === 'main').map((item) => (
            <NavButton key={item.key} active={activeMenu === item.key} onClick={() => goToMenu(item.key)}>
              {item.label}
            </NavButton>
          ))}
        </div>

        <div className="nav-group">
          <div className="nav-label">Management</div>
          {MENU.filter((item) => item.group === 'management').map((item) => (
            <NavButton key={item.key} active={activeMenu === item.key} onClick={() => goToMenu(item.key)}>
              {item.label}
            </NavButton>
          ))}
        </div>

        <div className="sidebar-footer">
          오늘의 체크 포인트
          <br />- 주문 등록 후 정산서 뷰어로 바로 확인
          <br />- 결제 / 배송 상태를 동시에 점검
          <br />- 고객 주소와 연락처 누락 여부 확인
        </div>
        <div className="sidebar-pin-actions">
          <button type="button" className="btn btn-light" onClick={() => setIsPinChangeModalOpen(true)}>
            PIN 변경
          </button>
          <button type="button" className="btn btn-light" onClick={lockApp}>
            잠금
          </button>
        </div>
      </aside>

      {isPinChangeModalOpen ? (
        <Modal title="PIN 변경" sub="현재 PIN을 확인한 뒤 새 PIN으로 바꿉니다." onClose={closePinChangeModal}>
          <form className="form-grid" onSubmit={submitPinChange}>
            <label>
              현재 PIN
              <input
                type="password"
                inputMode="numeric"
                value={pinChangeForm.current_pin}
                onChange={(event) => setPinChangeForm((prev) => ({ ...prev, current_pin: event.target.value }))}
                required
              />
            </label>
            <label>
              새 PIN
              <input
                type="password"
                inputMode="numeric"
                minLength={4}
                value={pinChangeForm.new_pin}
                onChange={(event) => setPinChangeForm((prev) => ({ ...prev, new_pin: event.target.value }))}
                required
              />
            </label>
            <label>
              새 PIN 확인
              <input
                type="password"
                inputMode="numeric"
                minLength={4}
                value={pinChangeForm.confirm_pin}
                onChange={(event) => setPinChangeForm((prev) => ({ ...prev, confirm_pin: event.target.value }))}
                required
              />
            </label>
            <div className="full actions-row">
              <button type="button" className="btn btn-light" onClick={closePinChangeModal}>
                취소
              </button>
              <button type="submit" className="btn btn-primary" disabled={isChangingPin}>
                {isChangingPin ? '변경 중...' : '변경'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      <main className="main">
        <datalist id="product-options">
          {products.map((product) => (
            <option key={product.id} value={product.product_name} />
          ))}
        </datalist>

        <section className="topbar">
          <div>
            <h2>{MENU.find((item) => item.key === activeMenu)?.label || '대시보드'}</h2>
            <p>주문, 배송, 정산 상태를 한 화면에서 관리하고 정산서를 문서형 뷰어로 확인할 수 있습니다.</p>
          </div>
          <div className="topbar-actions">
            <button type="button" className="btn btn-light" onClick={() => goToMenu('orders')}>
              주문 목록
            </button>
            {activeMenu === 'orders' ? (
              <button type="button" className="btn btn-primary" onClick={openOrderModal}>
                주문 입력
              </button>
            ) : null}
          </div>
        </section>

        {error ? <div className="error-banner">오류: {error}</div> : null}
        {loading ? <div className="muted">데이터를 불러오는 중입니다...</div> : null}

        {activeMenu === 'dashboard' && (
          <>
            <section className="hero">
              <div>
                <h3>주문과 정산을 빠르게 연결하는 운영 보드</h3>
                <p>
                  주문 테이블과 배송 정산 데이터를 기반으로 상태를 점검하고, 선택한 주문을 바로 문서형 정산서로
                  시각화할 수 있도록 구성했습니다.
                </p>
                <div className="hero-tags">
                  <span className="tag">주문 합계 자동 계산</span>
                  <span className="tag">결제 / 배송 상태 동기화</span>
                  <span className="tag">반 A4 정산서 프리뷰</span>
                </div>
              </div>

              <div className="hero-side">
                <div>
                  <div className="label">현재 라이브 세션</div>
                  <div className="value">{liveSessions.length ? `${liveSessions.length}건` : '0건'}</div>
                </div>
                <div>
                  <div className="label">최근 방송</div>
                  <strong>{activeLive?.live_title || '등록된 라이브 없음'}</strong>
                </div>
                <div>
                  <div className="label">메모</div>
                  <span>{activeLive?.memo || '방송 메모가 아직 없습니다.'}</span>
                </div>
              </div>
            </section>

            <section className="grid-4">
              <div className="card">
                <div className="stat-title">전체 주문 수</div>
                <div className="stat-value">{orderStats.totalCount}</div>
                <div className="stat-sub success">현재 적재된 주문 기준</div>
              </div>
              <div className="card">
                <div className="stat-title">주문 총액</div>
                <div className="stat-value">₩ {money(orderStats.totalAmount)}</div>
                <div className="stat-sub blue">품목 합계 누적</div>
              </div>
              <div className="card">
                <div className="stat-title">입금 대기</div>
                <div className="stat-value">{orderStats.pendingPayments}건</div>
                <div className="stat-sub warn">정산 확인 필요</div>
              </div>
              <div className="card">
                <div className="stat-title">배송 준비</div>
                <div className="stat-value">{orderStats.readyShipments}건</div>
                <div className="stat-sub">운송장 입력 가능</div>
              </div>
              <div className="card">
                <div className="stat-title">출고 대기</div>
                <div className="stat-value">{orderStats.pendingStockRelease}건</div>
                <div className="stat-sub warn">재고 차감 전 주문</div>
              </div>
            </section>

            <section className="content-grid">
              <Card
                title="최근 주문"
                sub="최근 등록된 주문 5건"
                action={
                  <button type="button" className="btn btn-light" onClick={() => goToMenu('orders')}>
                    전체 보기
                  </button>
                }
              >
                <table>
                  <thead>
                    <tr>
                      <th>주문번호</th>
                      <th>고객</th>
                      <th>총액</th>
                      <th>결제</th>
                      <th>배송</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 5).map((order) => {
                      const customer = customers.find((item) => item.id === order.customer_id)
                      return (
                        <tr key={order.id}>
                          <td>{order.order_code}</td>
                          <td>{customer?.instagram_id || `#${order.customer_id}`}</td>
                          <td>₩ {money(order.total_product_amount)}</td>
                          <td>
                            <span className={`pill ${order.shipment?.payment_status}`}>
                              {PAYMENT_LABELS[order.shipment?.payment_status] || '-'}
                            </span>
                          </td>
                          <td>
                            <span className={`pill ${order.shipment?.shipping_status}`}>
                              {SHIPPING_LABELS[order.shipment?.shipping_status] || '-'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Card>

              <Card title="정산서 바로가기" sub="선택 주문을 문서형 미리보기로 확인">
                <div className="list">
                  <div className="list-item">
                    <div>
                      <h5>정산서 뷰어</h5>
                      <p>주문 / 정산 테이블 기반 문서를 반 A4 비율로 시각화합니다.</p>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => goToMenu('orders')}>
                      열기
                    </button>
                  </div>
                  <div className="list-item">
                    <div>
                      <h5>입금 대기 주문</h5>
                      <p>정산 전 주문을 먼저 체크해 미정산 금액을 빠르게 파악합니다.</p>
                    </div>
                    <div className="amount">{orderStats.pendingPayments}건</div>
                  </div>
                  <div className="list-item">
                    <div>
                      <h5>배송 준비 주문</h5>
                      <p>수령 정보와 운송장 정보를 정산서 하단에서 함께 확인할 수 있습니다.</p>
                    </div>
                    <div className="amount">{orderStats.readyShipments}건</div>
                  </div>
                </div>
              </Card>
            </section>

            <section className="content-grid">
              <Card title="환율 입력" sub="오늘 기준 환율을 대시보드에서 바로 관리합니다.">
                <form className="form-grid" onSubmit={submitExchangeRate}>
                  <label>
                    날짜
                    <input
                      type="date"
                      value={exchangeRateForm.date}
                      onChange={(event) => setExchangeRateForm((prev) => ({ ...prev, date: event.target.value }))}
                    />
                  </label>
                  <label>
                    환율
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={exchangeRateForm.rate}
                      onChange={(event) => setExchangeRateForm((prev) => ({ ...prev, rate: event.target.value }))}
                      required
                    />
                  </label>
                  <div className="full actions-row">
                    <strong>오늘 환율: {hasTodayExchangeRate ? todayExchangeRate.toLocaleString('ko-KR') : '미입력'}</strong>
                    <button type="submit" className="btn btn-primary">
                      저장
                    </button>
                  </div>
                </form>
              </Card>

              <Card title="환율 기록" sub="최근 입력한 환율 목록">
                <div className="list">
                  {exchangeRateEntries.length ? (
                    exchangeRateEntries.slice(0, 8).map(([date, rate]) => (
                      <div className="list-item" key={date}>
                        <div>
                          <h5>{date}</h5>
                          <p>1엔당 {Number(rate).toLocaleString('ko-KR')}</p>
                        </div>
                        <button type="button" className="btn btn-light" onClick={() => removeExchangeRate(date)}>
                          삭제
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="muted">저장된 환율이 없습니다.</div>
                  )}
                </div>
              </Card>
            </section>
          </>
        )}

        {activeMenu === 'calendar' && (
          <Card title="정산 일정" sub="전주부터 4주치 정산서와 라이브 방송 일정을 한 번에 확인합니다.">
            <div className="calendar-filter-row">
              <button
                type="button"
                className={`btn ${calendarShippingTypeFilter === 'all' ? 'btn-primary' : 'btn-light'}`}
                onClick={() => setCalendarShippingTypeFilter('all')}
              >
                전체 보기
              </button>
              <button
                type="button"
                className={`btn ${calendarShippingTypeFilter === 'direct' ? 'btn-primary' : 'btn-light'}`}
                onClick={() => setCalendarShippingTypeFilter('direct')}
              >
                바로 배송만
              </button>
              <button
                type="button"
                className={`btn ${calendarShippingTypeFilter === 'keep' ? 'btn-primary' : 'btn-light'}`}
                onClick={() => setCalendarShippingTypeFilter('keep')}
              >
                Keep만
              </button>
            </div>
            <div className="calendar-weekdays">
              {WEEKDAY_LABELS.map((label, index) => (
                <div
                  key={label}
                  className={`calendar-weekday ${index === 5 ? 'saturday' : ''} ${index === 6 ? 'sunday' : ''}`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="calendar-grid">
              {calendarDates.map((dateKey, index) => {
                const dayOrders = calendarOrderMap[dateKey] || []
                const dayLives = calendarLiveMap[dateKey] || []
                const isToday = dateKey === today
                const weekendClass = index % 7 === 5 ? 'saturday' : index % 7 === 6 ? 'sunday' : ''
                const isFilteredView = calendarShippingTypeFilter !== 'all'
                const hasFilteredOrders = isFilteredView && dayOrders.length > 0
                const shouldMuteDay = isFilteredView && dayOrders.length === 0

                return (
                  <div
                    key={dateKey}
                    className={`calendar-day ${isToday ? 'today' : ''} ${hasFilteredOrders ? 'filtered-match' : ''} ${shouldMuteDay ? 'filtered-muted' : ''}`}
                  >
                    <div className="calendar-day-head">
                      <div className={weekendClass}>
                        <strong>{dateKey.slice(8)}</strong>
                        <span className="calendar-date-text">{dateKey.slice(5, 7)}월 {dateKey.slice(8)}일</span>
                      </div>
                      {isToday ? <span className="calendar-today-badge">오늘</span> : null}
                    </div>

                    <div className="calendar-day-section">
                      <span className="calendar-label">라이브 방송</span>
                      {dayLives.length ? (
                        dayLives.map((live) => (
                          <div key={`live-${live.id}`} className="calendar-chip live">
                            {live.live_title}
                          </div>
                        ))
                      ) : (
                        <div className="muted">없음</div>
                      )}
                    </div>

                    <div className="calendar-day-section">
                      <div className="calendar-section-head">
                        <span className="calendar-label">정산서</span>
                        <button
                          type="button"
                          className="calendar-link"
                          onClick={() => {
                            setInvoiceFilterDate(dateKey)
                            goToMenu('orders')
                          }}
                        >
                          전체 보기
                        </button>
                      </div>
                      {dayOrders.length ? (
                        dayOrders.map((order) => {
                          const customer = customers.find((item) => item.id === order.customer_id)
                          return (
                            <button
                              key={`order-${order.id}`}
                              type="button"
                              className="calendar-chip order"
                              onClick={() => {
                                setInvoiceFilterDate(dateKey)
                                setSelectedOrderId(order.id)
                                goToMenu('orders')
                              }}
                            >
                              {getInvoiceDocumentName(order, customer)}
                            </button>
                          )
                        })
                      ) : (
                        <div className="muted">없음</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {isOrderModalOpen ? (
          <Modal title="주문 입력" sub="고객을 선택하고 배송 유형을 입력하세요." onClose={closeOrderModal}>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault()
                confirmOrderHeader()
              }}
            >
              <div className="full invoice-filter-control">
                <span>Live</span>
                <strong>{selectedInvoiceLive?.live_title || '-'}</strong>
              </div>
              <label>
                고객
                <div className="typeahead-field">
                  <input
                    value={customerQuery}
                    onChange={(event) => {
                      setCustomerQuery(event.target.value)
                      setOrderForm((prev) => ({ ...prev, customer_id: '' }))
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Tab' && customerSuggestions.length) {
                        event.preventDefault()
                        selectCustomer(customerSuggestions[0])
                      }
                    }}
                    placeholder="인스타 아이디나 고객명을 입력하세요"
                    required
                  />
                  <div className="typeahead-tags">
                    {customerSuggestions.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className={`typeahead-tag ${String(orderForm.customer_id) === String(customer.id) ? 'active' : ''}`}
                        onClick={() => selectCustomer(customer)}
                      >
                        {getCustomerOptionLabel(customer)}
                      </button>
                    ))}
                  </div>
                </div>
                <select
                  className="customer-native-select"
                  value={orderForm.customer_id}
                  onChange={(event) => setOrderForm((prev) => ({ ...prev, customer_id: event.target.value }))}
                  required
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <option value="">선택</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {getCustomerOptionLabel(customer)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                정산 날짜
                <input
                  type="date"
                  value={orderForm.settlement_date}
                  onChange={(event) => setOrderForm((prev) => ({ ...prev, settlement_date: event.target.value }))}
                  required
                />
              </label>

              <label>
                배송 유형
                <select
                  value={orderForm.shipping_type}
                  onChange={(event) => setOrderForm((prev) => ({ ...prev, shipping_type: event.target.value }))}
                >
                  <option value="direct">바로 배송</option>
                  <option value="keep">Keep</option>
                </select>
              </label>

              <label>
                기본 배송비
                <input
                  type="number"
                  min="0"
                  value={defaultShippingFee}
                  onChange={(event) => {
                    const nextFee = Number(event.target.value || 0)
                    setDefaultShippingFee(nextFee)
                    setOrderForm((prev) => ({ ...prev, shipping_fee: nextFee }))
                  }}
                />
              </label>

              <label>
                이번 주문 배송비
                <input
                  type="number"
                  min="0"
                  value={orderForm.shipping_fee}
                  onChange={(event) =>
                    setOrderForm((prev) => ({ ...prev, shipping_fee: Number(event.target.value || 0) }))
                  }
                />
              </label>

              <label className="full">
                주문 메모
                <input
                  value={orderForm.note}
                  onChange={(event) => setOrderForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="DM memo"
                />
              </label>

              <div className="full actions-row">
                <button type="submit" className="btn btn-primary" disabled={isConfirmingBuyer}>
                  {isConfirmingBuyer ? '등록 중...' : '구매자 등록'}
                </button>
              </div>
            </form>
          </Modal>
        ) : null}

        {isInvoiceModalOpen ? (
          <Modal
            title="정산서 보기"
            sub={selectedOrder ? getInvoiceDocumentName(selectedOrder, selectedCustomer) : '선택한 정산서를 확인합니다.'}
            onClose={closeInvoiceModal}
          >
            <InvoiceViewer order={selectedOrder} customer={selectedCustomer} />
          </Modal>
        ) : null}

        {activeMenu === 'orders' && (
          <div className="content-grid single">
            {false ? (
              <>
            <Card>
              <div className="inline-title-row">
                <h4>주문 목록</h4>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>주문번호</th>
                    <th>고객</th>
                    <th>배송 유형</th>
                    <th>정산 날짜</th>
                    <th>총액</th>
                    <th>재고</th>
                    <th>결제</th>
                    <th>배송</th>
                    <th>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const customer = customers.find((item) => item.id === order.customer_id)
                    const shippingAddress = [order.shipment?.shipping_address1, order.shipment?.shipping_address2]
                      .filter(Boolean)
                      .join(' ')
                    return (
                      <tr
                        key={order.id}
                        className={`clickable-row ${expandedOrderId === order.id ? 'active-row' : ''}`}
                        onClick={() => {
                          setSelectedOrderId(order.id)
                          setExpandedOrderId((prev) => (prev === order.id ? null : order.id))
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedOrderId(order.id)
                            setExpandedOrderId((prev) => (prev === order.id ? null : order.id))
                          }
                        }}
                        tabIndex={0}
                      >
                        <td>{order.id}</td>
                        <td>{order.order_code}</td>
                        <td>{customer?.instagram_id || `#${order.customer_id}`}</td>
                        <td>{SHIPPING_TYPE_LABELS[order.shipment?.shipping_type || 'direct'] || '-'}</td>
                        <td>{order.settlement_date}</td>
                        <td>₩ {money(order.total_product_amount)}</td>
                        <td>
                          {order.stock_released_at ? (
                            <button
                              type="button"
                              className="status-button"
                              onClick={(event) => event.stopPropagation()}
                            >
                              출고 완료
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="status-button pending"
                              onClick={(event) => {
                                event.stopPropagation()
                                releaseOrderStock(order.id)
                              }}
                              disabled={releasingOrderId === order.id}
                            >
                              {releasingOrderId === order.id ? '처리 중...' : '출고 대기'}
                            </button>
                          )}
                        </td>
                        <td>
                          <select
                            className={`table-status-select ${order.shipment?.payment_status || 'pending'}`}
                            value={order.shipment?.payment_status || 'pending'}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation()
                              updateOrderPaymentStatus(order, event.target.value)
                            }}
                            disabled={updatingPaymentOrderId === order.id}
                          >
                            <option value="pending">입금 대기</option>
                            <option value="paid">입금 완료</option>
                          </select>
                        </td>
                        <td>
                          <div>
                            <select
                              className={`table-status-select ${order.shipment?.shipping_status || 'ready'}`}
                              value={order.shipment?.shipping_status || 'ready'}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                event.stopPropagation()
                                updateOrderShippingStatus(order, event.target.value)
                              }}
                              disabled={updatingShippingOrderId === order.id}
                            >
                              <option value="ready">배송 준비</option>
                              <option value="shipped">배송 중</option>
                              <option value="delivered">배송 완료</option>
                            </select>
                            <div className="muted inline-note">{shippingAddress || '배송지 미입력'}</div>
                          </div>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn btn-light"
                              onClick={(event) => {
                                event.stopPropagation()
                                openInvoiceViewerForOrder(order)
                              }}
                            >
                              정산서 보기
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                })}
              </tbody>
            </table>
            </Card>

            {expandedOrder ? (
              <Card
                title={`${expandedOrder.order_code} 상세 판매 항목`}
                sub={
                  expandedOrder.stock_released_at
                    ? '이미 출고 처리된 주문이라 판매 항목은 읽기 전용으로만 확인할 수 있습니다.'
                    : '수량과 판매 금액을 바로 수정하고 저장할 수 있습니다.'
                }
              >
                <form className="form-grid" onSubmit={submitOrderDetail}>
                  <label>
                    정산 날짜
                    <input
                      type="date"
                      value={orderDetailForm.settlement_date}
                      onChange={(event) =>
                        setOrderDetailForm((prev) => ({ ...prev, settlement_date: event.target.value }))
                      }
                      disabled={Boolean(expandedOrder.stock_released_at)}
                      required
                    />
                  </label>

                  <label>
                    배송 유형
                    <select
                      value={orderDetailForm.shipping_type}
                      onChange={(event) =>
                        setOrderDetailForm((prev) => ({ ...prev, shipping_type: event.target.value }))
                      }
                      disabled={Boolean(expandedOrder.stock_released_at)}
                    >
                      <option value="direct">바로 배송</option>
                      <option value="keep">Keep</option>
                    </select>
                  </label>

                  <div className="order-detail-meta">
                    <div className="detail-chip">
                      <span>고객</span>
                      <strong>
                        {customers.find((item) => item.id === expandedOrder.customer_id)?.instagram_id || `#${expandedOrder.customer_id}`}
                      </strong>
                    </div>
                                      </div>

                  <label className="full">
                    주문 메모
                    <input
                      value={orderDetailForm.note}
                      onChange={(event) => setOrderDetailForm((prev) => ({ ...prev, note: event.target.value }))}
                      disabled={Boolean(expandedOrder.stock_released_at)}
                    />
                  </label>

                  <div className="full">
                    <div className="section-head compact">
                      <h4>판매 항목</h4>
                      {!expandedOrder.stock_released_at ? (
                        <button type="button" className="btn btn-light" onClick={addOrderDetailItem}>
                          항목 추가
                        </button>
                      ) : null}
                    </div>

                    <div className="line-items">
                      {orderDetailForm.items.map((item, index) => (
                        <div className="line-item" key={`detail-${index}-${item.product_id}`}>
                          <input
                            type="text"
                            list="product-options"
                            value={getProductSearchValue(item)}
                            onChange={(event) => applyProductSearchSelection(setOrderDetailItem, index, event.target.value)}
                            placeholder="상품명 검색"
                            disabled={Boolean(expandedOrder.stock_released_at)}
                            required
                          />

                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) => setOrderDetailItem(index, 'quantity', event.target.value)}
                            disabled={Boolean(expandedOrder.stock_released_at)}
                            required
                          />

                          <input
                            type="number"
                            min="0"
                            value={item.unit_price}
                            onChange={(event) => setOrderDetailItem(index, 'unit_price', event.target.value)}
                            disabled={Boolean(expandedOrder.stock_released_at)}
                            required
                          />

                          <div className="line-total">₩{money(Number(item.quantity) * Number(item.unit_price))}</div>

                          {!expandedOrder.stock_released_at ? (
                            <button type="button" className="btn btn-light" onClick={() => removeOrderDetailItem(index)}>
                              삭제
                            </button>
                          ) : (
                            <div />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="full actions-row">
                    <strong>
                      총액: ₩
                      {money(
                        orderDetailForm.items.reduce(
                          (acc, item) => acc + Number(item.quantity || 0) * Number(item.unit_price || 0),
                          0,
                        ),
                      )}
                    </strong>
                    {!expandedOrder.stock_released_at ? (
                      <button type="submit" className="btn btn-primary" disabled={isOrderSaving}>
                        {isOrderSaving ? '저장 중...' : '판매 항목 저장'}
                      </button>
                    ) : null}
                  </div>
                </form>
              </Card>
            ) : null}
              </>
            ) : null}
            <Card
              title="라이브별 정산서"
              sub="라이브 카드를 선택한 뒤 구매자별 정산서를 버튼으로 확인합니다."
              action={
                <div className="invoice-header-actions">
                  <label className="inline-filter">
                    기준월
                    <input
                      type="month"
                      value={invoiceFilterMonth}
                      onChange={(event) => setInvoiceFilterMonth(event.target.value)}
                    />
                  </label>
                  <button type="button" className="btn btn-primary" onClick={openCreateLiveModal}>
                    라이브 추가
                  </button>
                </div>
              }
            >
              <div className="invoice-selector-list horizontal">
                {invoiceLiveCards.length ? invoiceLiveCards.map((live) => (
                  <button
                    key={live.id}
                    type="button"
                    className={`invoice-selector compact ${String(selectedInvoiceLive?.id) === String(live.id) ? 'active' : ''}`}
                    onClick={() => setSelectedInvoiceLiveId(String(live.id))}
                  >
                    <div>
                      <strong>{live.live_title}</strong>
                      <span>{formatDateTime(live.live_started_at)}</span>
                    </div>
                    <div className="invoice-selector-meta">
                      <strong>{live.orderCount}건</strong>
                      <small>₩ {money(live.totalAmount)}</small>
                    </div>
                  </button>
                )) : <div className="muted">등록된 라이브가 없습니다.</div>}
              </div>
            </Card>

            {!isCreateOrderPanelOpen ? (
              <button
                type="button"
                className="create-order-toggle-btn create-order-panel"
                onClick={() => setIsCreateOrderPanelOpen(true)}
              >
                + 신규 주문 등록
              </button>
            ) : (
            <Card
              className="create-order-panel"
              title="신규 주문"
              sub="구매자 등록 후 아래에서 제품을 추가합니다."
              action={
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => {
                    setIsCreateOrderPanelOpen(false)
                    resetOrderFormState()
                  }}
                >
                  닫기
                </button>
              }
            >
                <div className="inline-order-table-wrap">
                  <table className="compact-table inline-order-table inline-order-header-table">
                    <thead>
                      <tr>
                        <th>고객</th>
                        <th>정산 날짜</th>
                        <th>배송 유형</th>
                        <th>기본 배송비</th>
                        <th>주문 배송비</th>
                        <th>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <div className="typeahead-field compact">
                            <input
                              value={customerQuery}
                              onChange={(event) => {
                                setCustomerQuery(event.target.value)
                                setOrderForm((prev) => ({ ...prev, customer_id: '' }))
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Tab' && customerSuggestions.length) {
                                  event.preventDefault()
                                  selectCustomer(customerSuggestions[0])
                                }
                              }}
                              placeholder="고객명/인스타 ID"
                            />
                            <div className="typeahead-tags compact">
                              {customerSuggestions.map((customer) => (
                                <button
                                  key={customer.id}
                                  type="button"
                                  className={`typeahead-tag ${String(orderForm.customer_id) === String(customer.id) ? 'active' : ''}`}
                                  onClick={() => selectCustomer(customer)}
                                >
                                  {getCustomerOptionLabel(customer)}
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td>
                          <input
                            type="date"
                            value={orderForm.settlement_date}
                            onChange={(event) => setOrderForm((prev) => ({ ...prev, settlement_date: event.target.value }))}
                          />
                        </td>
                        <td>
                          <select
                            value={orderForm.shipping_type}
                            onChange={(event) => setOrderForm((prev) => ({ ...prev, shipping_type: event.target.value }))}
                          >
                            <option value="direct">바로 배송</option>
                            <option value="keep">Keep</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={defaultShippingFee}
                            onChange={(event) => {
                              const nextFee = Number(event.target.value || 0)
                              setDefaultShippingFee(nextFee)
                              setOrderForm((prev) => ({ ...prev, shipping_fee: nextFee }))
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={orderForm.shipping_fee}
                            onChange={(event) =>
                              setOrderForm((prev) => ({ ...prev, shipping_fee: Number(event.target.value || 0) }))
                            }
                          />
                        </td>
                        <td>
                          <button type="button" className="btn btn-primary" onClick={confirmOrderHeader} disabled={isConfirmingBuyer}>
                            {isConfirmingBuyer ? '등록 중...' : '구매자 등록'}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
            </Card>
            )}

            <div className="order-group-list">
              {liveInvoiceCustomerGroups.length ? (
                <Card title="구매자별 정산서" sub="행을 클릭하면 판매 항목이, NO.를 클릭하면 메모가 열립니다.">
                  <div className="inline-order-table-wrap">
                    <table className="compact-table order-group-table">
                      <thead>
                        <tr>
                          <th>NO.</th>
                          <th>고객</th>
                          <th>주문번호</th>
                          <th>금액</th>
                          <th>정산 날짜</th>
                          <th>재고</th>
                          <th>결제</th>
                          <th>배송</th>
                          <th>배송 유형</th>
                          <th>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveInvoiceCustomerGroups.map((group, index) => {
                          const order = group.order
                          const isExpanded = expandedOrderId === order.id

                          return (
                            <Fragment key={group.key}>
                              <tr
                                className={`clickable-row ${isExpanded ? 'active-row' : ''}`}
                                onClick={() => setExpandedOrderId((prev) => (prev === order.id ? null : order.id))}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    setExpandedOrderId((prev) => (prev === order.id ? null : order.id))
                                  }
                                }}
                                tabIndex={0}
                              >
                                <td onClick={(event) => event.stopPropagation()}>
                                  <button
                                    type="button"
                                    className="row-no-btn"
                                    onClick={() => openMemoPopup(order)}
                                  >
                                    {index + 1}
                                  </button>
                                </td>
                                <td>
                                  <strong>{group.customer?.customer_name || group.customer?.instagram_id || `고객 #${group.key}`}</strong>
                                  <div className="muted inline-note">{group.customer?.instagram_id || `고객 #${group.key}`}</div>
                                </td>
                                <td>{order.order_code}</td>
                                <td>₩ {money(group.totalAmount)}</td>
                                <td onClick={(event) => event.stopPropagation()}>
                                  <input
                                    type="date"
                                    value={toDateKey(order.settlement_date)}
                                    onChange={(event) => updateOrderSettlementDate(order, event.target.value)}
                                    disabled={updatingSettlementDateOrderId === order.id}
                                  />
                                </td>
                                <td onClick={(event) => event.stopPropagation()}>
                                  {order.stock_released_at ? (
                                    <button
                                      type="button"
                                      className="status-button"
                                      onClick={() => toggleOrderStockRelease(order)}
                                      disabled={releasingOrderId === order.id}
                                    >
                                      {releasingOrderId === order.id ? '처리 중...' : '출고 완료'}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="status-button pending"
                                      onClick={() => toggleOrderStockRelease(order)}
                                      disabled={releasingOrderId === order.id}
                                    >
                                      {releasingOrderId === order.id ? '처리 중...' : '출고 대기'}
                                    </button>
                                  )}
                                </td>
                                <td onClick={(event) => event.stopPropagation()}>
                                  <select
                                    className={`table-status-select ${order.shipment?.payment_status || 'pending'}`}
                                    value={order.shipment?.payment_status || 'pending'}
                                    onChange={(event) => updateOrderPaymentStatus(order, event.target.value)}
                                    disabled={updatingPaymentOrderId === order.id}
                                  >
                                    <option value="pending">입금 대기</option>
                                    <option value="paid">입금 완료</option>
                                  </select>
                                </td>
                                <td onClick={(event) => event.stopPropagation()}>
                                  <select
                                    className={`table-status-select ${order.shipment?.shipping_status || 'ready'}`}
                                    value={order.shipment?.shipping_status || 'ready'}
                                    onChange={(event) => updateOrderShippingStatus(order, event.target.value)}
                                    disabled={updatingShippingOrderId === order.id}
                                  >
                                    <option value="ready">배송 준비</option>
                                    <option value="shipped">배송 중</option>
                                    <option value="delivered">배송 완료</option>
                                  </select>
                                </td>
                                <td onClick={(event) => event.stopPropagation()}>
                                  <select
                                    className={`table-status-select ${order.shipment?.shipping_type || 'direct'}`}
                                    value={order.shipment?.shipping_type || 'direct'}
                                    onChange={(event) => updateOrderShippingType(order, event.target.value)}
                                    disabled={updatingShippingTypeOrderId === order.id}
                                  >
                                    <option value="direct">바로 배송</option>
                                    <option value="keep">Keep</option>
                                  </select>
                                </td>
                                <td onClick={(event) => event.stopPropagation()}>
                                  <button
                                    type="button"
                                    className="btn btn-light"
                                    onClick={() => openInvoiceViewerForOrder(order)}
                                  >
                                    정산서 보기
                                  </button>
                                </td>
                              </tr>

                              {isExpanded ? (
                                <tr>
                                  <td colSpan={10}>
                                    <div className="order-group-detail">
                                      {order.stock_released_at ? (
                                        <div className="warning-note">
                                          이미 출고 처리된 주문입니다. 저장 시 재확인 팝업이 뜨고, 변경해도 이미 차감된 재고 수량은 자동으로 되돌아가지 않습니다.
                                        </div>
                                      ) : null}
                                      <form className="form-grid" onSubmit={submitOrderDetail}>
                                        <div className="full">
                                          <div className="section-head compact">
                                            <h4>판매 항목</h4>
                                            <button type="button" className="btn btn-light" onClick={addOrderDetailItem}>
                                              항목 추가
                                            </button>
                                          </div>

                                          <div className="line-items">
                                            {orderDetailForm.items.map((item, itemIndex) => (
                                              <div className="line-item numbered" key={`group-detail-${order.id}-${itemIndex}-${item.product_id}`}>
                                                <span className="line-item-no">{itemIndex + 1}</span>
                                                <input
                                                  type="text"
                                                  list="product-options"
                                                  value={getProductSearchValue(item)}
                                                  onChange={(event) => applyProductSearchSelection(setOrderDetailItem, itemIndex, event.target.value)}
                                                  placeholder="상품명 검색"
                                                  required
                                                />

                                                <input
                                                  type="number"
                                                  min="1"
                                                  value={item.quantity}
                                                  onChange={(event) => setOrderDetailItem(itemIndex, 'quantity', event.target.value)}
                                                  required
                                                />

                                                <input
                                                  type="number"
                                                  min="0"
                                                  value={item.unit_price}
                                                  onChange={(event) => setOrderDetailItem(itemIndex, 'unit_price', event.target.value)}
                                                  required
                                                />

                                                <div className="line-total">
                                                  ₩ {money(Number(item.quantity) * Number(item.unit_price))}
                                                </div>

                                                <button type="button" className="btn btn-light" onClick={() => removeOrderDetailItem(itemIndex)}>
                                                  삭제
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        </div>

                                        <div className="full actions-row">
                                          <strong>
                                            총액: ₩
                                            {money(
                                              orderDetailForm.items.reduce(
                                                (acc, item) => acc + Number(item.quantity || 0) * Number(item.unit_price || 0),
                                                0,
                                              ),
                                            )}
                                          </strong>
                                          <button type="submit" className="btn btn-primary" disabled={isOrderSaving}>
                                            {isOrderSaving ? '저장 중...' : '판매 항목 저장'}
                                          </button>
                                        </div>
                                      </form>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : (
                <Card title="구매자별 정산서" sub="선택한 라이브에 연결된 구매자가 없습니다.">
                  <div className="muted">해당 라이브에 주문이 없습니다.</div>
                </Card>
              )}
            </div>

            {memoOrder ? (
              <Modal
                title={`${memoOrder.order_code} 메모`}
                sub="이 주문에 대한 메모를 남깁니다."
                onClose={closeMemoPopup}
              >
                <form className="form-grid" onSubmit={submitMemo}>
                  <label className="full">
                    주문 메모
                    <textarea
                      value={memoDraft}
                      onChange={(event) => setMemoDraft(event.target.value)}
                    />
                  </label>

                  <div className="full actions-row">
                    <button type="button" className="btn btn-light" onClick={closeMemoPopup}>
                      취소
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isSavingMemo}>
                      {isSavingMemo ? '저장 중...' : '메모 저장'}
                    </button>
                  </div>
                </form>
              </Modal>
            ) : null}
          </div>
        )}

        {activeMenu === 'live-sessions' && (
          <div className="content-grid single">
            <Card
                title="라이브 세션"
              sub="방송 세션 목록. 행을 클릭하면 바로 수정할 수 있습니다."
              action={
                <button type="button" className="btn btn-primary" onClick={openCreateLiveModal}>
                  라이브 추가
                </button>
              }
            >
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>제목</th>
                    <th>날짜</th>
                  </tr>
                </thead>
                <tbody>
                  {liveSessions.map((live) => (
                    <tr
                      key={live.id}
                      className="clickable-row"
                      onClick={() => openEditLiveModal(live)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openEditLiveModal(live)
                        }
                      }}
                      tabIndex={0}
                    >
                      <td>{live.id}</td>
                      <td>{live.live_title}</td>
                      <td>{toDateKey(live.live_started_at) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {isLiveModalOpen ? (
          <Modal
            title={editingLiveId ? '라이브 세션 수정' : '라이브 세션 추가'}
            sub={editingLiveId ? '선택한 라이브 세션 정보를 수정합니다.' : '라이브 정보를 입력하세요.'}
            onClose={closeLiveModal}
          >
            <form className="form-grid" onSubmit={submitLive}>
              <label>
                제목
                <input
                  value={liveForm.live_title}
                  onChange={(event) => setLiveForm((prev) => ({ ...prev, live_title: event.target.value }))}
                  required
                />
              </label>

              <label>
                날짜
                <input
                  type="date"
                  value={liveForm.live_started_at}
                  onChange={(event) => setLiveForm((prev) => ({ ...prev, live_started_at: event.target.value }))}
                />
              </label>

              <label className="full">
                메모
                <textarea
                  value={liveForm.memo}
                  onChange={(event) => setLiveForm((prev) => ({ ...prev, memo: event.target.value }))}
                />
              </label>

              <div className="full actions-row">
                <button type="button" className="btn btn-light" onClick={closeLiveModal}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingLiveId ? '수정 저장' : '저장'}
                </button>
              </div>
            </form>
          </Modal>
        ) : null}

        {activeMenu === 'products' && (
          <div className="content-grid single">
            <div className="rate-strip">
              <div>
                <span>오늘 환율</span>
                <strong>{hasTodayExchangeRate ? `1 JPY = ₩ ${todayExchangeRate.toLocaleString('ko-KR')}` : '미입력'}</strong>
              </div>
              <button type="button" className="btn btn-light" onClick={() => goToMenu('dashboard')}>
                환율 관리
              </button>
            </div>

            <div
              className={`product-tools ${productActivePanel === 'scanner' ? 'active-panel' : 'inactive-panel'}`}
              onClick={activateProductScannerPanel}
              onFocusCapture={() => setProductActivePanel('scanner')}
            >
              <form className="barcode-scan-form" onSubmit={handleProductScanSubmit}>
                <label>
                  바코드 스캔 / 입력
                  <input
                    ref={productSearchInputRef}
                    value={productScanValue}
                    onChange={(event) => setProductScanValue(event.target.value)}
                    placeholder="스캐너로 찍거나 직접 입력 후 Enter"
                  />
                </label>
                <button type="submit" className="btn btn-primary">
                  찾기
                </button>
              </form>
              <p>등록된 바코드면 해당 행으로 이동하고, 없으면 신규 상품 행에 바코드가 자동 입력됩니다.</p>
            </div>

            <Card
              className={`product-list-card ${productActivePanel === 'list' ? 'active-panel' : 'inactive-panel'}`}
              title="상품 목록"
              titleBadge={productActivePanel === 'list' ? (isProductListScanArmed ? '스캔 대기' : '수정 중') : '비활성'}
              sub="바코드와 가격을 테이블에서 바로 수정하고, 새 상품도 행으로 추가합니다."
              onClick={handleProductListPanelClick}
              onFocusCapture={handleProductListPanelFocus}
            >
              <table className="product-table inline-edit-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>바코드</th>
                    <th>상품명</th>
                    <th>도매가 (JPY)</th>
                    <th>소매가 (JPY)</th>
                    <th>환산 도매가</th>
                    <th>환산 소매가</th>
                    <th>라이브가</th>
                    <th>재고</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {productTableRows.map((product) => {
                    const isSaving = savingProductKey === product.rowKey
                    const isDirty = isProductRowDirty(product)

                    return (
                      <tr
                        key={product.rowKey}
                        ref={(node) => {
                          if (node) productRowRefs.current[product.rowKey] = node
                        }}
                        className={`editable-row ${highlightedProductKey === product.rowKey ? 'active-row product-row-highlight' : ''}`}
                        onFocusCapture={() => handleProductRowFocus(product)}
                        onBlurCapture={(event) => handleProductRowBlur(event, product)}
                      >
                        <td>{product.isDraft ? '신규' : product.id}</td>
                        <td>
                          <input
                            className="table-input barcode-input"
                            value={product.barcode || ''}
                            onChange={(event) => setProductRowValue(product, 'barcode', event.target.value)}
                            placeholder="바코드"
                            required
                          />
                        </td>
                        <td>
                          <input
                            className="table-input product-name-input"
                            value={product.product_name}
                            onChange={(event) => setProductRowValue(product, 'product_name', event.target.value)}
                            placeholder="상품명"
                            required
                          />
                        </td>
                        <td>
                          <input
                            className="table-input number-input"
                            type="number"
                            min="0"
                            value={product.wholesale_price_jpy}
                            onChange={(event) => setProductRowValue(product, 'wholesale_price_jpy', event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="table-input number-input"
                            type="number"
                            min="0"
                            value={product.retail_price_krw}
                            onChange={(event) => setProductRowValue(product, 'retail_price_krw', event.target.value)}
                          />
                        </td>
                        <td>{hasTodayExchangeRate ? `₩ ${money(product.exchangeWholesalePrice)}` : '-'}</td>
                        <td>{hasTodayExchangeRate ? `₩ ${money(product.exchangeRetailPrice)}` : '-'}</td>
                        <td>
                          <input
                            className="table-input number-input"
                            type="number"
                            min="0"
                            value={product.live_price}
                            onChange={(event) => setProductRowValue(product, 'live_price', event.target.value)}
                          />
                        </td>
                        <td>
                          <strong>{money(product.stock_quantity)}</strong>
                          <div className="muted table-subtext">입고 관리</div>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => saveProductRow(product)}
                              disabled={isSaving || !isDirty}
                            >
                              {isSaving ? '저장 중...' : '저장'}
                            </button>
                            {product.isDraft ? (
                              <button
                                type="button"
                                className="btn btn-light"
                                onClick={() => resetProductRow(product)}
                                disabled={isSaving}
                              >
                                삭제
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="product-add-row">
                    <td colSpan={10}>
                      <button
                        type="button"
                        className="product-add-button"
                        onClick={() => addProductDraft()}
                      >
                        +
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>

              {!hasTodayExchangeRate ? (
                <div className="muted inline-note">오늘 환율을 입력하면 환산 금액 컬럼이 활성화됩니다.</div>
              ) : null}
            </Card>
          </div>
          )}

          {activeMenu === 'inventory' && (
            <div className="content-grid single">
              <Card
                title={'입고 목록'}
                sub={'날짜별로 입고 로그를 확인하고, 날짜를 클릭하면 해당 일자의 상세 내역이 펼쳐집니다.'}
                action={
                  <button type="button" className="btn btn-primary" onClick={openInboundModal}>
                    {'입고 등록'}
                  </button>
                }
              >
                <table>
                  <thead>
                    <tr>
                      <th>{'날짜'}</th>
                      <th>{'입고 건수'}</th>
                      <th>{'총 수량'}</th>
                      <th>{'상세'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inboundGroups.length ? (
                      inboundGroups.map((group) => {
                        const isExpanded = expandedInboundGroupKey === group.key
                        return (
                          <>
                            <tr
                              key={group.key}
                              className={`clickable-row ${isExpanded ? 'active-row' : ''}`}
                              onClick={() => setExpandedInboundGroupKey((prev) => (prev === group.key ? null : group.key))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setExpandedInboundGroupKey((prev) => (prev === group.key ? null : group.key))
                                }
                              }}
                              tabIndex={0}
                            >
                              <td>{group.date || '-'}</td>
                              <td>{group.items.length}{'건'}</td>
                              <td>{money(group.totalQuantity)}</td>
                              <td>{isExpanded ? '접기' : '펼치기'}</td>
                            </tr>
                            {isExpanded ? (
                              <tr key={`${group.key}-detail`}>
                                <td colSpan={4}>
                                  <table className="compact-table">
                                    <thead>
                                      <tr>
                                        <th>{'시간'}</th>
                                        <th>{'상품'}</th>
                                        <th>{'수량'}</th>
                                        <th>{'메모'}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.items.map((movement) => {
                                        const product = products.find((item) => item.id === movement.product_id)
                                        return (
                                          <tr key={movement.id}>
                                            <td>{formatDateTime(movement.created_at)}</td>
                                            <td>{product?.product_name || `상품 #${movement.product_id}`}</td>
                                            <td>{money(movement.quantity)}</td>
                                            <td>{movement.memo || '-'}</td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            ) : null}
                          </>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="muted">{'아직 입고 기록이 없습니다.'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>

              {isInboundModalOpen ? (
                <Modal
                  title={'입고 등록'}
                  sub={'여러 상품을 한 번에 입고 등록할 수 있습니다.'}
                  onClose={closeInboundModal}
                >
                  <form className="form-grid" onSubmit={submitInbound}>
                    <div className="full">
                      <div className="section-head compact">
                        <h4>{'입고 항목'}</h4>
                        <button type="button" className="btn btn-light" onClick={addInboundItem}>
                          {'품목 추가'}
                        </button>
                      </div>

                      <div className="line-items">
                        {inboundForm.items.map((item, index) => (
                          <div className="line-item" key={`inbound-${index}-${item.product_id}`}>
                            <select
                              value={item.product_id}
                              onChange={(event) => setInboundItem(index, 'product_id', event.target.value)}
                              required
                            >
                              <option value="">{'상품 선택'}</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.product_name} / {'현재 재고'} {money(product.stock_quantity)}
                                </option>
                              ))}
                            </select>

                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(event) => setInboundItem(index, 'quantity', event.target.value)}
                              required
                            />

                            <div className="line-total">{'입고'} {money(item.quantity)}{'개'}</div>

                            <button type="button" className="btn btn-light" onClick={() => removeInboundItem(index)}>
                              {'삭제'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <label className="full">
                      {'공통 메모'}
                      <input
                        value={inboundForm.memo}
                        onChange={(event) => setInboundForm((prev) => ({ ...prev, memo: event.target.value }))}
                        placeholder={'예: 5월 11일 일본 매입분'}
                      />
                    </label>

                    <div className="full actions-row">
                      <strong>{'여러 상품을 한 번에 입고 처리하고, 메모는 공통으로 저장됩니다.'}</strong>
                      <div className="table-actions">
                        <button type="button" className="btn btn-light" onClick={closeInboundModal}>
                          {'닫기'}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={isInboundSaving}>
                          {isInboundSaving ? '저장 중...' : '입고 저장'}
                        </button>
                      </div>
                    </div>
                  </form>
                </Modal>
              ) : null}
            </div>
          )}

        {activeMenu === 'customers' && (
            <div className="content-grid single">
            <Card
              title="고객 목록"
              sub="정산서에 반영되는 고객 기본 정보. 행을 클릭하면 바로 수정할 수 있습니다."
              action={
                <button type="button" className="btn btn-primary" onClick={openCreateCustomerModal}>
                  고객 추가
                </button>
              }
            >
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>인스타 ID</th>
                    <th>이름</th>
                    <th>연락처</th>
                    <th>주소</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="clickable-row"
                      onClick={() => openEditCustomerModal(customer)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openEditCustomerModal(customer)
                        }
                      }}
                      tabIndex={0}
                    >
                      <td>{customer.id}</td>
                      <td>{customer.instagram_id}</td>
                      <td>{customer.customer_name || '-'}</td>
                      <td>{customer.phone_number || '-'}</td>
                      <td>{[customer.address1, customer.address2].filter(Boolean).join(' ') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {isCustomerModalOpen ? (
              <Modal
                title={editingCustomerId ? '고객 수정' : '고객 추가'}
                sub={editingCustomerId ? '선택한 고객 정보를 수정합니다.' : '정산서와 배송에 필요한 정보를 입력하세요.'}
                onClose={closeCustomerModal}
              >
                <form className="form-grid" onSubmit={submitCustomer}>
                  <label>
                    인스타 ID
                    <input
                      value={customerForm.instagram_id}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, instagram_id: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    이름
                    <input
                      value={customerForm.customer_name}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, customer_name: event.target.value }))}
                    />
                  </label>

                  <label>
                    연락처
                    <input
                      value={customerForm.phone_number}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, phone_number: event.target.value }))}
                    />
                  </label>

                  <label>
                    주소 1
                    <input
                      value={customerForm.address1}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, address1: event.target.value }))}
                    />
                  </label>

                  <label className="full">
                    주소 2
                    <input
                      value={customerForm.address2}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, address2: event.target.value }))}
                    />
                  </label>

                  <div className="full actions-row">
                    <button type="button" className="btn btn-light" onClick={closeCustomerModal}>
                      취소
                    </button>
                    <button type="submit" className="btn btn-primary">
                      {editingCustomerId ? '수정 저장' : '저장'}
                    </button>
                  </div>
                </form>
              </Modal>
            ) : null}
          </div>
        )}
      </main>
    </div>
  )
}
