import enum


class AppRole(str, enum.Enum):
    admin = "admin"
    client = "client"


class OrderStatus(str, enum.Enum):
    new = "new"
    processing = "processing"
    awaiting_payment = "awaiting_payment"
    payment_review = "payment_review"
    invoiced = "invoiced"
    paid = "paid"
    shipped = "shipped"
    completed = "completed"
    cancelled = "cancelled"


class StockMovementType(str, enum.Enum):
    in_ = "in"          # приход
    out = "out"         # расход (отгрузка)
    reserve = "reserve" # резерв под заявку
    release = "release" # снятие резерва
    adjust = "adjust"   # корректировка
    sync = "sync"       # синхронизация с внешней СУ
