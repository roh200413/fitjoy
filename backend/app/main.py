import hashlib
import hmac
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .models import AppSetting, ChangeHistory, Customer, InventoryMovement, LiveSession, Order, OrderItem, Product, Shipment
from .schemas import (
    ChangeHistoryRead,
    CustomerCreate,
    CustomerRead,
    CustomerUpdate,
    InventoryInboundBulkCreate,
    InventoryMovementCreate,
    InventoryMovementRead,
    LiveSessionCreate,
    LiveSessionRead,
    LiveSessionUpdate,
    OrderCreate,
    OrderRead,
    OrderUpdate,
    PinChangeRequest,
    PinVerifyRequest,
    ProductCreate,
    ProductRead,
    ProductUpdate,
    ShipmentRead,
    ShipmentUpdate,
)

PIN_SALT = "fitjoy-access-pin"
DEFAULT_ACCESS_PIN = "0000"


def hash_pin(pin: str) -> str:
    return hashlib.sha256(f"{PIN_SALT}:{pin}".encode()).hexdigest()

def ensure_schema():
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    product_column_info = {column["name"]: column for column in inspector.get_columns("products")}
    product_columns = set(product_column_info)
    if "barcode" not in product_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE products ADD COLUMN barcode VARCHAR(100)"))
        product_columns.add("barcode")
    if "stock_quantity" not in product_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE products ADD COLUMN stock_quantity INTEGER NOT NULL DEFAULT 0"))
        product_columns.add("stock_quantity")

    if "barcode" in product_columns:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    UPDATE products
                    SET barcode = printf('P%06d', id)
                    WHERE TRIM(COALESCE(barcode, '')) = ''
                    """
                )
            )

    barcode_column = product_column_info.get("barcode")
    if engine.dialect.name == "sqlite" and (barcode_column is None or barcode_column.get("nullable", True)):
        with engine.begin() as connection:
            connection.execute(text("PRAGMA foreign_keys=OFF"))
            connection.execute(text("DROP TABLE IF EXISTS products__new"))
            connection.execute(
                text(
                    """
                    CREATE TABLE products__new (
                        id INTEGER PRIMARY KEY,
                        barcode VARCHAR(100) NOT NULL UNIQUE,
                        product_name VARCHAR(200) NOT NULL,
                        wholesale_price_jpy INTEGER NOT NULL DEFAULT 0,
                        retail_price_krw INTEGER NOT NULL DEFAULT 0,
                        live_price INTEGER NOT NULL,
                        stock_quantity INTEGER NOT NULL DEFAULT 0,
                        is_active BOOLEAN NOT NULL DEFAULT 1,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL
                    )
                    """
                )
            )
            connection.execute(
                text(
                    """
                    INSERT INTO products__new (
                        id, barcode, product_name, wholesale_price_jpy, retail_price_krw,
                        live_price, stock_quantity, is_active, created_at, updated_at
                    )
                    SELECT
                        id,
                        COALESCE(NULLIF(TRIM(barcode), ''), printf('P%06d', id)),
                        product_name,
                        wholesale_price_jpy,
                        retail_price_krw,
                        live_price,
                        COALESCE(stock_quantity, 0),
                        is_active,
                        created_at,
                        updated_at
                    FROM products
                    """
                )
            )
            connection.execute(text("DROP TABLE products"))
            connection.execute(text("ALTER TABLE products__new RENAME TO products"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_products_barcode ON products (barcode)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_products_id ON products (id)"))
            connection.execute(text("PRAGMA foreign_keys=ON"))

        inspector = inspect(engine)
        product_column_info = {column["name"]: column for column in inspector.get_columns("products")}
        product_columns = set(product_column_info)
    if "settlement_date" not in {column["name"] for column in inspector.get_columns("orders")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE orders ADD COLUMN settlement_date DATE"))
            connection.execute(text("UPDATE orders SET settlement_date = DATE('now') WHERE settlement_date IS NULL"))
    order_columns = {column["name"] for column in inspector.get_columns("orders")}
    if "stock_released_at" not in order_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE orders ADD COLUMN stock_released_at DATETIME"))
    if "shipping_fee" not in order_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE orders ADD COLUMN shipping_fee INTEGER NOT NULL DEFAULT 0"))
    shipment_columns = {column["name"] for column in inspector.get_columns("shipments")}
    if "shipping_type" not in shipment_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE shipments ADD COLUMN shipping_type VARCHAR(30) NOT NULL DEFAULT 'direct'"))
    live_column = next((column for column in inspector.get_columns("orders") if column["name"] == "live_id"), None)
    orders_pk_columns = inspector.get_pk_constraint("orders").get("constrained_columns") or []
    orders_id_missing_pk = "id" not in orders_pk_columns
    if engine.dialect.name == "sqlite" and (
        (live_column and not live_column.get("nullable", True)) or orders_id_missing_pk
    ):
        with engine.begin() as connection:
            connection.execute(text("PRAGMA foreign_keys=OFF"))
            connection.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS orders__new (
                        id INTEGER PRIMARY KEY,
                        customer_id INTEGER NOT NULL,
                        live_id INTEGER,
                        order_code VARCHAR(50),
                        settlement_date DATE NOT NULL,
                        total_product_amount INTEGER NOT NULL DEFAULT 0,
                        shipping_fee INTEGER NOT NULL DEFAULT 0,
                        note TEXT,
                        stock_released_at DATETIME,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        FOREIGN KEY(customer_id) REFERENCES customers (id),
                        FOREIGN KEY(live_id) REFERENCES live_sessions (id)
                    )
                    """
                )
            )
            connection.execute(
                text(
                    """
                    INSERT INTO orders__new (
                        id, customer_id, live_id, order_code, settlement_date,
                        total_product_amount, shipping_fee, note, stock_released_at, created_at, updated_at
                    )
                    SELECT
                        id, customer_id, live_id, order_code, settlement_date,
                        total_product_amount, COALESCE(shipping_fee, 0), note, stock_released_at, created_at, updated_at
                    FROM orders
                    """
                )
            )
            connection.execute(text("DROP TABLE orders"))
            connection.execute(text("ALTER TABLE orders__new RENAME TO orders"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_order_code ON orders (order_code)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_id ON orders (id)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_customer_id ON orders (customer_id)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_live_id ON orders (live_id)"))
            connection.execute(text("PRAGMA foreign_keys=ON"))

def raise_integrity_error(exc: IntegrityError):
    message = str(getattr(exc, "orig", exc))
    lowered = message.lower()
    if "products.barcode" in lowered or "barcode" in lowered and "unique" in lowered:
        raise HTTPException(status_code=409, detail="barcode already exists") from exc
    raise HTTPException(status_code=400, detail=message) from exc

app = FastAPI(title="FITJOY API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

PAYMENT_STATUS = {"pending", "paid"}
SHIPPING_STATUS = {"ready", "shipped", "delivered"}
SHIPPING_TYPES = {"direct", "keep"}
PAYMENT_STATUS_RANK = {"pending": 0, "paid": 1}
SHIPPING_STATUS_RANK = {"ready": 0, "shipped": 1, "delivered": 2}


def _history_value(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def add_change_histories(db: Session, entity_type: str, entity_id: int, before: dict, after: dict):
    for key, after_value in after.items():
        before_value = before.get(key)
        if before_value == after_value:
            continue

        db.add(
            ChangeHistory(
                entity_type=entity_type,
                entity_id=entity_id,
                action="update",
                field_name=key,
                before_value=_history_value(before_value),
                after_value=_history_value(after_value),
            )
        )


def normalize_product_payload(payload: ProductCreate | ProductUpdate):
    data = payload.model_dump()
    barcode = str(data.get("barcode", "")).strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="barcode is required")
    data["barcode"] = barcode
    data["product_name"] = data["product_name"].strip()
    return data


def merge_text_values(*values):
    seen = []
    for value in values:
        normalized = (value or "").strip()
        if normalized and normalized not in seen:
            seen.append(normalized)
    return "\n".join(seen) if seen else None


def pick_latest_non_empty(records, field_name):
    for record in sorted(records, key=lambda item: (item.updated_at or item.created_at or datetime.min), reverse=True):
        value = getattr(record, field_name, None)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ""):
            return value
    return None


def merge_duplicate_orders():
    db = SessionLocal()
    try:
        orders = (
            db.query(Order)
            .options(joinedload(Order.items), joinedload(Order.shipment))
            .order_by(Order.customer_id.asc(), Order.live_id.asc(), Order.created_at.asc(), Order.id.asc())
            .all()
        )

        grouped_orders = {}
        for order in orders:
            if order.live_id is None:
                continue
            grouped_orders.setdefault((order.customer_id, order.live_id), []).append(order)

        dirty = False
        for duplicate_orders in grouped_orders.values():
            if len(duplicate_orders) < 2:
                continue

            primary_order = duplicate_orders[0]
            merge_targets = duplicate_orders[1:]

            merged_item_map = {item.product_id: item for item in primary_order.items}
            all_shipments = [order.shipment for order in duplicate_orders if order.shipment]

            for target_order in merge_targets:
                for item in target_order.items:
                    existing_item = merged_item_map.get(item.product_id)
                    if existing_item:
                        existing_item.quantity += item.quantity
                        existing_item.unit_price = item.unit_price
                        existing_item.line_amount = existing_item.quantity * existing_item.unit_price
                        existing_item.product_name_snapshot = item.product_name_snapshot
                        db.delete(item)
                    else:
                        item.order_id = primary_order.id
                        merged_item_map[item.product_id] = item

                db.query(InventoryMovement).filter(InventoryMovement.order_id == target_order.id).update(
                    {InventoryMovement.order_id: primary_order.id},
                    synchronize_session=False,
                )

                primary_order.shipping_fee = max(primary_order.shipping_fee or 0, target_order.shipping_fee or 0)
                primary_order.settlement_date = max(primary_order.settlement_date, target_order.settlement_date)
                primary_order.note = merge_text_values(primary_order.note, target_order.note)
                if primary_order.stock_released_at is None or (
                    target_order.stock_released_at and target_order.stock_released_at < primary_order.stock_released_at
                ):
                    primary_order.stock_released_at = target_order.stock_released_at or primary_order.stock_released_at

                db.delete(target_order)
                dirty = True

            if all_shipments:
                if not primary_order.shipment:
                    primary_order.shipment = all_shipments[0]
                shipment = primary_order.shipment
                shipment.payment_status = min(
                    (current.payment_status or "pending" for current in all_shipments),
                    key=lambda value: PAYMENT_STATUS_RANK.get(value, 0),
                )
                paid_amounts = [current.paid_amount for current in all_shipments if current.paid_amount is not None]
                shipment.paid_amount = sum(paid_amounts) if paid_amounts else None
                shipment.paid_at = max((current.paid_at for current in all_shipments if current.paid_at), default=None)
                shipment.shipping_type = "direct" if any(current.shipping_type == "direct" for current in all_shipments) else "keep"
                shipment.shipping_status = min(
                    (current.shipping_status or "ready" for current in all_shipments),
                    key=lambda value: SHIPPING_STATUS_RANK.get(value, 0),
                )
                shipment.shipped_at = min((current.shipped_at for current in all_shipments if current.shipped_at), default=None)
                shipment.delivered_at = max((current.delivered_at for current in all_shipments if current.delivered_at), default=None)
                for field_name in (
                    "receiver_name",
                    "receiver_phone",
                    "shipping_address1",
                    "shipping_address2",
                    "courier_name",
                    "tracking_number",
                ):
                    setattr(shipment, field_name, pick_latest_non_empty(all_shipments, field_name))
                shipment.memo = merge_text_values(*(current.memo for current in all_shipments), primary_order.note)

            primary_order.total_product_amount = sum(item.line_amount for item in merged_item_map.values())

        if dirty:
            db.commit()
    finally:
        db.close()


def recalculate_order_totals():
    db = SessionLocal()
    try:
        orders = db.query(Order).options(joinedload(Order.items)).all()
        dirty = False
        for order in orders:
            total = sum(item.quantity * item.unit_price for item in order.items)
            if order.total_product_amount != total:
                order.total_product_amount = total
                dirty = True
        if dirty:
            db.commit()
    finally:
        db.close()


def ensure_default_pin():
    db = SessionLocal()
    try:
        if not db.query(AppSetting).first():
            db.add(AppSetting(access_pin_hash=hash_pin(DEFAULT_ACCESS_PIN)))
            db.commit()
    finally:
        db.close()


ensure_schema()
merge_duplicate_orders()
recalculate_order_totals()
ensure_default_pin()


@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/auth/verify-pin")
def verify_pin(payload: PinVerifyRequest, db: Session = Depends(get_db)):
    setting = db.query(AppSetting).first()
    if not setting or not hmac.compare_digest(setting.access_pin_hash, hash_pin(payload.pin)):
        raise HTTPException(status_code=401, detail="invalid pin")
    return {"valid": True}


@app.post("/api/auth/change-pin")
def change_pin(payload: PinChangeRequest, db: Session = Depends(get_db)):
    setting = db.query(AppSetting).first()
    if not setting or not hmac.compare_digest(setting.access_pin_hash, hash_pin(payload.current_pin)):
        raise HTTPException(status_code=401, detail="current pin is incorrect")
    setting.access_pin_hash = hash_pin(payload.new_pin)
    db.commit()
    return {"valid": True}


@app.get("/api/change-histories", response_model=list[ChangeHistoryRead])
def list_change_histories(
    entity_type: str | None = Query(default=None),
    entity_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(ChangeHistory)
    if entity_type:
        query = query.filter(ChangeHistory.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(ChangeHistory.entity_id == entity_id)
    return query.order_by(ChangeHistory.id.desc()).all()


@app.post("/api/products", response_model=ProductRead)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    product = Product(**normalize_product_payload(payload))
    db.add(product)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise_integrity_error(exc)
    db.refresh(product)
    return product


@app.get("/api/products", response_model=list[ProductRead])
def list_products(
    keyword: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Product)
    if keyword:
        query = query.filter(or_(Product.product_name.ilike(f"%{keyword}%"), Product.barcode.ilike(f"%{keyword}%")))
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
    return query.order_by(Product.id.desc()).all()


@app.put("/api/products/{product_id}", response_model=ProductRead)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="product not found")

    changes = normalize_product_payload(payload)
    before = {key: getattr(product, key) for key in changes}

    for key, value in changes.items():
        setattr(product, key, value)

    add_change_histories(db, "product", product.id, before, changes)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise_integrity_error(exc)
    db.refresh(product)
    return product


@app.post("/api/customers", response_model=CustomerRead)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)):
    customer = Customer(**payload.model_dump())
    db.add(customer)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="instagram_id already exists") from exc
    db.refresh(customer)
    return customer


