from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
        nullable=False,
    )


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String(100), unique=True, index=True, nullable=False)
    product_name = Column(String(200), nullable=False)
    wholesale_price_jpy = Column(Integer, nullable=False, default=0)
    retail_price_krw = Column(Integer, nullable=False, default=0)
    live_price = Column(Integer, nullable=False)
    stock_quantity = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    instagram_id = Column(String(100), nullable=False, unique=True, index=True)
    customer_name = Column(String(100))
    phone_number = Column(String(30))
    address1 = Column(String(255))
    address2 = Column(String(255))
    is_active = Column(Boolean, nullable=False, default=True)


class LiveSession(Base, TimestampMixin):
    __tablename__ = "live_sessions"

    id = Column(Integer, primary_key=True, index=True)
    live_title = Column(String(200), nullable=False)
    live_started_at = Column(DateTime(timezone=True))
    live_ended_at = Column(DateTime(timezone=True))
    memo = Column(Text)


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    live_id = Column(Integer, ForeignKey("live_sessions.id"), nullable=True, index=True)
    order_code = Column(String(50), unique=True, index=True)
    settlement_date = Column(Date, nullable=False)
    total_product_amount = Column(Integer, nullable=False, default=0)
    shipping_fee = Column(Integer, nullable=False, default=0)
    note = Column(Text)
    stock_released_at = Column(DateTime(timezone=True))

    customer = relationship("Customer")
    live_session = relationship("LiveSession")
    items = relationship("OrderItem", back_populates="order", cascade="all,delete-orphan")
    shipment = relationship("Shipment", back_populates="order", uselist=False, cascade="all,delete-orphan")


class OrderItem(Base, TimestampMixin):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    product_name_snapshot = Column(String(200), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Integer, nullable=False)
    line_amount = Column(Integer, nullable=False)

    order = relationship("Order", back_populates="items")


class Shipment(Base, TimestampMixin):
    __tablename__ = "shipments"
    __table_args__ = (UniqueConstraint("order_id", name="uq_shipments_order_id"),)

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    payment_status = Column(String(30), nullable=False, default="pending")
    paid_at = Column(DateTime(timezone=True))
    paid_amount = Column(Integer)
    receiver_name = Column(String(100))
    receiver_phone = Column(String(30))
    shipping_address1 = Column(String(255))
    shipping_address2 = Column(String(255))
    courier_name = Column(String(100))
    tracking_number = Column(String(100))
    shipping_type = Column(String(30), nullable=False, default="direct")
    shipping_status = Column(String(30), nullable=False, default="ready")
    shipped_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    memo = Column(Text)

    order = relationship("Order", back_populates="shipment")


class ChangeHistory(Base):
    __tablename__ = "change_histories"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(Integer, nullable=False, index=True)
    action = Column(String(30), nullable=False)
    field_name = Column(String(100), nullable=False)
    before_value = Column(Text)
    after_value = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True)
    movement_type = Column(String(30), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    memo = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    product = relationship("Product")
    order = relationship("Order")
