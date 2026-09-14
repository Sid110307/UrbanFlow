import networkx as nx

DRAINS = [
    ("BLR-ORR-001", "Marathahalli Inlet", 12.9569, 77.6011),
    ("BLR-ORR-002", "Kadubeesanahalli Junction", 12.9412, 77.6947),
    ("BLR-ORR-003", "Bellandur Confluence", 12.9257, 77.6784),
    ("BLR-ORR-004", "Sarjapur Outfall", 12.9008, 77.6873),
    ("BLR-ORR-005", "Munnekollal Tributary", 12.9601, 77.6928),
    ("BLR-ORR-006", "Haralur Tributary", 12.9166, 77.6791),
    ("BLR-ORR-007", "Kariyammana Agrahara Inlet", 12.9351, 77.6873),
    ("BLR-ORR-008", "Bellandur Lake Bypass", 12.9298, 77.6839),
    ("BLR-ORR-009", "Doddanekundi Feeder", 12.9646, 77.6982),
    ("BLR-ORR-010", "Haralur Minor Feeder", 12.9105, 77.6755),
]

EDGES = [
    ("BLR-ORR-001", "BLR-ORR-002"),
    ("BLR-ORR-005", "BLR-ORR-002"),
    ("BLR-ORR-009", "BLR-ORR-005"),
    ("BLR-ORR-002", "BLR-ORR-003"),
    ("BLR-ORR-006", "BLR-ORR-003"),
    ("BLR-ORR-010", "BLR-ORR-006"),
    ("BLR-ORR-007", "BLR-ORR-008"),
    ("BLR-ORR-008", "BLR-ORR-004"),
    ("BLR-ORR-003", "BLR-ORR-004"),
]

graph = nx.DiGraph()
for drain_id, name, lat, lon in DRAINS:
    graph.add_node(drain_id, name=name, lat=lat, lon=lon)
graph.add_edges_from(EDGES)


def drain_seed():
    return DRAINS


def upstream_of(drain_id):
    return list(graph.predecessors(drain_id)) if drain_id in graph else []


def downstream_of(drain_id):
    return list(graph.successors(drain_id)) if drain_id in graph else []


def neighbors_of(drain_id):
    return upstream_of(drain_id) + downstream_of(drain_id)


def all_drain_ids():
    return [d[0] for d in DRAINS]
