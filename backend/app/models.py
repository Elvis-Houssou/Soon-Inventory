"""Tables PostgreSQL, voir docs/schema-donnees.md §2. Types portables : les tests tournent sur SQLite."""
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import JSON, BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

Json = JSON().with_variant(JSONB, "postgresql")


def now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map = {datetime: DateTime(timezone=True)}


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str]
    logo_path: Mapped[str | None]
    settings: Mapped[dict] = mapped_column(Json, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=now)
    updated_at: Mapped[datetime] = mapped_column(default=now, onupdate=now)


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"))
    email: Mapped[str] = mapped_column(unique=True)  # stocké en minuscules
    password_hash: Mapped[str]
    status: Mapped[str] = mapped_column(default="active")
    created_at: Mapped[datetime] = mapped_column(default=now)
    updated_at: Mapped[datetime] = mapped_column(default=now, onupdate=now)
    __table_args__ = (CheckConstraint("status in ('active','disabled')"),)


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)  # généré par l'appareil
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(default="")
    last_seen_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=now)


class SyncCounter(Base):
    """Compteur unique : chaque écriture acceptée reçoit le numéro suivant, dans l'ordre de validation.

    shortcut: une seule ligne pour toutes les entreprises, à découper par entreprise si les écritures deviennent concurrentes.
    """

    __tablename__ = "sync_counter"
    id: Mapped[int] = mapped_column(primary_key=True)
    value: Mapped[int] = mapped_column(BigInteger, default=0)


class SyncMixin:
    version: Mapped[int] = mapped_column(default=1)
    server_seq: Mapped[int] = mapped_column(BigInteger, index=True)
    created_at: Mapped[datetime] = mapped_column(default=now)
    updated_at: Mapped[datetime] = mapped_column(default=now)
    deleted_at: Mapped[datetime | None]


class Destination(SyncMixin, Base):
    __tablename__ = "destinations"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str]
    country_code: Mapped[str | None] = mapped_column(String(2))


class Product(SyncMixin, Base):
    __tablename__ = "products"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str]
    designation: Mapped[str]
    package_weight_g: Mapped[int]
    packages_per_carton: Mapped[int]
    gross_weight_per_carton_g: Mapped[int | None]
    weight_type: Mapped[str] = mapped_column(default="net")
    unit_label: Mapped[str] = mapped_column(default="pkts")
    is_active: Mapped[bool] = mapped_column(default=True)
    __table_args__ = (
        CheckConstraint("package_weight_g > 0 and packages_per_carton > 0"),
        CheckConstraint("weight_type in ('net','gross')"),
        CheckConstraint("weight_type = 'net' or gross_weight_per_carton_g is not null"),
    )


class Shipment(SyncMixin, Base):
    __tablename__ = "shipments"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"))
    reference: Mapped[str] = mapped_column(default="")
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("destinations.id"))
    depot_date: Mapped[date | None]
    departure_date: Mapped[date | None]
    status: Mapped[str] = mapped_column(default="draft")
    notes: Mapped[str] = mapped_column(default="")
    device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("devices.id"))
    containers: Mapped[list["Container"]] = relationship(order_by="Container.position", cascade="all, delete-orphan")
    __table_args__ = (
        CheckConstraint("status in ('draft','completed','archived')"),
        Index("ix_shipments_company_seq", "company_id", "server_seq"),
    )


class Container(Base):
    __tablename__ = "containers"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    shipment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), index=True)
    position: Mapped[int]
    container_number: Mapped[str] = mapped_column(default="")
    iso_type_code: Mapped[str | None]
    seal_number: Mapped[str] = mapped_column(default="")
    use_custom_dates: Mapped[bool] = mapped_column(default=False)
    custom_depot_date: Mapped[date | None]
    custom_departure_date: Mapped[date | None]
    items: Mapped[list["ContainerItem"]] = relationship(order_by="ContainerItem.position", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("shipment_id", "position"),)


class ContainerItem(Base):
    __tablename__ = "container_items"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    container_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("containers.id", ondelete="CASCADE"), index=True)
    position: Mapped[int]
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"))
    product_name_snapshot: Mapped[str]
    designation_snapshot: Mapped[str]
    quantity_cartons: Mapped[int]
    unit_weight_g_snapshot: Mapped[int]
    weight_type_snapshot: Mapped[str]
    total_weight_g: Mapped[int] = mapped_column(BigInteger)
    __table_args__ = (
        UniqueConstraint("container_id", "position"),
        UniqueConstraint("container_id", "product_id"),
        CheckConstraint("quantity_cartons >= 0 and unit_weight_g_snapshot > 0"),
        CheckConstraint("total_weight_g = quantity_cartons * unit_weight_g_snapshot"),
    )


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    shipment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shipments.id"), index=True)
    container_id: Mapped[uuid.UUID | None]  # pas de clé étrangère : le conteneur peut disparaître
    format: Mapped[str]
    version: Mapped[int]
    snapshot: Mapped[dict] = mapped_column(Json)
    generated_at: Mapped[datetime]
    server_seq: Mapped[int] = mapped_column(BigInteger, index=True)
    __table_args__ = (CheckConstraint("format in ('pdf','xlsx')"),)


class ProcessedOperation(Base):
    __tablename__ = "processed_operations"
    idempotency_key: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"))
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("devices.id"))
    entity_type: Mapped[str]
    entity_id: Mapped[uuid.UUID]
    result: Mapped[dict] = mapped_column(Json)
    processed_at: Mapped[datetime] = mapped_column(default=now)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[uuid.UUID]
    user_id: Mapped[uuid.UUID | None]
    device_id: Mapped[uuid.UUID | None]
    action: Mapped[str]
    entity_type: Mapped[str]
    entity_id: Mapped[uuid.UUID]
    details: Mapped[dict] = mapped_column(Json, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=now)


# Un nom ne sert qu'une fois par entreprise parmi les lignes non supprimées.
Index("uq_destinations_name", Destination.company_id, Destination.name, unique=True,
      postgresql_where=Destination.deleted_at.is_(None), sqlite_where=Destination.deleted_at.is_(None))
Index("uq_products_designation", Product.company_id, Product.designation, unique=True,
      postgresql_where=Product.deleted_at.is_(None), sqlite_where=Product.deleted_at.is_(None))
