"""GOLDEN リーチ目仕様 v1.0 の検算スクリプト。

default（ハズレ）制御が、順押し・挟み打ちの全押し位置で
「リーチ目の形を作らず、かつ小役を揃えずに」止まれることを総当たりで確認する。
TS のテストに移植するときの元ネタ。

実行: python3 reachme_check.py  → すべて 0 なら OK
"""

LEFT = "リ ★ ★ ★ ベ リ ス ベ 7 リ ス チ ★ ベ リ チ B ベ ス リ ベ".split()
MID = "リ ベ チ ス 7 リ ベ ★ リ ベ チ ス チ リ ベ B リ ベ ス リ ベ".split()
RIGHT = "ス リ チ 7 ベ ス リ ベ B リ ★ ベ ス リ チ ベ リ ス ベ リ ベ".split()
# ★=G図柄, B=BAR, 7=赤7, リ=リプレイ, ベ=ベル, ス=スイカ, チ=チェリー

SMALL = {"ベ", "ス", "リ"}
BONUS = {"7", "★", "B"}
LINES = [(0, 0, 0), (1, 1, 1), (2, 2, 2), (2, 1, 0), (0, 1, 2)]  # (左,中,右) 0=上段 1=中段 2=下段


def wrap(p):
    return (p - 1) % 21 + 1


def at(reel, p):
    return reel[21 - wrap(p)]


def window(reel, center):
    """(上段, 中段, 下段)"""
    return (at(reel, center + 1), at(reel, center), at(reel, center - 1))


def candidates(push):
    """押し位置 push（中段番号）から止まれる中段番号（スベリ0〜4）"""
    return [wrap(push + k) for k in range(5)]


def wins_small(lw, mw, rw):
    """小役が揃う形か（スイカ代用「左ス・中ス・右BAR」を含む）"""
    for a, b, c in LINES:
        l, m, r = lw[a], mw[b], rw[c]
        if l == m == r and l in SMALL:
            return True
        if l == "ス" and m == "ス" and r == "B":
            return True
    return False


def tempai_left_right(lw, rw):
    """挟み打ち2リール停止時にテンパイしている小役の集合（代用含む）"""
    s = set()
    for a, _, c in LINES:
        l, r = lw[a], rw[c]
        if l in SMALL and (l == r or (l == "ス" and r == "B")):
            s.add(l)
    return s


def bonus_line_horizontal(lw, mw, rw):
    """R11: 上段・中段・下段のどれかにボーナス図柄が3つ並ぶ"""
    return any(lw[a] in BONUS and mw[b] in BONUS and rw[c] in BONUS for a, b, c in LINES[:3])


# ---- default セットで止めてはいけない形（仕様 2.3） ----

def left_forbidden(center, push):
    if center in (3, 13, 18, 19, 20):            # R08, R06, G03, G01, G02
        return True
    if center in (5, 6, 7, 9, 10, 11):           # チェリーが枠内
        return True
    slide = (center - push) % 21
    if center == 14 and slide >= 3:              # R07
        return True
    if center == 8 and push == 4:                # G04
        return True
    if center == 12 and push == 8:               # S03
        return True
    return False


def mid_forbidden_2nd(left_c, mid_c):
    if mid_c == 10:                              # R02
        return True
    if (left_c, mid_c) in {(4, 5), (8, 13), (12, 16), (14, 17)}:  # R12, G06, S05, S01
        return True
    if left_c == 14 and window(MID, mid_c)[1] == "ベ":           # R10
        return True
    return False


def right_forbidden_common(left_c, right_c):
    if right_c in (2, 11, 18, 19):               # R05, G07, S06, R01
        return True
    if left_c == 14 and (right_c == 17 or right_c in (21, 16, 9, 4)):  # S01(挟み形はWテン), S02
        return True
    if right_c == 12 and left_c in (4, 8, 12):   # R09, G05, S04
        return True
    return False


def right_forbidden_2nd(left_c, lw, right_c, rw):
    if right_forbidden_common(left_c, right_c):
        return True
    if len(tempai_left_right(lw, rw)) >= 2:      # R04
        return True
    return False


def third_ok(lw, mw, rw):
    return not wins_small(lw, mw, rw) and not bonus_line_horizontal(lw, mw, rw)


def check():
    bad_sandwich = []   # 挟み打ち：左→右→中 で中が逃げられない
    bad_order = []      # 順押し：左→中→右 で中が「右が逃げられる形」を選べない

    for lp in range(1, 22):
        for lc in candidates(lp):
            if left_forbidden(lc, lp):
                continue
            lw = window(LEFT, lc)

            # 挟み打ち
            for rp in range(1, 22):
                for rc in candidates(rp):
                    rw = window(RIGHT, rc)
                    if right_forbidden_2nd(lc, lw, rc, rw):
                        continue
                    for mp in range(1, 22):
                        if not any(third_ok(lw, window(MID, mc), rw) and not mid_forbidden_2nd(lc, mc)
                                   for mc in candidates(mp)):
                            bad_sandwich.append((lc, rc, mp))

            # 順押し
            def right_can_escape(mw):
                for rp in range(1, 22):
                    if not any(third_ok(lw, mw, window(RIGHT, rc)) and not right_forbidden_common(lc, rc)
                               for rc in candidates(rp)):
                        return False
                return True

            for mp in range(1, 22):
                if not any(not mid_forbidden_2nd(lc, mc) and right_can_escape(window(MID, mc))
                           for mc in candidates(mp)):
                    bad_order.append((lc, mp))

    print("挟み打ち 回避不能:", len(bad_sandwich), sorted(set(bad_sandwich))[:10])
    print("順押し   回避不能:", len(bad_order), sorted(set(bad_order))[:10])
    return not bad_sandwich and not bad_order


if __name__ == "__main__":
    ok = check()
    print("OK" if ok else "NG")
