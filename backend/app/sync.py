"""Synchronisation : l'appareil pousse ses modifications (push) et récupère celles des autres (pull).

L'expédition est l'unité de synchronisation : elle voyage entière, avec ses conteneurs et ses lignes.
"""
import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import (AuditLog, Container, ContainerItem, Destination, Device, Document, ProcessedOperation, Product,
                     Shipment, SyncCounter, User, now)

EntityType = Literal["destination", "product", "shipment", "document"]
# Ordre d'application : une expédition référence sa destination et ses produits, un document son expédition.
ORDER = {"destination": 0, "product": 1, "shipment": 2, "document": 3}


class Camel(BaseModel):
    """Les données ont la forme des types TypeScript de l'application (camelCase). Les champs inconnus sont ignorés."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class DestinationIn(Camel):
    name: str = Field(min_length=1, max_length=120)
    country_code: str | None = Field(default=None, max_length=2)


class ProductIn(Camel):
    name: str = Field(min_length=1, max_length=200)
    designation: str = Field(min_length=1, max_length=300)
    package_weight_g: int = Field(gt=0)
    packages_per_carton: int = Field(gt=0)
    gross_weight_per_carton_g: int | None = Field(default=None, gt=0)
    weight_type: Literal["net", "gross"] = "net"
    unit_label: str = "pkts"
    is_active: bool = True


class ItemIn(Camel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    designation: str
    quantity_cartons: int = Field(ge=0, le=999_999)
    unit_weight_g: int = Field(gt=0)
    weight_type: Literal["net", "gross"]


class CustomDates(Camel):
    depot_date: date | None = None
    departure_date: date | None = None


class ContainerIn(Camel):
    id: uuid.UUID
    container_number: str = ""
    iso_type_code: str | None = None
    seal_number: str = ""
    custom_dates: CustomDates | None = None
    items: list[ItemIn] = []


class ShipmentIn(Camel):
    reference: str = ""
    destination_id: uuid.UUID | None = None
    depot_date: date | None = None
    departure_date: date | None = None
    status: Literal["draft", "completed", "archived"] = "draft"
    notes: str = ""
    containers: list[ContainerIn] = Field(min_length=1)


class DocumentIn(Camel):
    shipment_id: uuid.UUID
    container_id: uuid.UUID | None = None
    format: Literal["pdf", "xlsx"]
    version: int = Field(ge=1)
    data: dict[str, Any]
    generated_at: datetime


class Operation(Camel):
    idempotency_key: uuid.UUID
    entity_type: EntityType
    entity_id: uuid.UUID
    op: Literal["upsert", "delete"]
    base_version: int = 0
    data: dict[str, Any] | None = None


class PushRequest(Camel):
    device_id: uuid.UUID
    device_name: str = ""
    operations: list[Operation] = Field(max_length=500)


class Rejected(Exception):
    def __init__(self, *errors: str):
        self.errors = list(errors)


def next_seq(db: Session) -> int:
    counter = db.get(SyncCounter, 1, with_for_update=True)
    if counter is None:
        counter = SyncCounter(id=1, value=0)
        db.add(counter)
    counter.value += 1
    db.flush()
    return counter.value


def _iso(d: date | datetime | None) -> str | None:
    return d.isoformat() if d else None


def _sync_fields(row) -> dict:
    return {"version": row.version, "updatedAt": _iso(row.updated_at), "deletedAt": _iso(row.deleted_at)}


def serialize(entity_type: str, row) -> dict:
    if entity_type == "destination":
        return {"id": str(row.id), "name": row.name, "countryCode": row.country_code, **_sync_fields(row)}
    if entity_type == "product":
        return {
            "id": str(row.id), "name": row.name, "designation": row.designation, "packageWeightG": row.package_weight_g,
            "packagesPerCarton": row.packages_per_carton, "grossWeightPerCartonG": row.gross_weight_per_carton_g,
            "weightType": row.weight_type, "unitLabel": row.unit_label, "isActive": row.is_active, **_sync_fields(row),
        }
    if entity_type == "shipment":
        return {
            "id": str(row.id), "reference": row.reference, "destinationId": str(row.destination_id) if row.destination_id else None,
            "depotDate": _iso(row.depot_date), "departureDate": _iso(row.departure_date), "status": row.status, "notes": row.notes,
            "containers": [
                {
                    "id": str(c.id), "containerNumber": c.container_number, "isoTypeCode": c.iso_type_code, "sealNumber": c.seal_number,
                    "customDates": {"depotDate": _iso(c.custom_depot_date), "departureDate": _iso(c.custom_departure_date)} if c.use_custom_dates else None,
                    "items": [
                        {
                            "id": str(i.id), "productId": str(i.product_id), "productName": i.product_name_snapshot,
                            "designation": i.designation_snapshot, "quantityCartons": i.quantity_cartons,
                            "unitWeightG": i.unit_weight_g_snapshot, "weightType": i.weight_type_snapshot,
                        }
                        for i in c.items
                    ],
                }
                for c in row.containers
            ],
            **_sync_fields(row),
        }
    return {
        "id": str(row.id), "shipmentId": str(row.shipment_id), "containerId": str(row.container_id) if row.container_id else None,
        "format": row.format, "version": row.version, "data": row.snapshot, "generatedAt": _iso(row.generated_at),
    }


def _owned(db: Session, model, entity_id: uuid.UUID | None, company_id: uuid.UUID, what: str):
    """Une référence doit exister et appartenir à l'entreprise : l'identifiant envoyé par l'appareil n'est jamais cru sur parole."""
    row = db.get(model, entity_id) if entity_id else None
    if row is None or row.company_id != company_id:
        raise Rejected(f"{what} introuvable sur le serveur.")
    return row


def _fill_shipment(db: Session, row: Shipment, data: ShipmentIn, company_id: uuid.UUID) -> None:
    if data.destination_id:
        _owned(db, Destination, data.destination_id, company_id, "Destination")
    for c in data.containers:
        for i in c.items:
            _owned(db, Product, i.product_id, company_id, "Produit")
    row.reference, row.destination_id, row.status, row.notes = data.reference, data.destination_id, data.status, data.notes
    row.depot_date, row.departure_date = data.depot_date, data.departure_date
    # Les enfants sont remplacés en bloc ; on vide d'abord pour libérer leurs identifiants.
    row.containers.clear()
    db.flush()
    for pos, c in enumerate(data.containers):
        dates = c.custom_dates
        row.containers.append(Container(
            id=c.id, position=pos, container_number=c.container_number, iso_type_code=c.iso_type_code, seal_number=c.seal_number,
            use_custom_dates=dates is not None, custom_depot_date=dates.depot_date if dates else None,
            custom_departure_date=dates.departure_date if dates else None,
            items=[
                ContainerItem(
                    id=i.id, position=ipos, product_id=i.product_id, product_name_snapshot=i.product_name,
                    designation_snapshot=i.designation, quantity_cartons=i.quantity_cartons, unit_weight_g_snapshot=i.unit_weight_g,
                    weight_type_snapshot=i.weight_type,
                    # Le total est toujours recalculé ici : la valeur de l'appareil n'est pas reprise.
                    total_weight_g=i.quantity_cartons * i.unit_weight_g,
                )
                for ipos, i in enumerate(c.items)
            ],
        ))


def _apply_document(db: Session, user: User, op: Operation) -> dict:
    existing = db.get(Document, op.entity_id)
    if existing is not None:
        if existing.company_id != user.company_id:
            raise Rejected("Document introuvable sur le serveur.")
        return {"status": "accepted", "version": existing.version, "serverSeq": existing.server_seq}
    data = DocumentIn.model_validate(op.data or {})
    _owned(db, Shipment, data.shipment_id, user.company_id, "Expédition")
    doc = Document(id=op.entity_id, company_id=user.company_id, shipment_id=data.shipment_id, container_id=data.container_id,
                   format=data.format, version=data.version, snapshot=data.data, generated_at=data.generated_at, server_seq=next_seq(db))
    db.add(doc)
    return {"status": "accepted", "version": doc.version, "serverSeq": doc.server_seq}


MODELS = {"destination": (Destination, DestinationIn), "product": (Product, ProductIn), "shipment": (Shipment, ShipmentIn)}


def _apply(db: Session, user: User, device_id: uuid.UUID, op: Operation) -> dict:
    if op.entity_type == "document":
        return _apply_document(db, user, op)
    model, schema = MODELS[op.entity_type]
    row = db.get(model, op.entity_id)
    if row is not None and row.company_id != user.company_id:
        raise Rejected("Cet identifiant est déjà utilisé.")
    current = row.version if row else 0
    if op.base_version != current:
        # Quelqu'un d'autre a écrit entre-temps : on ne remplace rien, l'appareil reçoit la version du serveur.
        return {"status": "conflict", "version": current, "serverData": serialize(op.entity_type, row) if row else None}

    if op.op == "delete":
        if row is None:
            return {"status": "accepted", "version": 0, "serverSeq": 0}
        row.deleted_at = now()
    else:
        data = schema.model_validate(op.data or {})
        if row is None:
            row = model(id=op.entity_id, company_id=user.company_id, server_seq=0)
            db.add(row)
        if op.entity_type == "shipment":
            row.device_id = device_id
            _fill_shipment(db, row, data, user.company_id)
        else:
            for field, value in data.model_dump().items():
                setattr(row, field, value)
        row.deleted_at = None
    row.version, row.server_seq, row.updated_at = current + 1, next_seq(db), now()
    db.add(AuditLog(company_id=user.company_id, user_id=user.id, device_id=device_id, action=op.op,
                    entity_type=op.entity_type, entity_id=op.entity_id, details={"version": row.version}))
    db.flush()
    return {"status": "accepted", "version": row.version, "serverSeq": row.server_seq}


def push(db: Session, user: User, req: PushRequest) -> list[dict]:
    device = db.get(Device, req.device_id)
    if device is None:
        device = Device(id=req.device_id, user_id=user.id)
        db.add(device)
    elif device.user_id != user.id:
        raise Rejected("Cet appareil appartient à un autre compte.")
    device.name, device.last_seen_at = req.device_name or device.name or "", now()
    db.flush()

    results = []
    for op in sorted(req.operations, key=lambda o: ORDER[o.entity_type]):
        done = db.get(ProcessedOperation, op.idempotency_key)
        if done is not None and done.company_id == user.company_id:
            result = done.result  # déjà traitée : même réponse, aucune seconde écriture
        else:
            try:
                with db.begin_nested():
                    result = _apply(db, user, req.device_id, op)
                    if result["status"] == "accepted":
                        db.add(ProcessedOperation(idempotency_key=op.idempotency_key, company_id=user.company_id, device_id=req.device_id,
                                                  entity_type=op.entity_type, entity_id=op.entity_id, result=result))
            except Rejected as e:
                result = {"status": "rejected", "errors": e.errors}
            except ValidationError as e:
                result = {"status": "rejected", "errors": [f"{'.'.join(str(p) for p in err['loc'])} : {err['msg']}" for err in e.errors()]}
            except IntegrityError:
                result = {"status": "rejected", "errors": ["Cette donnée existe déjà sous un autre identifiant."]}
        results.append({"idempotencyKey": str(op.idempotency_key), "entityType": op.entity_type, "entityId": str(op.entity_id), **result})
    db.commit()
    return results


def pull(db: Session, company_id: uuid.UUID, cursor: int) -> dict:
    changes, last = [], cursor
    for entity_type, model in (("destination", Destination), ("product", Product), ("shipment", Shipment), ("document", Document)):
        rows = db.scalars(select(model).where(model.company_id == company_id, model.server_seq > cursor).order_by(model.server_seq))
        for row in rows:
            changes.append({"entityType": entity_type, "serverSeq": row.server_seq, "data": serialize(entity_type, row)})
            last = max(last, row.server_seq)
    return {"changes": changes, "cursor": last}
