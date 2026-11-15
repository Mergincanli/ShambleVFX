# The comic hits collection: four sets of hit effects after the moves in Mustafa's hit references (2026-11-15),
# built in Shamble VFX's own shapes, letters and colour roles. Fire is never red; team colour only on the small parts
# and rings; smoke, dust and debris in natural colours; sound words only.
#   python3 tools/presets/hits.py examples/hits-collection
import json, sys, os
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from common import *
outdir = sys.argv[1]
PEAK = {"phase": "peak", "ms": 0}
FADE = {"phase": "fade", "ms": 0}
GUNWORD = {"top": "gunword.top", "bottom": "gunword.bottom", "back": "gunword.back"}
WORD = {"top": "white", "bottom": "glow", "back": "team.dark"}
made = []

def save(fx, scene):
    write(os.path.join(outdir, "effects", fx["id"] + ".vfx.json"), fx)
    made.append((fx["id"], scene))

def star(id, name, r, pts, inner, jit, tones, ink, **kw):
    spec = {"radiusM": r, "points": pts, "inner": inner, "jitter": jit, "squash": kw.pop("squash", 1), "rotationDeg": kw.pop("rot", 0), "tones": tones,
            "inkPx": ink, "edge": kw.pop("edge", "auto"), "whiteFirstStep": kw.pop("white", False), "boilDeg": kw.pop("boil", 2.3),
            "double": kw.pop("double", False)}
    for k in ("breakUp", "halftone"):
        if k in kw: spec[k] = kw.pop(k)
    return shape(id, name, "shards", spec, **kw)

def T4(*roles_scales):
    return [{"role": r, "scale": s, **({"vanishAt": v} if v is not None else {})} for (r, s, v) in roles_scales]

# ================================================================ set 1: small arms (bullets)
# Small and quick; their words are small and only the shooter sees them (the study's gun words).
L = [
    star("star", "Spark star", 0.3, 6, 0.24, 0.12, T4(("heat.3", 1, None), ("heat.4", 0.5, None)), 1.6, white=True, boil=8,
         untilPhaseEnd="peak", timing=STEPS24, scale={"steps": [1.25, 1, 0.8]}),
    shape("lines", "Hit lines", "lines", {"count": 7, "innerM": [0.32, 0.42], "lengthM": [0.16, 0.3], "widthPx": [1.6, 2.2], "role": "ink", "until": 0.7, "spread": 0.4},
          untilPhaseEnd="peak", timing=SMOOTH),
    burst("needles", "Spark needles", count=6, lifeMs=[150, 220], speedMps=[7, 11], direction="out", drag=6, gravityMps2=3, sizeM=[0.03, 0.045],
          sizeOverLife=[[0, 1], [1, 0.4]], look={"kind": "spark", "role": "glow", "inkPx": 1.2, "edge": "enemy"}, timing=SMOOTH, seed=2),
    word("word", "Gun word", ["PANG", "TING", "PING"], start={"ms": 0}, untilPhaseEnd="fade", shiftM=[0.25, 0.42], letterPx=18, colours=GUNWORD,
         tiltDeg=[6, 12], visibleTo="shooter", breakUp={"lastMs": 90}, seed=3),
]
save(effect("hit_bullet_spark", "Bullet hit: spark (metal)", (0, 80, 160), L), "hit-unit")

