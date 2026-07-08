from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProductBase(BaseModel):
    barcode: str = Field(min_length=1)
    product_name: str
    wholesale_price_jpy: int = Field(default=0, ge=0)
    retail_price_krw: int = Field(default=0, ge=0)
    live_price: int = Field(ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(ProductBase):
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


class CustomerUpdate(CustomerBase):
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


class LiveSessionUpdate(LiveSessionCreate):
    pass


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(ge=1)
    unit_price: int = Field(ge=0)


class OrderCreate(BaseModel):
    customer_id: int
    live_id: Optional[int] = None
    settlement_date: Optional[date] = None
    shipping_fee: int = Field(default=0, ge=0)
    shipping_type: str = Field(default="direct")
    note: Optional[str] = None
    items: list[OrderItemCreate]


class OrderUpdate(BaseModel):
    settlement_date: date
    shipping_fee: int = Field(default=0, ge=0)
    shipping_type: str = Field(default="direct")
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
    shipping_type: str
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
    shipping_type: Optional[str] = None
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
    live_id: Optional[int] = None
    created_at: datetime
    settlement_date: date
    total_product_amount: int
    shipping_fee: int
    note: Optional[str] = None
    stock_released_at: Optional[datetime] = None
    items: list[OrderItemRead]
    shipment: ShipmentRead

    class Config:
        from_attributes = True


class ChangeHistoryRead(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    action: str
    field_name: str
    before_value: Optional[str] = None
    after_value: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryMovementCreate(BaseModel):
    product_id: int
    quantity: int = Field(ge=1)
    memo: Optional[str] = None


class InventoryInboundLineCreate(BaseModel):
    product_id: int
    quantity: int = Field(ge=1)


class InventoryInboundBulkCreate(BaseModel):
    items: list[InventoryInboundLineCreate]
    memo: Optional[str] = None


class InventoryMovementRead(BaseModel):
    id: int
    product_id: int
    order_id: Optional[int] = None
    movement_type: str
    quantity: int
    memo: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
