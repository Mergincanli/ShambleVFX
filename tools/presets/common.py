# Shared helpers for the preset generators (Shamble VFX dev scripts; the presets they write are committed as JSON).
import json
import os

# The effect format's version these presets write, and its JSON Schema (packages/vfx-format/schema, made from the checker's
# own schema): the order of the fields the editor writes comes from it.
FORMAT_VERSION = 6
SCHEMA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "packages", "vfx-format", "schema",
                           f"effect.v{FORMAT_VERSION}.schema.json")
STEPS = {"mode": "steps", "perSecond": 12}
STEPS24 = {"mode": "steps", "perSecond": 24}
SMOOTH = {"mode": "smooth"}
O = {"input": "origin", "offset": [0, 0, 0]}
T = {"input": "target", "offset": [0, 0, 0]}
DIST = [[0, 1], [2, 1], [5, 0.6], [8, 0.6], [11, 0]]

def shape(id, name, kind, spec, **kw):
    l = {"id": id, "name": name, "type": "shape", "start": kw.pop("start", {"ms": 0}), "timing": kw.pop("timing", STEPS),
         "at": kw.pop("at", T), "facing": kw.pop("facing", "camera"), "blend": kw.pop("blend", "normal")}
    l.update(kw)
    l["shape"] = dict(kind=kind, **spec)
    l.setdefault("seed", 1)
    l.setdefault("perPlay", True)
    return l

def burst(id, name, **kw):
    l = {"id": id, "name": name, "type": "burst", "start": kw.pop("start", {"ms": 0}), "timing": kw.pop("timing", STEPS),
         "at": kw.pop("at", T), "facing": kw.pop("facing", "camera"), "blend": kw.pop("blend", "normal")}
    base = dict(count=8, lifeMs=[500, 700], speedMps=[2, 4], direction="out", spreadDeg=180, startRadiusM=[0, 0], gravityMps2=0, drag=0,
                sizeM=[0.05, 0.08], sizeOverLife=[[0, 1], [1, 1]], spinDegPerS=[0, 0], loop=False, groundStop=False, seed=1, perPlay=True)
    base.update(kw)
    l.update(base)
    return l

def words_of(words):
    """A word layer's words (format 5): each a {"text": ...}, with a "chance" in % when one is given as a dict."""
    return [w if isinstance(w, dict) else {"text": w} for w in words]

def word(id, name, words, **kw):
    l = {"id": id, "name": name, "type": "word", "start": kw.pop("start", {"ms": 0}), "timing": kw.pop("timing", STEPS),
         "at": kw.pop("at", T), "facing": "camera", "blend": "normal"}
    base = dict(words=words_of(words), letterPx=40, colours={"top": "white", "bottom": "glow", "back": "team.dark"}, tiltDeg=[4, 10], sizeJitter=0.08,
                ramp=0.2, bounce=0.35, turnDeg=4, slantDeg=9, pop={"scale": 1.15, "steps": 2}, breakUp={"lastMs": 140}, breakSteps=0, riseM=0,
                distance={"curve": DIST, "minPx": 14}, visibleTo="everyone", seed=1, perPlay=True)
    base.update(kw)
    l.update(base)
    return l

def projectile(id, name, **kw):
    l = {"id": id, "name": name, "type": "projectile", "start": kw.pop("start", {"ms": 0}), "timing": kw.pop("timing", SMOOTH),
         "from": kw.pop("frm", O), "to": kw.pop("to", T), "flight": kw.pop("flight", {"mode": "speed", "mps": 40}), "arcM": 0, "stretch": 1, "spinDegPerS": 0}
    l.update(kw)
    return l

ALL = ["low", "medium", "high"]