L = [
    star("flash", "Small flash", 0.2, 5, 0.4, 0.25, T4(("heat.2", 1, None), ("heat.4", 0.45, None)), 1.4, durationMs=84, timing=STEPS24),
    shape("dust", "Dust puff", "smoke", {"style": "puff", "radiusM": 0.3, "role": "dust", "rimRole": "dust.rim", "inkPx": 1.8, "grow": [0.45, 1.1, 0],
          "riseM": 0.28, "driftM": [0.05, 0]}, durationMs=420, timing=SMOOTH),
    burst("chips", "Stone chips", count=5, lifeMs=[260, 360], speedMps=[3, 6], direction="up", spreadDeg=70, gravityMps2=14, drag=1.5, sizeM=[0.03, 0.05],
          spinDegPerS=[400, 900], look={"kind": "chip", "role": "stone", "inkPx": 1, "edge": "ink", "inkRole": "stone.rim"}, seed=4),
    burst("specks", "Grit", count=7, lifeMs=[200, 320], speedMps=[2.5, 5], direction="out", gravityMps2=9, drag=2, sizeM=[0.015, 0.025],
          look={"kind": "speck", "role": "debris", "inkPx": 0, "edge": "none"}, seed=5, timing=SMOOTH),
    word("word", "Gun word", ["THUD", "POK", "TAK"], untilPhaseEnd="fade", shiftM=[0.22, 0.45], letterPx=17, colours=GUNWORD, tiltDeg=[-10, -4],
         visibleTo="shooter", breakUp={"lastMs": 90}, seed=6),
]
save(effect("hit_bullet_dust", "Bullet hit: dust (stone, ground)", (0, 60, 360), L), "hit-ground")

L = [
    star("glance", "Glancing star", 0.26, 4, 0.2, 0, T4(("heat.3", 1, None), ("heat.4", 0.5, None)), 1.4, facing="path", rot=20, boil=10,
         untilPhaseEnd="peak", timing=STEPS24),
    burst("sparks", "Sparks bouncing off", facing="path", count=7, lifeMs=[180, 300], speedMps=[8, 13], direction="path", spreadDeg=38, drag=3,
          gravityMps2=6, sizeM=[0.025, 0.04], sizeOverLife=[[0, 1], [1, 0.5]], timing=SMOOTH,
          streak={"role": "heat.4", "lengthM": 0.55, "widthPx": 2.2}, look={"kind": "spark", "role": "glow", "inkPx": 1, "edge": "enemy"}, seed=7),
    word("word", "Gun word", ["ZING", "PEOW"[0:0] or "ZING", "TSING"[1:] if False else "ZING"], untilPhaseEnd="fade", shiftM=[0.3, 0.38], letterPx=17,
         colours=GUNWORD, tiltDeg=[8, 14], visibleTo="shooter", breakUp={"lastMs": 90}, seed=8),
]
L[-1]["words"] = ["ZING", "PING"]
save(effect("hit_bullet_ricochet", "Bullet hit: ricochet", (0, 70, 230), L), "hit-unit")

