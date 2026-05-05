"""Centralised import of all ORM models.

Import this package (or any of its submodules) to make sure every table is
registered on `Base.metadata`. Alembic's `env.py` imports this module so
autogenerate sees the complete model graph.
"""
from app.models.base import Base
from app.models.catalog import (
    Category,
    Material,
    Product,
    ProductImage,
    ProductVariant,
    Scent,
    Shape,
    VolumeDiscount,
)
from app.models.company import CompanySettings
from app.models.enums import AppRole, OrderStatus, StockMovementType
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.password_reset import PasswordReset
from app.models.refresh_token import RefreshToken
from app.models.stock import DiscountTier, StockMovement
from app.models.user import User

__all__ = [
    "Base",
    "AppRole",
    "OrderStatus",
    "StockMovementType",
    "User",
    "Category",
    "Material",
    "Scent",
    "Shape",
    "Product",
    "ProductVariant",
    "ProductImage",
    "Order",
    "OrderItem",
    "OrderStatusHistory",
    "DiscountTier",
    "StockMovement",
    "VolumeDiscount",
    "CompanySettings",
    "PasswordReset",
    "RefreshToken",
]
