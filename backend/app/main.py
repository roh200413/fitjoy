from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .database import Base, engine, get_db
from .models import Customer, LiveSession, Order, OrderItem, Product, Shipment
from .schemas import (
    CustomerCreate,
    CustomerRead,
    LiveSessionCreate,
    LiveSessionRead,
    OrderCreate,
    OrderRead,
    ProductCreate,
    ProductRead,
    ShipmentRead,
    ShipmentUpdate,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="FITJOY API", version="0.1.0")

PAYMENT_STATUS = {"pending", "paid"}
SHIPPING_STATUS = {"ready", "shipped", "delivered"}


@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/products", response_model=ProductRead)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
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
        query = query.filter(Product.product_name.ilike(f"%{keyword}%"))
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
    return query.order_by(Product.id.desc()).all()


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


@app.post("/api/orders", response_model=OrderRead)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="items is required")

    customer = db.get(Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="customer not found")

    live_session = db.get(LiveSession, payload.live_id)
    if not live_session:
        raise HTTPException(status_code=404, detail="live session not found")

    order = Order(
        customer_id=payload.customer_id,
        live_id=payload.live_id,
        note=payload.note,
        order_code=f"ORD-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}",
        total_product_amount=0,
    )
    db.add(order)
    db.flush()

    total = 0
    for item in payload.items:
        product = db.get(Product, item.product_id)
        if not product:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"product {item.product_id} not found")

        line_amount = item.quantity * item.unit_price
        total += line_amount
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=item.product_id,
                product_name_snapshot=product.product_name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_amount=line_amount,
            )
        )

    order.total_product_amount = total
    db.add(Shipment(order_id=order.id, payment_status="pending", shipping_status="ready"))
    db.commit()

    created = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.shipment))
        .filter(Order.id == order.id)
        .first()
    )
    return created


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
    if payload.shipping_status and payload.shipping_status not in SHIPPING_STATUS:
        raise HTTPException(status_code=400, detail="invalid shipping_status")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(shipment, key, value)

    db.commit()
    db.refresh(shipment)
    return shipment