# ================================================================ set 2: impact bursts (grenades, heavy guns on units)
L = [
    shape("dots", "Halftone field", "dots", {"radiusM": 1.75, "innerM": 0, "edgeM": 0, "stepPx": 9, "dotPx": 3.8, "role": "heat.2", "alpha": 1,
          "growFrom": 0.5, "growMs": 90, "flickerM": 0.05, "breakUp": {"phase": "fade"}}, start=PEAK, untilPhaseEnd="fade", timing=SMOOTH),
    shape("lines", "Lines between the spikes", "lines", {"count": 12, "innerM": [0.55, 0.85], "lengthM": [0.45, 0.8], "widthPx": [1.6, 3], "role": "ink",
          "until": 0.55, "spread": 0.35}, start=PEAK, untilPhaseEnd="fade", timing=SMOOTH),
    star("burst", "Layered star", 1.0, 12, 0.48, 0.32, T4(("heat.dark", 1, 0.45), ("heat.1", 0.78, 0.65), ("heat.3", 0.5, 0.85), ("heat.4", 0.26, 0.95)), 4.2,
         white=True, start=PEAK, untilPhaseEnd="fade", breakUp={"phase": "fade"}, scale={"steps": [1, 1.12, 1.04]},
         halftone={"role": "heat.1", "stepPx": 7.5, "dotPx": 3.2, "towardDeg": 40}),
    burst("shards_dark", "Shards, dark", start=PEAK, count=5, lifeMs=[480, 640], speedMps=[4, 7], direction="out", drag=2.5, gravityMps2=5, startRadiusM=[0.4, 0.6],
          sizeM=[0.07, 0.11], spinDegPerS=[300, 800], look={"kind": "shard", "role": "heat.dark", "inkPx": 1.6, "edge": "ink"}, seed=11, timing=SMOOTH),
    burst("shards_light", "Shards, light", start=PEAK, count=5, lifeMs=[420, 600], speedMps=[4.5, 7.5], direction="out", drag=2.5, gravityMps2=5, startRadiusM=[0.4, 0.6],
          sizeM=[0.06, 0.1], spinDegPerS=[300, 900], look={"kind": "shard", "role": "heat.2", "inkPx": 1.6, "edge": "ink"}, seed=12, timing=SMOOTH),
    burst("stars", "Small stars", start=PEAK, count=6, lifeMs=[500, 700], speedMps=[3, 5], direction="out", drag=2, startRadiusM=[0.7, 0.9], sizeM=[0.05, 0.07],
          sizeOverLife=[[0, 1], [1, 0.4]], look={"kind": "diamond", "role": "glow", "inkPx": 1.5, "edge": "auto"}, seed=13, timing=SMOOTH),
    word("word", "Sound word", ["POW", "BAM", "WHAM"], start=PEAK, untilPhaseEnd="fade", shiftM=[-0.05, 0.62], letterPx=34, colours=WORD, separation="heat.3",
         tiltDeg=[-12, -5], ramp=0.18, breakUp={"phase": "fade"}, breakSteps=4, riseM=0.15, seed=14),
]
save(effect("hit_burst_star", "Impact: layered star", (0, 260, 520), L), "hit-unit")

L = [
    shape("ticks", "Motion ticks", "lines", {"count": 14, "innerM": [1.08, 1.22], "lengthM": [0.14, 0.28], "widthPx": [2, 2.6], "role": "ink", "until": 0.6, "spread": 0.3},
          start=PEAK, untilPhaseEnd="fade", timing=SMOOTH),
    shape("cloud", "Cloud blast", "cloud", {"radiusM": 1.0, "squash": 0.86, "lobes": 11, "lobeDepth": 0.2,
          "tones": T4(("heat.dark", 1, 0.5), ("heat.1", 0.82, 0.7), ("heat.3", 0.58, 0.88), ("heat.4", 0.34, None)), "inkPx": 2.6, "edge": "auto", "boilDeg": 3,
          "breakUp": {"phase": "fade"}, "halftone": {"role": "heat.dark", "stepPx": 7, "dotPx": 3, "towardDeg": 225}},
          start=PEAK, untilPhaseEnd="fade", scale={"steps": [0.7, 1.08, 1.0]}),
    burst("puffs", "Puffs flying out", start=PEAK, count=4, lifeMs=[420, 560], speedMps=[5, 8], direction="out", drag=3, startRadiusM=[0.7, 0.8], sizeM=[0.13, 0.18],
          sizeOverLife=[[0, 1], [0.7, 0.8], [1, 0]], streak={"role": "white", "lengthM": 0.7, "widthPx": 5}, timing=SMOOTH,
          look={"kind": "puff", "role": "heat.2", "inkPx": 1.6, "edge": "ink"}, seed=21),
    burst("specks", "Debris specks", start=PEAK, count=16, lifeMs=[400, 650], speedMps=[3.5, 8], direction="out", drag=2, gravityMps2=6, startRadiusM=[0.5, 0.9],
          sizeM=[0.018, 0.03], look={"kind": "speck", "role": "ink", "inkPx": 0, "edge": "none"}, seed=22, timing=SMOOTH),
    word("word", "Sound word", ["BOOM", "BLAM", "DOOM"], start=PEAK, untilPhaseEnd="fade", shiftM=[0.05, 0.05], letterPx=36, colours=WORD, separation="heat.3",
         tiltDeg=[5, 11], ramp=0.22, breakUp={"phase": "fade"}, breakSteps=4, seed=23),
]
save(effect("hit_burst_cloud", "Impact: cloud blast", (0, 280, 560), L), "hit-unit")