@app.get("/api/customers", response_model=list[CustomerRead])
def list_customers(
    instagram_id: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Customer)
    if instagram_id:
        query = query.filter(Customer.instagram_id.ilike(f"%{instagram_id}%"))
    if keyword:
        query = query.filter(Customer.customer_name.ilike(f"%{keyword}%"))
    return query.order_by(Customer.id.desc()).all()


@app.put("/api/customers/{customer_id}", response_model=CustomerRead)
def update_customer(customer_id: int, payload: CustomerUpdate, db: Session = Depends(get_db)):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="customer not found")

    changes = payload.model_dump()
    before = {key: getattr(customer, key) for key in changes}

    for key, value in changes.items():
        setattr(customer, key, value)

    add_change_histories(db, "customer", customer.id, before, changes)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="instagram_id already exists") from exc

    db.refresh(customer)
    return customer


@app.post("/api/live-sessions", response_model=LiveSessionRead)
def create_live_session(payload: LiveSessionCreate, db: Session = Depends(get_db)):
    live_session = LiveSession(**payload.model_dump())
    db.add(live_session)
    db.commit()
    db.refresh(live_session)
    return live_session


@app.get("/api/live-sessions", response_model=list[LiveSessionRead])
def list_live_sessions(db: Session = Depends(get_db)):
    return db.query(LiveSession).order_by(LiveSession.id.desc()).all()