def apply_tiers(fx, low_drop=(), medium_drop=(), only=None):
    """Quality tiers: every visible layer shows in all three, except those Low or Medium drop; `only` sets a layer's list."""
    only = only or {}
    for l in fx["layers"]:
        if l["type"] == "projectile":
            l.pop("tiers", None)
            continue
        t = list(only.get(l["id"], ALL))
        if l["id"] in low_drop and "low" in t: t.remove("low")
        if l["id"] in medium_drop and "medium" in t: t.remove("medium")
        l["tiers"] = t
    return fx

def effect(id, name, phases, layers, colour="heat.1"):
    return {"format": "shamble-vfx", "version": FORMAT_VERSION, "id": id, "name": name,
            "controls": {"size": 1, "intensity": 1, "duration": 1, "colour": colour},
            "phases": {"windupMs": phases[0], "peakMs": phases[1], "fadeMs": phases[2]}, "layers": layers}

def _whole(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, float) and "e" in repr(v):
        raise ValueError(f"{v!r} would be written in e-notation, which the editor writes differently: round it")
    if isinstance(v, dict):
        return {k: _whole(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_whole(x) for x in v]
    return v


def dumps(v):
    """The project's own JSON layout: the same bytes JSON.stringify(v, null, 2) and a newline give for the same value,
    fields in the order they come. For an effect, put its fields in the editor's order first (in_schema_order)."""
    return json.dumps(_whole(v), indent=2, ensure_ascii=False) + "\n"


_schema = None


def _fits(v, node):
    """Whether a value fits one form of a union in the JSON Schema: its type, its fixed fields ("const", such as a layer's
    "type") and the fields it must or may have."""
    for key in ("anyOf", "oneOf"):
        if key in node:
            return any(_fits(v, b) for b in node[key])
    t = node.get("type")
    if t == "object":
        if not isinstance(v, dict):
            return False
        props = node.get("properties", {})
        if any(k not in v for k in node.get("required", [])):
            return False
        if any(k in v and "const" in sub and v[k] != sub["const"] for k, sub in props.items()):
            return False
        return not (node.get("additionalProperties") is False and any(k not in props for k in v))
    if t == "array":
        return isinstance(v, list)
    if t == "string":
        return isinstance(v, str)
    if t in ("number", "integer"):
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    if t == "boolean":
        return isinstance(v, bool)
    if t == "null":
        return v is None
    return True


def in_schema_order(v, node=None):
    """An effect's fields in the order the editor writes them. The editor saves the checker's copy of an effect, whose
    fields follow the checker's schema; the JSON Schema file lists them in that order. Of a union (a layer's type, a
    shape's kind, a start ...) the first form the value fits is used, as the checker does. Fields the schema does not
    name stay last, in their own order (a list of game events, a curve's points)."""
    global _schema
    if node is None:
        if _schema is None:
            with open(SCHEMA_FILE, encoding="utf-8") as f:
                _schema = json.load(f)
        node = _schema
    for key in ("anyOf", "oneOf"):
        if key in node:
            fit = [b for b in node[key] if _fits(v, b)]
            return in_schema_order(v, fit[0]) if fit else v
    if isinstance(v, dict):
        props = node.get("properties", {})
        extra = node.get("additionalProperties")
        out = {k: in_schema_order(v[k], props[k]) for k in props if k in v}
        for k in v:
            if k not in props:
                out[k] = in_schema_order(v[k], extra) if isinstance(extra, dict) else v[k]
        return out
    if isinstance(v, list):
        if "prefixItems" in node:
            items = node["prefixItems"]
            return [in_schema_order(x, items[i]) if i < len(items) else x for i, x in enumerate(v)]
        if isinstance(node.get("items"), dict):
            return [in_schema_order(x, node["items"]) for x in v]
    return v


def write_json(path, v):
    with open(path, "w", encoding="utf-8") as f:
        f.write(dumps(v))


def write(path, fx):
    """An effect file, byte for byte as the editor's Save writes it: the editor's layout, its fields in the editor's order."""
    write_json(path, in_schema_order(fx))
    print(path, len(fx["layers"]), "layers")
