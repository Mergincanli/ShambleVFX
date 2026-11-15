# Writes examples/demo-project/effects/board_shell.vfx.json: the drawing board's tank shell, rebuilt in format v2.
import json, sys
STEPS = {"mode": "steps", "perSecond": 12}
SMOOTH = {"mode": "smooth"}
O = {"input": "origin", "offset": [0, 0, 0]}
T = {"input": "target", "offset": [0, 0, 0]}
DIST = [[0, 1], [2, 1], [5, 0.6], [8, 0.6], [11, 0]]
RR = 1.1  # the blast's radius, metres

def shape(id, name, kind, spec, **kw):
    l = {"id": id, "name": name, "type": "shape", "start": kw.pop("start", {"ms": 0}), "timing": kw.pop("timing", STEPS),
         "at": kw.pop("at", T), "facing": kw.pop("facing", "camera"), "blend": kw.pop("blend", "normal")}
    l.update(kw)
    l["shape"] = dict(kind=kind, **spec)
    l.setdefault("seed", 1)
    l.setdefault("perPlay", True)
    return l

layers = []
# ---- on the ground
layers.append(shape("shadow", "Shell's shadow", "scorch",
    {"style": "oval", "radiusM": 0.3 * RR, "role": "scorch.shadow", "coreScale": 0, "coreRole": "scorch.shadow", "lobes": 0, "growMs": 0},
    start={"ms": 67}, untilPhaseEnd="windup", timing=SMOOTH, facing="ground", blend="multiply", scale={"life": [[0, 0.12], [1, 1]]}))
layers.append(shape("scorch", "Scorch mark", "scorch",
    {"style": "oval", "radiusM": 1.02 * RR, "role": "scorch.1", "coreScale": 0.588, "coreRole": "scorch.2", "lobes": 0, "growMs": 0},
    start={"phase": "peak", "ms": 0}, untilPhaseEnd="fade", facing="ground", blend="multiply", shiftM=[0, -0.095]))
layers.append(shape("ring", "Ring on the ground", "ring",
    {"radiusM": 1.28 * RR, "widthPx": 4, "inkPx": 8, "role": "team", "style": "auto-zigzag", "teeth": 26, "teethM": 0.197, "growFrom": 0.55, "growMs": 72},
    start={"phase": "peak", "ms": 0}, durationMs=985, timing=SMOOTH, facing="ground", shiftM=[0, -0.095]))
layers.append(shape("dots", "Halftone glow", "dots",
    {"radiusM": 1.75 * RR, "innerM": 0, "edgeM": 0, "stepPx": 9.4, "dotPx": 4, "role": "heat.2", "alpha": 1, "growFrom": 0.55, "growMs": 72, "flickerM": 0},
    start={"phase": "peak", "ms": 0}, durationMs=985, timing=SMOOTH, shiftM=[0, 0.3]))
# ---- the gun fires
layers.append(shape("muzzle_dots", "Muzzle halftone", "dots",
    {"radiusM": 1.18, "innerM": 0, "edgeM": 0, "stepPx": 10, "dotPx": 3.7, "role": "heat.1", "alpha": 1, "growFrom": 1, "growMs": 0, "flickerM": 0},
    at=O, facing="path", durationMs=230, shiftM=[0.34, 0], scale={"steps": [1.15, 1, 0.7]}))
layers.append(shape("muzzle_blast", "Muzzle blast", "shards",
    {"radiusM": 0.62, "points": 9, "inner": 0.42, "jitter": 0.34, "squash": 1, "rotationDeg": 0,
     "tones": [{"role": "heat.dark", "scale": 1}, {"role": "heat.1", "scale": 0.74}, {"role": "heat.2", "scale": 0.42, "points": 7}],
     "inkPx": 3.9, "edge": "auto", "whiteFirstStep": False, "boilDeg": 2.9, "double": False},
    at=O, facing="path", durationMs=230, shiftM=[0.34, 0], scale={"steps": [1.15, 1, 0.7]}))
layers.append(shape("gun_smoke", "Gun smoke", "smoke",
    {"style": "puff", "radiusM": 0.34, "role": "gunsmoke", "rimRole": "ink", "inkPx": 2.5, "grow": [0.7, 1.33, 0], "riseM": 0.5, "driftM": [-0.09, 0]},
    at={"input": "origin", "offset": [0, 0, 0.5]}, start={"ms": 90}, durationMs=810, timing=SMOOTH))
layers.append({"id": "fire_word", "name": "Firing word", "type": "word", "start": {"ms": 0}, "timing": STEPS, "at": O, "facing": "camera", "blend": "normal",
    "durationMs": 620, "shiftM": [0.3, 1.05], "words": ["THOOM", "WHUMP", "BOOM"], "letterPx": 40,
    "colours": {"top": "white", "bottom": "glow", "back": "team.dark"}, "tiltDeg": [7, 7], "sizeJitter": 0, "ramp": 0.18, "bounce": 0.35,
    "turnDeg": 4, "slantDeg": 9, "pop": {"scale": 1.14, "steps": 2}, "breakUp": {"lastMs": 140}, "breakSteps": 0, "riseM": 0,
    "distance": {"curve": [[0, 1], [100, 1]], "minPx": 14}, "visibleTo": "everyone", "seed": 12, "perPlay": True})
# ---- the shell in the air
layers.append({"id": "shell", "name": "Shell", "type": "projectile", "start": {"ms": 0}, "timing": SMOOTH, "from": O, "to": T,
    "flight": {"mode": "phase", "phase": "windup"}, "arcM": 1.6, "stretch": 1, "spinDegPerS": 0})
