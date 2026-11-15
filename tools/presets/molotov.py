# The drawing board's Molotov flame pit, rebuilt in format v2 with Shamble VFX's own fire generators.
# Phases 250 / 4000 / 800 ms: the bottle bursts, the pit burns, it cools.
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from common import *
W, P, F = 250, 4000, 800
PEAK = {"phase": "peak", "ms": 0}
R = 2.2
SA, UA = 0.578, 0.816          # how a ground offset shows on screen at the game camera: away x 0.578, up x 0.816
L = []
# ---- on the ground
splat_life = W + P + F - 75
L.append(shape("splat", "Burnt splat", "scorch",
    {"style": "splat", "radiusM": round(R * 1.03, 3), "role": "scorch.splat", "coreScale": 0, "coreRole": "scorch.splat", "lobes": 9, "growMs": 175},
    facing="ground", blend="multiply", start={"ms": 75}, untilPhaseEnd="fade", timing=SMOOTH,
    alpha={"life": [[0, 1], [round((W + P - 75) / splat_life, 4), 1], [1, 0.78]]}))
L.append(shape("light_dots", "Light on the ground", "dots",
    {"radiusM": R + 1.25, "innerM": round(0.7 * R, 3), "edgeM": 1.25, "stepPx": 15.5, "dotPx": 7.1, "role": "fire.light", "alpha": 1,
     "growFrom": 0, "growMs": W, "flickerM": 0.12, "squash": SA, "breakUp": {"lastMs": 600}},
    durationMs=W + P + 600))
# The edge faces the camera, squashed as if it lay on the ground, so it draws over the light dots in layer order.
L.append(shape("fire_ring", "Edge of the fire area", "ring",
    {"radiusM": R, "widthPx": 6.5, "inkPx": 11.25, "role": "team", "style": "auto-teeth", "teeth": 24, "teethM": 0.34,
     "growFrom": 0, "growMs": W, "dashAt": 0.4, "breakUp": {"phase": "fade"}, "squash": SA},
    durationMs=W + P + 640, timing=SMOOTH))
# ---- the fire: the bed, its detail, the tongues
bed = {"radiusM": R, "tones": ["heat.dark", "heat.1", "heat.2", "heat.3"], "lumps": 14, "detailRole": "heat.deep", "inkPx": 4.25, "edge": "auto",
       "boilSteps": 2, "growMs": W, "breakUp": {"phase": "fade"}}
L.append(shape("bed", "Bed", "bed", dict(bed, part="lumps"), untilPhaseEnd="fade"))
L.append(shape("bed_detail", "Bed detail: halftone and brush strokes", "bed", dict(bed, part="detail"), untilPhaseEnd="fade"))
flames = {"radiusM": R, "count": 22, "depth": "all", "tallM": [0.5, 3.0], "widthM": [0.16, 0.4], "lean": 0.15, "sway": 0.12, "cycleSteps": [5, 8],
          "tones": ["heat.1", "heat.2", "heat.3", "heat.4"], "shadeRole": "heat.dark", "inkPx": 4.25, "edge": "auto", "licks": True, "growMs": W,
          "breakUp": {"phase": "fade"}}
L.append(shape("flames", "Tongues", "flames", flames, untilPhaseEnd="fade"))
# Low draws seven tongues, as the board's low mode does.
L.append(shape("flames_low", "Tongues (Low: seven)", "flames", dict(flames, count=7), untilPhaseEnd="fade"))
# ---- the bottle bursts: spikes thrown out, a spiky star, thin lines
up = round(0.35 * UA, 3)
L.append(burst("spikes", "Spikes thrown out", untilPhaseEnd="windup", shiftM=[0, up], count=11, lifeMs=[W, W], speedMps=[18, 18], direction="out",
    startRadiusM=[0.5, 0.5], drag=20, sizeM=[0.3, 0.87], sizeOverLife=[[0, 0], [0.25, 0.75], [0.5, 1], [0.6, 1], [1, 0]], timing=SMOOTH,
    look={"kind": "spike", "role": "heat.1", "inkPx": 3.4, "edge": "enemy"}, seed=8))
L.append(shape("ignition_star", "Bursting star", "shards",
    {"radiusM": 1.0, "points": 10, "inner": 0.44, "jitter": 0.22, "squash": 0.8, "rotationDeg": 11, "tones": [{"role": "heat.3", "scale": 1}, {"role": "heat.4", "scale": 0.52}],
     "inkPx": 4.25, "edge": "auto", "whiteFirstStep": False, "boilDeg": 0, "double": False},
    untilPhaseEnd="windup", shiftM=[0, up], scale={"life": [[0, 0.3], [0.25, 0.83], [0.5, 1], [0.6, 1], [0.8, 0.7], [1, 0.4]]}))
L.append(shape("ignition_lines", "Burst lines", "lines",
    {"count": 12, "innerM": [1.5, 1.8], "lengthM": [0.4, 0.8], "widthPx": [2.35, 2.35], "role": "ink", "until": 0.7, "spread": 0.3},
    untilPhaseEnd="windup", shiftM=[0, up], timing=SMOOTH))
# ---- smoke leaving with the wind, sparks rising
L.append(shape("smoke", "Smoke billows", "smoke",
    {"style": "billow", "radiusM": 0.97, "role": "fire.smoke", "lightRole": "fire.smoke.light", "rimRole": "fire.smoke.line", "inkPx": 3.0,
     "grow": [0.18, 0.9, 0], "riseM": round(2.6 * UA, 3), "driftM": [1.35, 0], "loop": {"count": 3, "lifeMs": 1600}},
    start=PEAK, untilPhaseEnd="fade", shiftM=[0.45, round(0.3 * SA + 2.5 * UA, 3)]))
for (id, name, n, role, seed) in [("sparks", "Sparks", 6, "glow", 11), ("sparks_hot", "Sparks, white-hot", 3, "heat.4", 12)]:
    L.append(burst(id, name, start=PEAK, durationMs=P + 480, timing=SMOOTH, shiftM=[0, round(0.7 * UA, 3)], count=n, lifeMs=[640, 900],
        speedMps=[3.3, 4.7], direction="up", spreadDeg=12, areaM=[1.65, 0.55], sizeM=[0.05, 0.05], sizeOverLife=[[0, 1], [1, 0.45]],
        look={"kind": "diamond", "role": role, "inkPx": 0.75, "edge": "enemy"}, loop=True, seed=seed))
# ---- the word, at ignition only
L.append(word("word", "FWOOSH", ["FWOOSH"], durationMs=710, shiftM=[-2.5, round(0.2 * SA + 2.0 * UA, 3)], letterPx=47, tiltDeg=[9, 9], sizeJitter=0,
    ramp=0.2, pop={"scale": 1.15, "steps": 2}, scale={"steps": [0.62, 1]}, breakUp=None, distance={"curve": [[0, 1], [100, 1]], "minPx": 14}, seed=5))
del L[-1]["breakUp"]
fx = apply_tiers(effect("board_molotov", "Molotov flame pit (board)", (W, P, F), L),
                 low_drop=["bed_detail", "light_dots", "ignition_lines", "smoke", "sparks", "sparks_hot", "word"],
                 medium_drop=["bed_detail"],
                 only={"flames": ["medium", "high"], "flames_low": ["low"]})
write(sys.argv[1], fx)
