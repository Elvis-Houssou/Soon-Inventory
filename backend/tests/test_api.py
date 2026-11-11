import uuid

from sqlalchemy import select

from app.core.db import get_session
from app.main import app
from app.models import AuditLog, ContainerItem

API = "/api/v1"
DEVICE = str(uuid.uuid4())
REF = [("LONG BOBOLO 1 kg × 20 pkts", 1000, 20, 381), ("ROUND BOBOLO 1 kg × 20 pkts", 1000, 20, 104), ("PONDU 1 kg × 15 pkts", 1000, 15, 590),
       ("PONDU 500 g × 30 pkts", 500, 30, 42), ("SOUR SOUR LEAF 1 kg × 15 pkts", 1000, 15, 143), ("PONDU CAOUTCHOUC 1 kg × 15 pkts", 1000, 15, 153)]


def op(entity_type, entity_id, data=None, base_version=0, kind="upsert", key=None):
    return {"idempotencyKey": key or str(uuid.uuid4()), "entityType": entity_type, "entityId": entity_id, "op": kind,
            "baseVersion": base_version, "data": data}


def push(client, *operations, device=DEVICE):
    r = client.post(f"{API}/sync/push", json={"deviceId": device, "deviceName": "test", "operations": list(operations)})
    assert r.status_code == 200, r.text
    return r.json()["results"]


def reference_ops():
    """La fiche de référence du client : une destination, six produits, une expédition d'un conteneur."""
    dest, ship = str(uuid.uuid4()), str(uuid.uuid4())
    products = [(str(uuid.uuid4()), *p) for p in REF]
    ops = [op("destination", dest, {"name": "UK"})]
    ops += [op("product", pid, {"name": d.split(" 1 kg")[0], "designation": d, "packageWeightG": g, "packagesPerCarton": per})
            for pid, d, g, per, _ in products]
    shipment = {
        "destinationId": dest, "depotDate": "2026-03-26", "departureDate": "2026-04-13", "status": "completed",
        "containers": [{
            "id": str(uuid.uuid4()), "containerNumber": "HLBU 995319 0", "sealNumber": "HLC 3784425",
            "items": [{"id": str(uuid.uuid4()), "productId": pid, "productName": d, "designation": d, "quantityCartons": q,
                       "unitWeightG": g * per, "weightType": "net"} for pid, d, g, per, q in products],
        }],
    }
    return ship, shipment, ops + [op("shipment", ship, shipment)]


def db_rows(model):
    with next(app.dependency_overrides[get_session]()) as s:
        return list(s.scalars(select(model)))


def test_comptes(make_client):
    c = make_client("a@example.com")
    assert c.get(f"{API}/auth/me").json()["email"] == "a@example.com"
    assert "httponly" in c.post(f"{API}/auth/login", json={"email": "A@example.com", "password": "motdepasse1"}).headers["set-cookie"].lower()
    anonymous = make_client()
    assert anonymous.get(f"{API}/auth/me").status_code == 401
    assert anonymous.post(f"{API}/sync/push", json={"deviceId": DEVICE, "operations": []}).status_code == 401
    assert anonymous.get(f"{API}/sync/pull").status_code == 401
    assert anonymous.post(f"{API}/auth/login", json={"email": "a@example.com", "password": "mauvais-mot"}).status_code == 401
    assert anonymous.post(f"{API}/auth/register", json={"email": "a@example.com", "password": "motdepasse1", "company_name": "x"}).status_code == 409
    assert anonymous.post(f"{API}/auth/register", json={"email": "b@example.com", "password": "court", "company_name": "x"}).status_code == 422


def test_fiche_de_reference_et_recalcul_serveur(make_client):
    c = make_client("a@example.com")
    ship, _, ops = reference_ops()
    # Envoyées dans le désordre (l'expédition d'abord) : le serveur applique destinations et produits avant.
    results = push(c, *reversed(ops))
    assert [r["status"] for r in results] == ["accepted"] * 8
    items = db_rows(ContainerItem)
    assert sum(i.quantity_cartons for i in items) == 1413
    assert sum(i.total_weight_g for i in items) == 23_620_000
    assert len(db_rows(AuditLog)) == 8

    pulled = c.get(f"{API}/sync/pull").json()
    assert pulled["cursor"] == 8
    got = next(x["data"] for x in pulled["changes"] if x["entityType"] == "shipment")
    assert got["id"] == ship and got["version"] == 1 and got["depotDate"] == "2026-03-26"
    assert [i["quantityCartons"] for i in got["containers"][0]["items"]] == [381, 104, 590, 42, 143, 153]
    assert got["containers"][0]["customDates"] is None
    # Curseur : rien de neuf après le dernier numéro reçu.
    assert c.get(f"{API}/sync/pull", params={"cursor": 8}).json()["changes"] == []


def test_idempotence(make_client):
    c = make_client("a@example.com")
    dest = str(uuid.uuid4())
    same = op("destination", dest, {"name": "UK"})
    first, again = push(c, same)[0], push(c, same)[0]
    assert first == again and first["version"] == 1
    assert c.get(f"{API}/sync/pull").json()["cursor"] == 1


