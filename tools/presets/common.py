# Shared helpers for the preset generators (Shamble VFX dev scripts; the presets they write are committed as JSON).
import json
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

def word(id, name, words, **kw):
    l = {"id": id, "name": name, "type": "word", "start": kw.pop("start", {"ms": 0}), "timing": kw.pop("timing", STEPS),
         "at": kw.pop("at", T), "facing": "camera", "blend": "normal"}
    base = dict(words=words, letterPx=40, colours={"top": "white", "bottom": "glow", "back": "team.dark"}, tiltDeg=[4, 10], sizeJitter=0.08,
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
    return {"format": "shamble-vfx", "version": 3, "id": id, "name": name,
            "controls": {"size": 1, "intensity": 1, "duration": 1, "colour": colour},
            "phases": {"windupMs": phases[0], "peakMs": phases[1], "fadeMs": phases[2]}, "layers": layers}

def write(path, fx):
    json.dump(fx, open(path, "w"), indent=2)
    open(path, "a").write("\n")
    print(path, len(fx["layers"]), "layers")
