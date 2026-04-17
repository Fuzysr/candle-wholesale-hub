from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CompanySettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    legal_name: str
    short_name: str
    inn: str
    kpp: str
    ogrn: str
    legal_address: str
    postal_address: str
    bank_name: str
    bank_bik: str
    bank_account: str
    corr_account: str
    director_name: str
    director_position: str
    phone: str
    email: str
    offer_text: str
    payment_terms: str
    delivery_terms: str
    signature_url: str | None
    stamp_url: str | None
    updated_at: datetime


class CompanySettingsUpdate(BaseModel):
    legal_name: str | None = None
    short_name: str | None = None
    inn: str | None = None
    kpp: str | None = None
    ogrn: str | None = None
    legal_address: str | None = None
    postal_address: str | None = None
    bank_name: str | None = None
    bank_bik: str | None = None
    bank_account: str | None = None
    corr_account: str | None = None
    director_name: str | None = None
    director_position: str | None = None
    phone: str | None = None
    email: str | None = None
    offer_text: str | None = None
    payment_terms: str | None = None
    delivery_terms: str | None = None
    signature_url: str | None = None
    stamp_url: str | None = None