def test_conflit_entre_deux_appareils(make_client):
    c = make_client("a@example.com")
    ship, shipment, ops = reference_ops()
    push(c, *ops)
    assert push(c, op("shipment", ship, {**shipment, "notes": "depuis le téléphone"}, base_version=1))[0]["version"] == 2
    # L'ordinateur n'a pas vu la version 2 : sa modification est refusée, rien n'est écrasé.
    stale = push(c, op("shipment", ship, {**shipment, "notes": "depuis l'ordinateur"}, base_version=1), device=str(uuid.uuid4()))[0]
    assert stale["status"] == "conflict" and stale["version"] == 2
    assert stale["serverData"]["notes"] == "depuis le téléphone"
    # Après avoir choisi sa version, l'ordinateur renvoie sur la base de la version 2.
    assert push(c, op("shipment", ship, {**shipment, "notes": "résolu"}, base_version=2))[0]["version"] == 3


def test_suppression(make_client):
    c = make_client("a@example.com")
    ship, _, ops = reference_ops()
    push(c, *ops)
    assert push(c, op("shipment", ship, kind="delete", base_version=1))[0]["version"] == 2
    got = next(x["data"] for x in c.get(f"{API}/sync/pull", params={"cursor": 8}).json()["changes"])
    assert got["id"] == ship and got["deletedAt"]


def test_isolation_entre_entreprises(make_client):
    a, b = make_client("a@example.com"), make_client("b@example.com")
    ship, shipment, ops = reference_ops()
    push(a, *ops)
    assert b.get(f"{API}/sync/pull").json() == {"changes": [], "cursor": 0}
    other_device = str(uuid.uuid4())
    # B ne peut ni écraser l'expédition de A, ni la supprimer, ni référencer ses produits.
    assert push(b, op("shipment", ship, shipment, base_version=1), device=other_device)[0]["status"] == "rejected"
    assert push(b, op("shipment", ship, kind="delete", base_version=1), device=other_device)[0]["status"] == "rejected"
    assert push(b, op("shipment", str(uuid.uuid4()), shipment), device=other_device)[0]["status"] == "rejected"
    assert push(b, op("document", str(uuid.uuid4()), {"shipmentId": ship, "format": "pdf", "version": 1, "data": {}, "generatedAt": "2026-11-11T10:00:00Z"}),
                device=other_device)[0]["status"] == "rejected"
    # Un appareil enregistré par A ne peut pas servir à B.
    assert b.post(f"{API}/sync/push", json={"deviceId": DEVICE, "operations": []}).status_code == 403
    assert next(x for x in a.get(f"{API}/sync/pull").json()["changes"] if x["entityType"] == "shipment")["data"]["version"] == 1


def test_donnees_invalides_et_doublons(make_client):
    c = make_client("a@example.com")
    bad = push(c, op("product", str(uuid.uuid4()), {"name": "X", "designation": "X", "packageWeightG": 0, "packagesPerCarton": 15}))[0]
    assert bad["status"] == "rejected" and "packageWeightG" in bad["errors"][0]
    assert push(c, op("destination", str(uuid.uuid4()), {"name": "UK"}))[0]["status"] == "accepted"
    assert push(c, op("destination", str(uuid.uuid4()), {"name": "UK"}))[0]["status"] == "rejected"
    # Une opération refusée n'empêche pas les suivantes du même envoi.
    results = push(c, op("destination", str(uuid.uuid4()), {"name": "UK"}), op("destination", str(uuid.uuid4()), {"name": "France"}))
    assert [r["status"] for r in results] == ["rejected", "accepted"]


def test_document(make_client):
    c = make_client("a@example.com")
    ship, _, ops = reference_ops()
    push(c, *ops)
    doc_id = str(uuid.uuid4())
    doc = {"shipmentId": ship, "containerId": None, "format": "pdf", "version": 1, "data": {"sheets": []}, "generatedAt": "2026-11-11T10:00:00Z"}
    assert push(c, op("document", doc_id, doc))[0]["status"] == "accepted"
    assert push(c, op("document", doc_id, doc))[0]["status"] == "accepted"  # renvoyé deux fois, une seule ligne
    docs = [x for x in c.get(f"{API}/sync/pull").json()["changes"] if x["entityType"] == "document"]
    assert len(docs) == 1 and docs[0]["data"]["data"] == {"sheets": []}


def test_limite_des_essais_de_connexion(make_client):
    make_client("a@example.com")
    make_client("b@example.com")
    c = make_client()
    wrong = {"email": "a@example.com", "password": "mauvais-mot"}
    assert [c.post(f"{API}/auth/login", json=wrong).status_code for _ in range(5)] == [401] * 5
    # Au sixième essai, même le bon mot de passe est refusé : la porte reste fermée 15 minutes.
    assert c.post(f"{API}/auth/login", json={"email": "a@example.com", "password": "motdepasse1"}).status_code == 429
    # Les autres comptes ne sont pas touchés.
    assert c.post(f"{API}/auth/login", json={"email": "b@example.com", "password": "motdepasse1"}).status_code == 200