L = [
    star("burst", "Jagged double burst", 1.05, 14, 0.62, 0.36, T4(("heat.1", 1, 0.55), ("heat.3", 0.62, 0.8), ("heat.4", 0.32, None)), 4, squash=0.74, double=True,
         start=PEAK, untilPhaseEnd="fade", breakUp={"phase": "fade"}, scale={"steps": [1.15, 1.05]},
         halftone={"role": "heat.dark", "stepPx": 8, "dotPx": 3.6, "towardDeg": 300}),
    shape("ticks", "Tick lines inside", "lines", {"count": 10, "innerM": [0.2, 0.32], "lengthM": [0.12, 0.22], "widthPx": [1.8, 2.4], "role": "ink", "until": 0.8, "spread": 0.6},
          start=PEAK, untilPhaseEnd="peak", timing=SMOOTH),
    burst("stars", "Small stars", start=PEAK, count=5, lifeMs=[420, 600], speedMps=[3.5, 6], direction="out", drag=2.2, startRadiusM=[0.8, 1.0], sizeM=[0.05, 0.075],
          sizeOverLife=[[0, 1], [1, 0.35]], look={"kind": "diamond", "role": "glow", "inkPx": 1.5, "edge": "auto"}, seed=31, timing=SMOOTH),
    burst("chips", "Chips", start=PEAK, count=6, lifeMs=[380, 520], speedMps=[4, 7], direction="up", spreadDeg=100, gravityMps2=10, drag=1.5, sizeM=[0.04, 0.07],
          spinDegPerS=[500, 1000], look={"kind": "chip", "role": "debris", "inkPx": 1.4, "edge": "ink"}, seed=32),
    word("word", "Sound word", ["KRAK", "KRUNCH", "SMASH"], start=PEAK, untilPhaseEnd="fade", shiftM=[0, 0.58], letterPx=32, colours=WORD, separation="heat.3",
         tiltDeg=[4, 10], ramp=-0.15, breakUp={"phase": "fade"}, breakSteps=4, seed=33),
]
save(effect("hit_burst_double", "Impact: jagged double burst", (0, 240, 480), L), "hit-unit")

