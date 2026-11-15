# The drawing board's rifle shot, rebuilt in format v2: glint, flash, tracer, hit, ground light, smoke, dust, chips.
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from common import *
PEAK = {"phase": "peak", "ms": 0}
FADE = {"phase": "fade", "ms": 0}
L = []
L.append(shape("muzzle_light", "Light under the muzzle", "glow",
    {"radiusM": 1.25, "role": "heat.2", "alpha": 0.3, "soft": False, "grow": [1, 1], "flicker": 0},
    at=O, facing="ground", blend="screen", start=PEAK, untilPhaseEnd="peak", timing=SMOOTH, scale={"life": [[0, 1], [0.499, 1], [0.5, 0.8], [1, 0.8]]}))
L.append(shape("hit_light", "Light at the hit", "glow",
    {"radiusM": 0.7, "role": "heat.2", "alpha": 0.22, "soft": False, "grow": [1, 1], "flicker": 0},
    at={"input": "target", "offset": [0.43, 0, -0.39]}, facing="ground", blend="screen", start={"phase": "peak", "ms": 21}, untilPhaseEnd="peak", timing=SMOOTH))
L.append(shape("glint", "Glint", "shards",
    {"radiusM": 0.23, "points": 4, "inner": 0.3, "jitter": 0, "squash": 1, "rotationDeg": 0, "tones": [{"role": "heat.3", "scale": 1}, {"role": "heat.4", "scale": 0.55}],
     "inkPx": 0, "edge": "none", "whiteFirstStep": False, "boilDeg": 0, "double": False},
    at=O, facing="path", untilPhaseEnd="windup", timing=SMOOTH, scale={"life": [[0, 0.26], [1, 1]]}))
L.append(projectile("tracer_flight", "Tracer flight", frm={"input": "origin", "offset": [0, 0, 0.8]}, start=PEAK, flight={"mode": "time", "ms": 21.9}))
L.append(shape("tracer", "Tracer", "trail",
    {"length": 0.75, "widthPx": [2.9, 10.1], "role": "glow", "core": {"role": "white", "px": 4.6, "edge": "enemy"}, "inkPx": 3.1, "edge": "enemy",
     "breakUp": {"phase": "fade"}, "dashes": 5},
    at={"layer": "tracer_flight"}, start=PEAK, untilPhaseEnd="fade", timing=SMOOTH))
L.append(shape("flash", "Muzzle flash", "flash",
    {"lengthM": 0.95, "tones": [{"role": "heat.1", "scale": 1}, {"role": "heat.2", "scale": 0.72}, {"role": "heat.3", "scale": 0.46}, {"role": "heat.4", "scale": 0.24}],
     "inkPx": 3, "edge": "enemy", "alternate": {"scale": 0.82, "jitter": 0.08}},
    at=O, facing="path", start=PEAK, untilPhaseEnd="peak", timing=STEPS24))
L.append(burst("flash_sparks", "Sparks at the flash", at=O, facing="path", start=PEAK, untilPhaseEnd="peak", timing=STEPS24,
    count=4, lifeMs=[41.7, 41.7], speedMps=[0, 0], direction="path", spreadDeg=43, startRadiusM=[0.71, 1.19], sizeM=[0.03, 0.03],
    look={"kind": "spark", "role": "glow", "inkPx": 0, "edge": "none"}, loop=True, seed=2))
L.append(shape("hit", "Hit star", "shards",
    {"radiusM": 0.4, "points": 6, "inner": 0.22, "jitter": 0, "squash": 1, "rotationDeg": 22.9, "tones": [{"role": "glow", "scale": 1}, {"role": "heat.4", "scale": 0.5}],
     "inkPx": 1, "edge": "enemy", "whiteFirstStep": False, "boilDeg": 2.7, "double": False},
    start={"phase": "peak", "ms": 21.9}, untilPhaseEnd="peak", timing=SMOOTH, scale={"life": [[0, 0.5], [1, 1]]}))
L.append(shape("smoke", "Gun smoke", "smoke",
    {"style": "puff", "radiusM": 0.34, "role": "gunsmoke", "rimRole": "gunsmoke.rim", "inkPx": 2.35, "grow": [0.41, 1, 0], "riseM": 0.22, "driftM": [0.425, 0]},
    at=O, facing="path", shiftM=[0.285, 0], start=FADE, untilPhaseEnd="fade", timing=SMOOTH))
L.append(shape("dust", "Dust at the hit", "smoke",
    {"style": "puff", "radiusM": 0.36, "role": "dust", "rimRole": "dust.rim", "inkPx": 2.15, "grow": [0.33, 1, 0], "riseM": 0.3, "driftM": [0, 0]},
    shiftM=[-0.06, 0], start=FADE, untilPhaseEnd="fade", timing=SMOOTH))
L.append(burst("chips", "Stone chips", start=FADE, timing=STEPS, count=3, lifeMs=[153, 153], speedMps=[5.1, 10.3], direction="up", spreadDeg=30,
    startRadiusM=[0.125, 0.25], gravityMps2=30.9, drag=12.2, sizeM=[0.042, 0.042], spinDegPerS=[688, 688],
    look={"kind": "chip", "role": "stone", "inkPx": 1, "edge": "ink", "inkRole": "stone.rim"}, seed=3))
# Low, as the board's low mode: no smoke, no light on the ground, no dust, no stone chips, no sparks round the flash.
fx = apply_tiers(effect("board_muzzle", "Rifle shot (board)", (30, 70, 180), L),
                 low_drop=["muzzle_light", "hit_light", "smoke", "dust", "chips", "flash_sparks"])
write(sys.argv[1], fx)