@app.put("/api/live-sessions/{live_session_id}", response_model=LiveSessionRead)
def update_live_session(live_session_id: int, payload: LiveSessionUpdate, db: Session = Depends(get_db)):
    live_session = db.get(LiveSession, live_session_id)
    if not live_session:
        raise HTTPException(status_code=404, detail="live session not found")

    changes = payload.model_dump()
    before = {key: getattr(live_session, key) for key in changes}

    for key, value in changes.items():
        setattr(live_session, key, value)

    add_change_histories(db, "live_session", live_session.id, before, changes)
    db.commit()
    db.refresh(live_session)
    return live_session


@app.post("/api/orders", response_model=OrderRead)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    if payload.shipping_type not in SHIPPING_TYPES:
        raise HTTPException(status_code=400, detail="invalid shipping_type")

    customer = db.get(Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="customer not found")
    if payload.live_id is not None:
        live_session = db.get(LiveSession, payload.live_id)
        if not live_session:
            raise HTTPException(status_code=404, detail="live session not found")

    order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .filter(Order.customer_id == payload.customer_id, Order.live_id == payload.live_id)
        .first()
    )

    if order and order.stock_released_at:
        raise HTTPException(status_code=400, detail="already released order cannot be merged")

    if not order:
        order = Order(
            customer_id=payload.customer_id,
            live_id=payload.live_id,
            settlement_date=payload.settlement_date or datetime.utcnow().date(),
            shipping_fee=payload.shipping_fee,
            note=payload.note,
            order_code=f"ORD-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}",
            total_product_amount=0,
        )
        db.add(order)
        db.flush()
    else:
        order.settlement_date = payload.settlement_date or order.settlement_date
        order.shipping_fee = payload.shipping_fee
        order.note = payload.note if payload.note is not None else order.note

    item_map = {item.product_id: item for item in order.items}

    for item in payload.items:
        product = db.get(Product, item.product_id)
        if not product:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"product {item.product_id} not found")

        existing_item = item_map.get(item.product_id)
        if existing_item:
            existing_item.quantity += item.quantity
            existing_item.unit_price = item.unit_price
            existing_item.line_amount = existing_item.quantity * existing_item.unit_price
            existing_item.product_name_snapshot = product.product_name
        else:
            order_item = OrderItem(
                order_id=order.id,
                product_id=item.product_id,
                product_name_snapshot=product.product_name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_amount=item.quantity * item.unit_price,
            )
            db.add(order_item)
            item_map[item.product_id] = order_item

    order.total_product_amount = sum(item.line_amount for item in item_map.values())

    if order.shipment:
        order.shipment.shipping_type = payload.shipping_type
    else:
        db.add(
            Shipment(
                order_id=order.id,
                payment_status="pending",
                shipping_type=payload.shipping_type,
                shipping_status="ready",
            )
        )

    db.commit()

    created = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .filter(Order.id == order.id)
        .first()
    )
    return created