# ================================================================ set 3: heavy explosions (vehicles, artillery)
L = [
    shape("scorch", "Scorch", "scorch", {"style": "splat", "radiusM": 1.9, "role": "scorch.1", "coreScale": 0.55, "coreRole": "scorch.2", "lobes": 8, "growMs": 120},
          facing="ground", blend="multiply", start=PEAK, untilPhaseEnd="fade", timing=SMOOTH),
    shape("shock", "Shock ring", "ring", {"radiusM": 2.6, "widthPx": 4.5, "inkPx": 9, "role": "team", "style": "auto-zigzag", "teeth": 30, "teethM": 0.3,
          "growFrom": 0.3, "growMs": 220}, facing="ground", start=PEAK, durationMs=520, timing=SMOOTH),
    shape("glow_dots", "Halftone glow", "dots", {"radiusM": 3.2, "innerM": 0, "edgeM": 0, "stepPx": 11, "dotPx": 4.6, "role": "heat.2", "alpha": 1,
          "growFrom": 0.5, "growMs": 140, "flickerM": 0.08, "breakUp": {"phase": "fade"}}, start=PEAK, untilPhaseEnd="fade", timing=SMOOTH, shiftM=[0, 0.7]),
    shape("speed_lines", "Speed lines", "lines", {"count": 30, "innerM": [2.0, 2.7], "lengthM": [0.6, 1.7], "widthPx": [2, 5.5], "role": "ink", "until": 0.5,
          "spread": 0.3}, start=PEAK, untilPhaseEnd="fade", timing=SMOOTH, shiftM=[0, 0.9]),
    shape("smoke_l", "Smoke, left", "smoke", {"style": "billow", "radiusM": 0.95, "role": "fire.smoke", "lightRole": "fire.smoke.light", "rimRole": "ink", "inkPx": 2.6,
          "grow": [0.4, 1.1, 0.2], "riseM": 1.2, "driftM": [-0.5, 0]}, start={"phase": "peak", "ms": 80}, untilPhaseEnd="fade", shiftM=[-1.3, 1.2]),
    shape("smoke_r", "Smoke, right", "smoke", {"style": "billow", "radiusM": 0.85, "role": "fire.smoke", "lightRole": "fire.smoke.light", "rimRole": "ink", "inkPx": 2.6,
          "grow": [0.4, 1.1, 0.2], "riseM": 1.4, "driftM": [0.4, 0]}, start={"phase": "peak", "ms": 120}, untilPhaseEnd="fade", shiftM=[1.35, 1.45]),
    shape("fire", "Fire round the core", "cloud", {"radiusM": 1.75, "squash": 0.9, "lobes": 14, "lobeDepth": 0.24,
          "tones": T4(("heat.dark", 1, 0.55), ("heat.1", 0.86, 0.75)), "inkPx": 3.4, "edge": "auto", "boilDeg": 4, "breakUp": {"phase": "fade"}},
          start=PEAK, untilPhaseEnd="fade", shiftM=[0, 0.9], scale={"steps": [0.75, 1.1, 1.0]}),
    shape("core", "White core", "cloud", {"radiusM": 1.05, "squash": 0.88, "lobes": 10, "lobeDepth": 0.18,
          "tones": T4(("heat.3", 1, 0.5), ("heat.4", 0.72, 0.7)), "inkPx": 2.2, "edge": "ink", "boilDeg": 3, "breakUp": {"phase": "fade"}},
          start=PEAK, untilPhaseEnd="fade", shiftM=[0, 1.0], scale={"steps": [0.7, 1.12, 1.0]}),
    star("flash", "White frame", 2.0, 13, 0.5, 0.3, T4(("white", 1, None)), 4.2, white=True, start=PEAK, durationMs=84, shiftM=[0, 0.9]),
    burst("chunks", "Chunks", start=PEAK, count=9, lifeMs=[700, 1000], speedMps=[5, 9], direction="up", spreadDeg=95, gravityMps2=9, drag=1.2, startRadiusM=[0.6, 1.0],
          sizeM=[0.07, 0.13], spinDegPerS=[300, 800], look={"kind": "chip", "role": "debris", "inkPx": 1.6, "edge": "ink"}, seed=41, shiftM=[0, 0.8]),
    burst("specks", "Debris everywhere", start=PEAK, count=34, lifeMs=[600, 1100], speedMps=[4, 11], direction="out", drag=1.8, gravityMps2=7, startRadiusM=[0.8, 1.6],
          sizeM=[0.02, 0.04], look={"kind": "speck", "role": "ink", "inkPx": 0, "edge": "none"}, seed=42, timing=SMOOTH, shiftM=[0, 0.9]),
    burst("sparks", "Sparks", start=PEAK, count=10, lifeMs=[600, 900], speedMps=[4, 7], direction="out", drag=1.8, startRadiusM=[1.2, 1.6], sizeM=[0.06, 0.08],
          sizeOverLife=[[0, 1], [1, 0.4]], look={"kind": "diamond", "role": "team", "inkPx": 1.9, "edge": "auto"}, seed=43, timing=SMOOTH, shiftM=[0, 0.9]),
    word("word", "Sound word", ["KRAKOOM", "KABOOM", "BADOOM"], start=PEAK, untilPhaseEnd="fade", shiftM=[0, 2.1], letterPx=52, colours=WORD,
         tiltDeg=[-9, 9], ramp=0.24, breakUp={"phase": "fade"}, breakSteps=5, riseM=0.3, seed=44),
]
save(effect("hit_heavy_blast", "Heavy: big blast", (0, 520, 900), L), "hit-ground")

