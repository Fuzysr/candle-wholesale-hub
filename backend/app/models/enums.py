from enum import StrEnum


class AppRole(StrEnum):
    admin = "admin"
    client = "client"


class OrderStatus(StrEnum):
    new = "new"
    processing = "processing"
    awaiting_payment = "awaiting_payment"
    payment_review = "payment_review"
    invoiced = "invoiced"
    paid = "paid"
    shipped = "shipped"
    completed = "completed"
    cancelled = "cancelled"


class StockMovementType(StrEnum):
    in_ = "in"          # приход
    out = "out"         # расход (отгрузка)
    reserve = "reserve" # резерв под заявку
    release = "release" # снятие резерва
    adjust = "adjust"   # корректировка
    sync = "sync"       # синхронизация с внешней СУ