@app.get("/api/inventory-movements", response_model=list[InventoryMovementRead])
def list_inventory_movements(
    movement_type: str | None = Query(default=None),
    product_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(InventoryMovement)
    if movement_type:
        query = query.filter(InventoryMovement.movement_type == movement_type)
    if product_id is not None:
        query = query.filter(InventoryMovement.product_id == product_id)
    return query.order_by(InventoryMovement.id.desc()).all()


@app.post("/api/inventory-movements/inbound", response_model=InventoryMovementRead)
def create_inventory_inbound(payload: InventoryMovementCreate, db: Session = Depends(get_db)):
    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="product not found")

    product.stock_quantity += payload.quantity
    movement = InventoryMovement(
        product_id=payload.product_id,
        movement_type="inbound",
        quantity=payload.quantity,
        memo=payload.memo,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement


@app.post("/api/inventory-movements/inbound/bulk", response_model=list[InventoryMovementRead])
def create_inventory_inbound_bulk(payload: InventoryInboundBulkCreate, db: Session = Depends(get_db)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="items is required")

    movements = []
    for item in payload.items:
        product = db.get(Product, item.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"product {item.product_id} not found")

        product.stock_quantity += item.quantity
        movement = InventoryMovement(
            product_id=item.product_id,
            movement_type="inbound",
            quantity=item.quantity,
            memo=payload.memo,
        )
        db.add(movement)
        movements.append(movement)

    db.commit()
    for movement in movements:
        db.refresh(movement)
    return movements


@app.post("/api/orders/{order_id}/release-stock", response_model=OrderRead)
def release_order_stock(order_id: int, db: Session = Depends(get_db)):
    order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="order not found")
    if order.stock_released_at:
        raise HTTPException(status_code=400, detail="stock already released")

    for item in order.items:
        product = db.get(Product, item.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"product {item.product_id} not found")
        if product.stock_quantity < item.quantity:
            raise HTTPException(status_code=400, detail=f"{product.product_name} stock is insufficient")

    for item in order.items:
        product = db.get(Product, item.product_id)
        product.stock_quantity -= item.quantity
        db.add(
            InventoryMovement(
                product_id=item.product_id,
                order_id=order.id,
                movement_type="outbound",
                quantity=item.quantity,
                memo=f"order:{order.order_code}",
            )
        )

    order.stock_released_at = datetime.utcnow()
    db.commit()

    updated = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .filter(Order.id == order.id)
        .first()
    )
    return updated