layers.append(shape("trail", "Shell streak", "trail",
    {"length": 0.1, "widthPx": [4.5, 4.5], "role": "team", "head": {"role": "heat.3", "share": 0.4}, "inkPx": 1.75, "edge": "ink", "dashes": 5},
    at={"layer": "shell"}, start={"ms": 22}, timing=SMOOTH))
# ---- the shell lands
for (id, name, dx, dy, r, rise, role) in [("smoke_left", "Blast smoke, left", -0.55 * RR, 0.3 + 0.6 * RR, 0.4 * RR, 0.55 * RR, "smoke.light"),
                                         ("smoke_right", "Blast smoke, right", 0.62 * RR, 0.3 + 0.48 * RR, 0.4 * RR * 0.86, 0.44 * RR, "smoke.dark")]:
    layers.append(shape(id, name, "smoke",
        {"style": "puff", "radiusM": round(r, 4), "role": role, "rimRole": "ink", "inkPx": 2.9, "grow": [0.75, 1.452, 0], "riseM": round(rise, 4), "driftM": [0, 0]},
        start={"phase": "peak", "ms": 0}, untilPhaseEnd="fade", timing=SMOOTH, shiftM=[round(dx, 4), round(dy, 4)]))
layers.append(shape("speed_lines", "Speed lines", "lines",
    {"count": 9, "innerM": [1.12 * RR, 1.32 * RR], "lengthM": [0.3 * RR, 0.5 * RR], "widthPx": [2.55, 2.55], "role": "ink", "until": 0.5, "spread": 0.25},
    start={"phase": "peak", "ms": 0}, durationMs=1390, timing=SMOOTH, shiftM=[0, 0.3]))
layers.append(shape("burst", "Burst", "shards",
    {"radiusM": RR, "points": 11, "inner": 0.5, "jitter": 0.3, "squash": 0.86, "rotationDeg": 84.8,
     "tones": [{"role": "heat.1", "scale": 1, "vanishAt": 0.4}, {"role": "heat.2", "scale": 0.72, "vanishAt": 0.62},
               {"role": "heat.3", "scale": 0.47, "points": 9, "vanishAt": 0.82}, {"role": "heat.4", "scale": 0.25, "points": 8, "vanishAt": 0.94}],
     "inkPx": 4.2, "edge": "auto", "whiteFirstStep": True, "boilDeg": 2.3, "breakUp": {"phase": "fade"}, "double": False},
    start={"phase": "peak", "ms": 0}, untilPhaseEnd="fade", shiftM=[0, 0.3], scale={"steps": [1, 1.06]}))

def burst(id, name, **kw):
    l = {"id": id, "name": name, "type": "burst", "start": {"phase": "peak", "ms": 0}, "timing": SMOOTH, "at": T, "facing": "camera", "blend": "normal",
         "shiftM": [0, 0.3]}
    l.update(kw)
    return l
layers.append(burst("debris", "Debris", count=7, lifeMs=[1030, 1030], speedMps=[1.98, 3.56], direction="up", spreadDeg=110,
    startRadiusM=[0.55, 0.55], gravityMps2=1.04, drag=2.13, sizeM=[0.055, 0.094], sizeOverLife=[[0, 1], [1, 1]], spinDegPerS=[344, 344],
    look={"kind": "chip", "role": "debris", "inkPx": 1.6, "edge": "ink"}, loop=False, groundStop=False, seed=3, perPlay=True))
layers.append(burst("sparks", "Sparks", count=9, lifeMs=[940, 940], speedMps=[1.85, 3.16], direction="out", spreadDeg=180,
    startRadiusM=[0.66, 0.66], gravityMps2=0, drag=2.13, sizeM=[0.066, 0.099], sizeOverLife=[[0, 1], [0.521, 1], [1, 0.5]], spinDegPerS=[0, 0],
    look={"kind": "diamond", "role": "team", "inkPx": 1.95, "edge": "auto"}, loop=False, groundStop=False, seed=5, perPlay=True))
layers.append({"id": "word", "name": "Sound word", "type": "word", "start": {"phase": "peak", "ms": 0}, "timing": STEPS, "at": T, "facing": "camera",
    "blend": "normal", "untilPhaseEnd": "fade", "shiftM": [-0.06, 0.3 + 0.98 * RR], "words": sys.argv[2].split(",") if len(sys.argv) > 2 else ["KABOOM", "KRAKOOM", "BADOOM", "WHAM"],
    "letterPx": 52, "colours": {"top": "white", "bottom": "glow", "back": "team.dark"}, "tiltDeg": [5, 10], "sizeJitter": 0.08, "ramp": 0.25,
    "bounce": 0.35, "turnDeg": 4, "slantDeg": 9, "pop": {"scale": 1.15, "steps": 2}, "breakUp": {"phase": "fade"}, "breakSteps": 5,
    "riseM": round(0.25 * RR, 4), "distance": {"curve": DIST, "minPx": 14}, "visibleTo": "everyone", "seed": 4, "perPlay": True})

fx = {"format": "shamble-vfx", "version": 4, "id": "board_shell", "name": "Tank shell (board)",
      "controls": {"size": 1, "intensity": 1, "duration": 1, "colour": "heat.1"},
      "phases": {"windupMs": 560, "peakMs": 490, "fadeMs": 900}, "layers": layers}
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from common import apply_tiers, write
apply_tiers(fx, low_drop=["dots", "muzzle_dots", "gun_smoke", "smoke_left", "smoke_right", "debris", "sparks", "speed_lines"],
            medium_drop=["dots", "muzzle_dots"])
write(sys.argv[1], fx)