puffs = []
for k, (x, y, r, role, d) in enumerate([(-0.55, 0.15, 0.48, "heat.1", 0), (0.5, 0.05, 0.5, "heat.1", 30), (0.0, 0.55, 0.55, "heat.2", 15), (-0.75, 0.75, 0.38, "heat.2", 45),
                                         (0.75, 0.8, 0.4, "heat.1", 60), (0.1, 1.05, 0.42, "heat.3", 75)]):
    puffs.append(shape(f"puff{k}", f"Puff {k + 1}", "smoke", {"style": "puff", "radiusM": r, "role": role, "rimRole": "ink", "inkPx": 3, "grow": [0.35, 1.08, 0.15],
                 "riseM": 0.35, "driftM": [x * 0.3, 0]}, start={"phase": "peak", "ms": d}, untilPhaseEnd="fade", shiftM=[x, y + 0.2], timing=SMOOTH))
L = [
    shape("dots", "Halftone field, fading to one side", "dots", {"radiusM": 2.1, "innerM": 0, "edgeM": 0, "stepPx": 10, "dotPx": 4.2, "role": "heat.2", "alpha": 1,
          "growFrom": 0.5, "growMs": 120, "flickerM": 0, "breakUp": {"phase": "fade"}}, start=PEAK, untilPhaseEnd="fade", timing=SMOOTH, shiftM=[0.5, 0.75]),
    star("burst", "Burst behind", 1.25, 11, 0.5, 0.35, T4(("heat.dark", 1, 0.4), ("heat.1", 0.7, 0.6)), 3.6, start=PEAK, durationMs=420, breakUp={"lastMs": 220},
         shiftM=[0, 0.6], scale={"steps": [0.8, 1.1, 1.0]}),
    *puffs,
    burst("specks", "Specks", start=PEAK, count=14, lifeMs=[450, 700], speedMps=[3, 7], direction="out", drag=2, gravityMps2=5, startRadiusM=[0.8, 1.2], sizeM=[0.02, 0.035],
          look={"kind": "speck", "role": "ink", "inkPx": 0, "edge": "none"}, seed=51, timing=SMOOTH, shiftM=[0, 0.6]),
    word("word", "Sound word", ["BLAM", "WHAM", "BAM"], start={"phase": "peak", "ms": 40}, untilPhaseEnd="fade", shiftM=[0.05, 0.62], letterPx=40, colours=WORD,
         separation="heat.3", tiltDeg=[-10, -4], ramp=0.2, breakUp={"phase": "fade"}, breakSteps=4, seed=52),
]
save(effect("hit_heavy_puffs", "Heavy: puff cluster", (0, 420, 700), L), "hit-ground")

# ================================================================ set 4: energy hits (light, no ink)
L = [
    shape("glow", "Glow", "glow", {"radiusM": 1.4, "role": "glow", "alpha": 0.75, "soft": True, "grow": [0.6, 1.1], "flicker": 0.08}, blend="add", start=PEAK,
          untilPhaseEnd="fade", timing=STEPS, alpha={"life": [[0, 1], [0.6, 1], [1, 0]]}),
    shape("dots", "Light dots", "dots", {"radiusM": 1.5, "innerM": 0.5, "edgeM": 0.6, "stepPx": 9, "dotPx": 3.2, "role": "glow.hot", "alpha": 1, "growFrom": 0.4,
          "growMs": 100, "flickerM": 0.06, "breakUp": {"phase": "fade"}}, start=PEAK, untilPhaseEnd="fade", timing=STEPS),
    star("star", "White star", 0.55, 4, 0.14, 0, T4(("glow.hot", 1, 0.6), ("white", 0.62, None)), 0, edge="none", boil=22, start=PEAK, untilPhaseEnd="fade",
         breakUp={"phase": "fade"}, scale={"steps": [1.3, 1, 1.15, 1]}),
    burst("sparks", "Sparks", start=PEAK, count=8, lifeMs=[300, 460], speedMps=[6, 10], direction="out", drag=3.5, startRadiusM=[0.2, 0.3], sizeM=[0.035, 0.05],
          sizeOverLife=[[0, 1], [1, 0.3]], streak={"role": "glow", "lengthM": 0.5, "widthPx": 3}, look={"kind": "diamond", "role": "white", "inkPx": 0, "edge": "none"},
          seed=61, timing=SMOOTH),
    word("word", "Sound word", ["ZAP", "ZZAK", "ZOK"], start=PEAK, untilPhaseEnd="fade", shiftM=[0.1, 0.62], letterPx=32, colours=WORD, tiltDeg=[6, 12], ramp=0.15,
         breakUp={"phase": "fade"}, breakSteps=3, seed=62),
]
save(effect("hit_energy_zap", "Energy: zap", (0, 300, 360), L, colour="glow"), "hit-unit")