@app.post("/api/orders/{order_id}/unrelease-stock", response_model=OrderRead)
def unrelease_order_stock(order_id: int, db: Session = Depends(get_db)):
    order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="order not found")
    if not order.stock_released_at:
        raise HTTPException(status_code=400, detail="stock not released")

    for item in order.items:
        product = db.get(Product, item.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"product {item.product_id} not found")
        product.stock_quantity += item.quantity
        db.add(
            InventoryMovement(
                product_id=item.product_id,
                order_id=order.id,
                movement_type="inbound",
                quantity=item.quantity,
                memo=f"release_cancelled:{order.order_code}",
            )
        )

    order.stock_released_at = None
    db.commit()

    updated = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .filter(Order.id == order.id)
        .first()
    )
    return updated


@app.get("/api/orders", response_model=list[OrderRead])
def list_orders(db: Session = Depends(get_db)):
    return (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .order_by(Order.id.desc())
        .all()
    )


@app.get("/api/orders/{order_id}", response_model=OrderRead)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="order not found")
    return order


@app.put("/api/orders/{order_id}", response_model=OrderRead)
def update_order(order_id: int, payload: OrderUpdate, db: Session = Depends(get_db)):
    order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="order not found")

    before_values = {
        "live_id": order.live_id,
        "settlement_date": order.settlement_date,
        "shipping_fee": order.shipping_fee,
        "shipping_type": order.shipment.shipping_type if order.shipment else None,
        "note": order.note,
        "total_product_amount": order.total_product_amount,
        "items": " | ".join(
            f"{item.product_name_snapshot} x{item.quantity} @{item.unit_price}" for item in order.items
        ),
    }

    total = 0
    next_items: list[OrderItem] = []
    for item in payload.items:
        product = db.get(Product, item.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"product {item.product_id} not found")

        line_amount = item.quantity * item.unit_price
        total += line_amount
        next_items.append(
            OrderItem(
                order_id=order.id,
                product_id=item.product_id,
                product_name_snapshot=product.product_name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_amount=line_amount,
            )
        )

    if payload.live_id is not None:
        live_session = db.get(LiveSession, payload.live_id)
        if not live_session:
            raise HTTPException(status_code=404, detail="live session not found")

    order.live_id = payload.live_id
    order.settlement_date = payload.settlement_date
    order.shipping_fee = payload.shipping_fee
    if payload.shipping_type not in SHIPPING_TYPES:
        raise HTTPException(status_code=400, detail="invalid shipping_type")
    if order.shipment:
        order.shipment.shipping_type = payload.shipping_type
    order.note = payload.note
    order.total_product_amount = total
    order.items.clear()
    db.flush()
    order.items.extend(next_items)

    after_values = {
        "live_id": order.live_id,
        "settlement_date": order.settlement_date,
        "shipping_fee": order.shipping_fee,
        "shipping_type": order.shipment.shipping_type if order.shipment else None,
        "note": order.note,
        "total_product_amount": order.total_product_amount,
        "items": " | ".join(
            f"{item.product_name_snapshot} x{item.quantity} @{item.unit_price}" for item in next_items
        ),
    }
    add_change_histories(db, "order", order.id, before_values, after_values)

    db.commit()

    updated = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .filter(Order.id == order.id)
        .first()
    )
    return updated


