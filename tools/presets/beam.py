# The drawing board's Hammer leech beam, rebuilt in format v2: light, no ink on the beam; friend or foe in solid
# against broken. Phases 350 / 2500 / 300 ms.
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from common import *
W, P, F = 350, 2500, 300
TOT = W + P + F
we, pe = W / TOT, (W + P) / TOT          # where wind-up and peak end, as shares of the whole
PEAK = {"phase": "peak", "ms": 0}
L = []
# ---- on the ground: light under both ends, the lock ring
for (id, name, at, r, a) in [("ground_glow_target", "Light on the ground at the target", T, 4.4, 0.6), ("ground_glow_emitter", "Light on the ground at the Hammer", O, 2.6, 0.55)]:
    L.append(shape(id, name, "glow", {"radiusM": r, "role": "glow", "alpha": a, "soft": True, "grow": [1, 1], "flicker": 0},
        at=at, facing="ground", blend="screen", untilPhaseEnd="fade", timing=SMOOTH, alpha={"life": [[0, 0], [we, 1], [pe, 1], [1, 0]]}))
life = TOT - 70
k = lambda T_: round((T_ - 70) / life, 4)
L.append(shape("lock_ring", "Lock ring", "ring",
    {"radiusM": 3.4, "widthPx": 6, "inkPx": 11.5, "role": "team", "style": "auto-teeth", "teeth": 20, "teethM": 0.36, "growFrom": 1, "growMs": 0},
    facing="ground", start={"ms": 70}, untilPhaseEnd="fade", timing=SMOOTH,
    scale={"life": [[0, 1.169], [k(140), 1.095], [k(210), 1.042], [k(280), 1.011], [k(350), 1.0], [k(2850), 1.0], [1, 1.147]]},
    alpha={"life": [[0, 0.5], [k(140), 1], [k(2850), 1], [1, 0]]}))
# ---- rings closing on the target, around its middle
L.append(shape("closing_rings", "Rings closing on the target", "ring",
    {"radiusM": 3.1, "widthPx": 4.1, "inkPx": 0, "role": "glow.hot", "style": "auto-teeth", "teeth": 20, "teethM": 0.3, "growFrom": 1, "growMs": 0,
     "closing": {"count": 3, "periodMs": 900, "fromM": 3.1, "toM": 0.9}},
    facing="ground", liftM=1.0, start=PEAK, untilPhaseEnd="peak"))
# ---- the beam: two bands of added light, the hot core, the white core
def band(id, name, w, role, alpha, blend, edge, **kw):
    return shape(id, name, "band", {"from": O, "to": T, "widthM": w, "role": role, "alpha": alpha, "soft": False, "edge": edge, "flicker": 0.1, "letGo": "fade", **kw.pop("spec", {})},
                 blend=blend, untilPhaseEnd="fade", **kw)
L.append(band("beam_glow_wide", "Beam glow, wide", [0.52, 0.36], "glow", 0.2, "add", "ink", start=PEAK))
L.append(band("beam_glow", "Beam glow", [0.3, 0.2], "glow", 0.45, "add", "ink", start=PEAK))
L.append(band("beam_core", "Beam, hot core", [0.17, 0.12], "glow.hot", 1, "normal", "auto", spec={"find": "windup"}))
L.append(band("beam_white", "Beam, white core", [0.07, 0.05], "white", 1, "normal", "enemy", start=PEAK))
# ---- beads run from the target to the Hammer: the way the drain goes
L.append(shape("beads", "Beads", "beads",
    {"from": T, "to": O, "count": 3, "periodMs": 700, "sizeM": 0.24, "role": "white", "glowRole": "glow"},
    start=PEAK, untilPhaseEnd="peak"))
# ---- the hot spot on the target
spot = P + 0.45 * F
fall = [[0, 1], [round(P / spot, 4), 1], [1, 0]]
L.append(shape("spot_glow_wide", "Hot spot glow, wide", "glow", {"radiusM": 2.7, "role": "glow", "alpha": 0.7, "soft": True, "grow": [1, 1], "flicker": 0},
    blend="add", start=PEAK, durationMs=spot, timing=SMOOTH, scale={"life": fall}))
L.append(shape("spot_glow", "Hot spot glow", "glow", {"radiusM": 1.1, "role": "glow", "alpha": 0.8, "soft": True, "grow": [1, 1], "flicker": 0},
    blend="add", start=PEAK, durationMs=spot, timing=SMOOTH, scale={"life": fall}))
L.append(shape("spot_star", "Hot spot star", "shards",
    {"radiusM": 0.38, "points": 4, "inner": 0.16, "jitter": 0, "squash": 1, "rotationDeg": 0, "tones": [{"role": "white", "scale": 1}],
     "inkPx": 0, "edge": "none", "whiteFirstStep": False, "boilDeg": 28.6, "double": False},
    start=PEAK, durationMs=spot, scale={"life": fall}))
# ---- the emitter: swells in the wind-up, holds, shrinks as it lets go
glow_scale = {"life": [[0, 0.294], [we, 0.941], [we + 0.0001, 1], [pe, 1], [1, 0.4]]}
glow_alpha = {"life": [[0, 0.556], [we, 1], [1, 1]]}
core_scale = {"life": [[0, 0.35], [we, 1.05], [we + 0.0001, 1], [pe, 1], [1, 0.5]]}
L.append(shape("emitter_glow_wide", "Emitter glow, wide", "glow", {"radiusM": 1.7, "role": "glow", "alpha": 0.9, "soft": True, "grow": [1, 1], "flicker": 0},
    at=O, blend="add", untilPhaseEnd="fade", timing=SMOOTH, scale=glow_scale, alpha=glow_alpha))
L.append(shape("emitter_glow", "Emitter glow", "glow", {"radiusM": 0.85, "role": "glow", "alpha": 0.9, "soft": True, "grow": [1, 1], "flicker": 0},
    at=O, blend="add", untilPhaseEnd="fade", timing=SMOOTH, scale=glow_scale, alpha=glow_alpha))
L.append(shape("emitter_hot", "Emitter, hot", "glow", {"radiusM": 0.3, "role": "glow.hot", "alpha": 1, "soft": False, "grow": [1, 1], "flicker": 0.1},
    at=O, untilPhaseEnd="fade", scale=core_scale))
L.append(shape("emitter_white", "Emitter, white", "glow", {"radiusM": 0.2, "role": "white", "alpha": 1, "soft": False, "grow": [1, 1], "flicker": 0.1},
    at=O, untilPhaseEnd="fade", scale=core_scale))
write(sys.argv[1], effect("board_beam", "Hammer leech beam (board)", (W, P, F), L, colour="glow"))
