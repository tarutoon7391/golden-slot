import itertools, functools
L="リ ★ ★ ★ ベ リ ス ベ 7 リ ス チ ★ ベ リ チ B ベ ス リ ベ".split()
M="リ ベ チ ス 7 リ ベ ★ リ ベ チ ス チ リ ベ B リ ベ ス リ ベ".split()
R="ス リ チ 7 ベ ス リ ベ B リ ★ ベ ス リ チ ベ リ ス ベ リ ベ".split()
REEL=[L,M,R]
wrap=lambda p:(p-1)%21+1
def at(r,p): return REEL[r][21-wrap(p)]
def win(r,c): return (at(r,c+1),at(r,c),at(r,c-1))
def cands(p): return [wrap(p+k) for k in range(5)]
SMALL={"ベ","ス","リ"}; BON={"7","★","B"}
LINES=[(0,0,0),(1,1,1),(2,2,2),(2,1,0),(0,1,2)]
def wins(lw,mw,rw):
    for a,b,c in LINES:
        l,m,r=lw[a],mw[b],rw[c]
        if l==m==r and l in SMALL: return True
        if l=="ス" and m=="ス" and r=="B": return True
    return False
def hline(lw,mw,rw): return any(lw[a] in BON and mw[b] in BON and rw[c] in BON for a,b,c in LINES[:3])
def tempLR(lw,rw):
    s=set()
    for a,_,c in LINES:
        l,r=lw[a],rw[c]
        if l in SMALL and (l==r or (l=="ス" and r=="B")): s.add(l)
    return s
def left_ok(c,push):
    if c in (3,13,18,19,20,5,6,7,9,10,11): return False
    sl=(c-push)%21
    if c==14 and sl>=3: return False
    if c==8 and push==4: return False
    if c==12 and push==8: return False
    return True
def mid_ok(c, lc):
    if c==10: return False
    if lc is not None:
        if (lc,c) in {(4,5),(8,13),(12,16),(14,17)}: return False
        if lc==14 and win(1,c)[1]=="ベ": return False
    return True
def right_ok(c, lc, sandwich2nd):
    if c in (2,11,18,19): return False
    if lc is not None:
        if lc==14 and (c==17 or c in (21,16,9,4)): return False
        if c==12 and lc in (4,8,12): return False
        if sandwich2nd and len(tempLR(win(0,lc),win(2,c)))>=2: return False
    return True
def ok_stop(reel, c, push, stops, order_idx, order):
    lc=stops.get(0); mc=stops.get(1); rc=stops.get(2)
    if reel==0:
        if not left_ok(c,push): return False
        # 左が後から止まる場合、既に止まった中・右との組み合わせ制約も見る
        if mc is not None and not mid_ok(mc,c): return False
        if rc is not None and not right_ok(rc,c,False): return False
        return True
    if reel==1:
        return mid_ok(c, lc)
    if reel==2:
        sandwich2nd = (order==(0,2,1) and order_idx==1)
        return right_ok(c, lc, sandwich2nd)
def final_ok(stops):
    lw,mw,rw=win(0,stops[0]),win(1,stops[1]),win(2,stops[2])
    return not wins(lw,mw,rw) and not hline(lw,mw,rw)
def escapable(order, idx, stops):
    """order[idx] のリールをどこで押しても、以後ずっと逃げられるか"""
    if idx==3: return final_ok(stops)
    reel=order[idx]
    for push in range(1,22):
        found=False
        for c in cands(push):
            if not ok_stop(reel,c,push,stops,idx,order): continue
            s2=dict(stops); s2[reel]=c
            if escapable(order, idx+1, s2): found=True; break
        if not found: return False
    return True
names={0:"左",1:"中",2:"右"}
for order in itertools.permutations([0,1,2]):
    bad=[]
    reel=order[0]
    for push in range(1,22):
        okc=[c for c in cands(push) if ok_stop(reel,c,push,{},0,order) and escapable(order,1,{reel:c})]
        if not okc: bad.append(push)
    print("→".join(names[r] for r in order), "第1停止で逃げ場なし押し位置:", bad if bad else "なし")