@app.get("/api/shipments/{order_id}", response_model=ShipmentRead)
def get_shipment(order_id: int, db: Session = Depends(get_db)):
    shipment = db.query(Shipment).filter(Shipment.order_id == order_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="shipment not found")
    return shipment


@app.patch("/api/shipments/{order_id}", response_model=ShipmentRead)
def update_shipment(order_id: int, payload: ShipmentUpdate, db: Session = Depends(get_db)):
    shipment = db.query(Shipment).filter(Shipment.order_id == order_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="shipment not found")

    if payload.payment_status and payload.payment_status not in PAYMENT_STATUS:
        raise HTTPException(status_code=400, detail="invalid payment_status")
    if payload.shipping_type and payload.shipping_type not in SHIPPING_TYPES:
        raise HTTPException(status_code=400, detail="invalid shipping_type")
    if payload.shipping_status and payload.shipping_status not in SHIPPING_STATUS:
        raise HTTPException(status_code=400, detail="invalid shipping_status")

    changes = payload.model_dump(exclude_unset=True)
    before = {key: getattr(shipment, key) for key in changes}

    for key, value in changes.items():
        setattr(shipment, key, value)

    add_change_histories(db, "shipment", shipment.id, before, changes)

    db.commit()
    db.refresh(shipment)
    return shipment