L = [
    shape("ring1", "Pulse ring", "ring", {"radiusM": 1.5, "widthPx": 6, "inkPx": 0, "role": "glow.hot", "style": "solid", "teeth": 0, "teethM": 0.1, "growFrom": 0.15,
          "growMs": 260}, start=PEAK, durationMs=320, timing=SMOOTH, alpha={"life": [[0, 1], [0.6, 1], [1, 0]]}),
    shape("ring2", "Second ring", "ring", {"radiusM": 1.1, "widthPx": 3.5, "inkPx": 0, "role": "glow", "style": "solid", "teeth": 0, "teethM": 0.1, "growFrom": 0.1,
          "growMs": 260}, start={"phase": "peak", "ms": 90}, durationMs=300, timing=SMOOTH, alpha={"life": [[0, 1], [0.5, 1], [1, 0]]}),
    shape("glow", "Glow", "glow", {"radiusM": 1.0, "role": "glow", "alpha": 0.8, "soft": True, "grow": [1.2, 0.5], "flicker": 0.1}, blend="add", start=PEAK,
          untilPhaseEnd="fade", timing=STEPS),
    star("core", "Core star", 0.42, 6, 0.3, 0.1, T4(("glow.hot", 1, 0.5), ("white", 0.55, None)), 0, edge="none", boil=14, start=PEAK, untilPhaseEnd="fade",
         breakUp={"phase": "fade"}, scale={"steps": [1.35, 1.0, 1.2, 1.0]}),
    burst("needles", "Needles", start=PEAK, count=10, lifeMs=[240, 360], speedMps=[7, 11], direction="out", drag=4, startRadiusM=[0.15, 0.25], sizeM=[0.04, 0.05],
          sizeOverLife=[[0, 1], [1, 0.2]], look={"kind": "spark", "role": "glow.hot", "inkPx": 0, "edge": "none"}, seed=71, timing=SMOOTH),
    word("word", "Sound word", ["ZZAK", "ZAP"], start={"phase": "peak", "ms": 30}, untilPhaseEnd="fade", shiftM=[-0.05, 0.6], letterPx=30, colours=WORD,
         tiltDeg=[-11, -5], ramp=-0.12, breakUp={"phase": "fade"}, breakSteps=3, seed=72),
]
save(effect("hit_energy_pulse", "Energy: pulse", (0, 260, 300), L, colour="glow"), "hit-unit")

proj = {"format": "shamble-vfx-project", "version": 1, "name": "Comic hits",
        "about": "A collection of hit effects in four sets: small arms, impact bursts, heavy explosions, energy. After the moves in the Art lead's hit references (2026-11-15), in Shamble VFX's own shapes, letters and colour roles.",
        "preview": {fid: {"scene": sc} for (fid, sc) in made}}
json.dump(proj, open(os.path.join(outdir, "project.json"), "w"), indent=2)
open(os.path.join(outdir, "project.json"), "a").write("\n")
print(len(made), "hits")
