from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProductBase(BaseModel):
    product_name: str
    wholesale_price_jpy: int = Field(default=0, ge=0)
    retail_price_krw: int = Field(default=0, ge=0)
    live_price: int = Field(ge=0)
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductRead(ProductBase):
    id: int

    class Config:
        from_attributes = True


class CustomerBase(BaseModel):
    instagram_id: str
    customer_name: Optional[str] = None
    phone_number: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    is_active: bool = True


class CustomerCreate(CustomerBase):
    pass


class CustomerRead(CustomerBase):
    id: int

    class Config:
        from_attributes = True


class LiveSessionCreate(BaseModel):
    live_title: str
    live_started_at: Optional[datetime] = None
    live_ended_at: Optional[datetime] = None
    memo: Optional[str] = None


class LiveSessionRead(LiveSessionCreate):
    id: int

    class Config:
        from_attributes = True


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(ge=1)
    unit_price: int = Field(ge=0)


class OrderCreate(BaseModel):
    customer_id: int
    live_id: int
    note: Optional[str] = None
    items: list[OrderItemCreate]


class OrderItemRead(BaseModel):
    id: int
    product_id: int
    product_name_snapshot: str
    quantity: int
    unit_price: int
    line_amount: int

    class Config:
        from_attributes = True


class ShipmentRead(BaseModel):
    payment_status: str
    paid_at: Optional[datetime] = None
    paid_amount: Optional[int] = None
    receiver_name: Optional[str] = None
    receiver_phone: Optional[str] = None
    shipping_address1: Optional[str] = None
    shipping_address2: Optional[str] = None
    courier_name: Optional[str] = None
    tracking_number: Optional[str] = None
    shipping_status: str
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    memo: Optional[str] = None

    class Config:
        from_attributes = True


class ShipmentUpdate(BaseModel):
    payment_status: Optional[str] = None
    paid_at: Optional[datetime] = None
    paid_amount: Optional[int] = Field(default=None, ge=0)
    receiver_name: Optional[str] = None
    receiver_phone: Optional[str] = None
    shipping_address1: Optional[str] = None
    shipping_address2: Optional[str] = None
    courier_name: Optional[str] = None
    tracking_number: Optional[str] = None
    shipping_status: Optional[str] = None
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    memo: Optional[str] = None


class OrderRead(BaseModel):
    id: int
    order_code: str
    customer_id: int
    live_id: int
    total_product_amount: int
    note: Optional[str] = None
    items: list[OrderItemRead]
    shipment: ShipmentRead

    class Config:
        from_attributes = True
