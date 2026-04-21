from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String(200), nullable=False)
    wholesale_price_jpy = Column(Integer, nullable=False, default=0)
    retail_price_krw = Column(Integer, nullable=False, default=0)
    live_price = Column(Integer, nullable=False)
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
    live_id = Column(Integer, ForeignKey("live_sessions.id"), nullable=False, index=True)
    order_code = Column(String(50), unique=True, index=True)
    total_product_amount = Column(Integer, nullable=False, default=0)
    note = Column(Text)

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
    shipping_status = Column(String(30), nullable=False, default="ready")
    shipped_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    memo = Column(Text)

    order = relationship("Order", back_populates="shipment")
