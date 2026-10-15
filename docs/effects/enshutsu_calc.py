# 設定1の実テーブルから演出の期待度を計算（成立後の平均滞在 2G = 当選G + 持ち越し1G と仮定）
D=65536
P_rep=8978/D; P_bell=9300/D; P_mel=728/D; P_cher=1456/D
P_bonus=384/D                      # 当選/G
split={"solo":213/384,"cher":84/384,"mel":51/384,"reach":36/384}
G=2.0
P_state=P_bonus*G                  # 成立後状態のG割合
# 成立後1Gあたりの成立役（当選Gと持ち越しGの平均）
hz=1-P_rep-P_bell-P_mel-P_cher
B={"none":((split["solo"]+split["reach"])+hz)/2,
   "cher":(split["cher"]+P_cher)/2,"mel":(split["mel"]+P_mel)/2,
   "rep":P_rep/2,"bell":P_bell/2}
N={"rep":P_rep*(1-P_state),"bell":P_bell*(1-P_state),"mel":P_mel*(1-P_state),"cher":P_cher*(1-P_state)}

# ---- フラッシュ表 (役,状態) -> {F:率} ----
F_N={"rep":{"REP":0.50,"MEL":0.02},"bell":{"BELL":0.50},
     "mel":{"MEL":0.60,"CMEL":0.067},"cher":{"CHER":0.50,"CCHER":0.058}}
F_B={"none":{"REP":0.075,"BELL":0.06,"MEL":0.12,"CHER":0.10,"CMEL":0.03,"CCHER":0.03},
     "rep":{"MEL":0.85,"REP":0.15},"bell":{"BELL":0.30},
     "mel":{"CMEL":0.90,"CCHER":0.05,"MEL":0.05},"cher":{"CCHER":0.90,"CMEL":0.05,"CHER":0.05}}
def pct(x): return f"{x*100:.1f}%"
print("== フラッシュ期待度（出た時点でボーナスの割合）==")
for F in ["REP","BELL","MEL","CHER","CMEL","CCHER"]:
    n=sum(N[r]*F_N[r].get(F,0) for r in N); b=sum(P_state*B[r]*F_B[r].get(F,0) for r in B)
    print(f"{F:6s} 通常/G={n:.5f} 成立後/G={b:.5f} 期待度={pct(b/(n+b))}  出現 1/{1/(n+b):.0f}G")
# 条件付き
n=N["rep"]*F_N["rep"]["MEL"]; b=P_state*B["rep"]*F_B["rep"]["MEL"]; print("スイカF+リプレイ揃い → ボーナス",pct(b/(n+b)))
n=N["mel"]*F_N["mel"]["CMEL"]; b=P_state*B["mel"]*F_B["mel"]["CMEL"]; print("チャンススイカF+スイカ揃い → ボーナス",pct(b/(n+b)))
n=N["cher"]*F_N["cher"]["CCHER"]; b=P_state*B["cher"]*F_B["cher"]["CCHER"]; print("チャンスチェリーF+チェリー揃い → ボーナス",pct(b/(n+b)))
n=N["rep"]*F_N["rep"]["REP"]; b=P_state*B["rep"]*F_B["rep"]["REP"]; print("リプレイF+リプレイ揃い → ボーナス",pct(b/(n+b)))
n=N["bell"]*F_N["bell"]["BELL"]; b=P_state*B["bell"]*F_B["bell"]["BELL"]; print("ベルF+ベル揃い → ボーナス",pct(b/(n+b)))
tot=sum(F_B["none"].values()); print("成立後・小役なしG のフラッシュ発生率",pct(tot))

# ---- ランプ表 (役,状態) -> {点灯数:率} ----
L_N={"rep":{1:0.165,2:0.07,3:0.015},"bell":{1:0.25},"mel":{2:0.38,3:0.12},"cher":{1:0.50}}
L_B={"none":{1:0.09,2:0.10,3:0.14},"rep":{1:0.13,2:0.10,3:0.10},"bell":{1:0.33},
     "cher":{1:0.11,3:0.22},"mel":{1:0.27,3:0.06}}
print("\n== ランプ期待度 ==")
for k,label in [(1,"第1停止で点灯(1点灯以上)"),(2,"第2停止でも点灯(2点灯以上)"),(3,"第3停止でも点灯(3点灯)")]:
    n=sum(N[r]*sum(v for c,v in L_N[r].items() if c>=k) for r in N)
    b=sum(P_state*B[r]*sum(v for c,v in L_B[r].items() if c>=k) for r in B)
    print(f"{label}: 通常/G={n:.4f} 成立後/G={b:.5f} 期待度={pct(b/(n+b))} 出現 1/{1/(n+b):.0f}G")
sig=1-(1-tot)*(1-sum(L_B["none"].values()))
print("成立後・小役なしG で何かしら演出が出る率",pct(sig))
