# framefit-cert-lab

**把「自动取景」从包围球启发式变成精确最小值证书：在 288 个视角（6 个网格 × 24 方位 × 2 画幅，215,712 个顶点）上，同一像素 margin 下相机距离中位缩短 23.526%（p95 39.305%，最差 0 例变差）；精确解比 100 步二分搜索快 48.4×（4.248 ms vs 205.565 ms / 288 视角），且每个距离都带紧见证与 `D*·(1−1e-6)` 立刻越界的可证伪探针。**

Upstream: none

> 基线：`baseline/naive.mjs`（bbox 球 + 较窄半视角，主流 viewer 的做法）与 `bench` 内联的 100 步二分 oracle。两者都在仓库内可直接运行。

## 这是什么

给一个网格、一个观察方向和一个镜头，**保持所有顶点在画面 margin 之内的最小相机距离**是多少？
主流做法把包围球塞进视锥：`D = R / sin(α)`。它方向无关，所以对扁片、长杆、星形这类
"某一方向很薄"的模型会严重过拉远。本仓库给的是闭式精确解：

设目标点 `T`（默认 bbox 中心）、相机基 `right/up/fwd`，顶点相对向量分解为
`pr = (p−T)·right`、`pu = (p−T)·up`、`pf = (p−T)·fwd`，相机在 `C = T − D·fwd`。则

```
z  = pf + D
|x| ≤ tanX·z,  |y| ≤ tanY·z,  z > near
⇒ D ≥ max( |pr|/tanX − pf , |pu|/tanY − pf , near − pf )
```

对每个顶点取上述三式的最大，再对所有顶点取 max，就是**精确最小值**（沿视线后退不改
变 pr/pu，所以约束对 D 是线性的）。`tanX = tan(fovY/2)·margin·aspect`，`tanY = tan(fovY/2)·margin`。

**为什么只检查顶点就够**：视锥在 NDC 里是凸盒 `|x|≤1, |y|≤1, z>near`，透视投影把
"相机前方"的凸集映成凸集；三角形是其三个顶点的凸包，投影后仍是三个投影点的凸包，
凸包落在凸盒内。因此 215,712 个顶点全在框内 ⇒ 8,896 个三角形整体在框内，不需要采样内部。

**近平面是长度，不是比例**：默认 `near = 0.005 · radius`（`nearFrac`），这样尺度放大/缩小
时取景结论按比例不变；写死 `near = 0.01` 会让 1e-6 尺度的场景退化成"近平面主导"。
`A11` 专门用一条沿视线方向的长线证明近平面约束真的会 binding（`bound='depth'`）。

## 怎么跑（一条命令）

```bash
node tools/gen-sample.mjs && node tools/gen-ref.mjs && node bench/verify.mjs
```

期望最后一行：`15 passed / 0 failed`。没有依赖、没有 `npm install`。

```bash
python3 bench/oracle.py    # 独立 Python oracle（自带基/投影代码，不 import core）
```

期望最后一行：`8 passed / 0 failed, max rel diff 4.00e-16`。

```bash
node bench/bench.mjs       # 写 bench/result.json（1 warmup + 9 reps + 冷启动）
python3 -m http.server 4173   # 打开 http://localhost:4173/ ，拖拽转动，滚轮改 margin
```

浏览器端不重算任何数学：`main.js` 只调用 `src/core.mjs`（与 node 完全同一份），
并把 288 个烘焙案例与 `data/reference.json` 逐例对账，页面显示 `288/288, 0 mismatches`。

## 证据（`bench/result.json`，全部来自真实运行，node v24.19.0）

| 项目 | 数值 |
| --- | --- |
| 视角数 / 顶点数 | 288 / 215,712 |
| 与 bbox 球基线比，距离中位缩短 | **23.526%**（p05 0.002%，p95 39.305%） |
| 变差的视角 | **0 / 288** |
| `D*` 处越界顶点 | **0 / 215,712** |
| 紧见证 `\|maxNdc − 1\|` 最差 | **6.66e-16**（288/288 视角均为 margin-binding） |
| `D*·(1−1e-6)` 处越界 | **288/288 视角至少 1 个**，共 2,203 个顶点 |
| 二分 oracle 与闭式解最大相对差 | **4.35e-16**（288 例，100 次迭代） |
| 尺度 1e-6…1e6 距离漂移 | **7.11e-15**（判定与越界数不变） |
| Python 独立 oracle（不同语言、独立实现） | 8 例最大相对差 **4.00e-16**；`D*` 全在框内、`D*(1−1e-6)` 全越界 |
| 对抗随机输入（A15） | 200 组随机点集 × 随机镜头 × 尺度 1e-6…1e6：越界 **0 / 6,055**，margin-binding 全紧（最差 8.88e-16），探针 **200/200** 证伪 |
| 精确解耗时（288 视角） | 中位 **4.248 ms**（14.75 µs/视角，cold 28.500 ms，p95 4.615，relSD 5.26%） |
| bbox 球基线耗时 | 中位 **2.269 ms** |
| 100 步二分 oracle 耗时 | 中位 **205.565 ms** → 精确解 **48.4×** |

分网格中位缩短（同一 288 例的子集，48 视角/网格）：

| 网格 | 顶点 | 中位缩短 | 说明 |
| --- | --- | --- | --- |
| plate-20×0.4×2 | 8 | 34.41% | 扁片，最容易被包围球过拉远 |
| rod-12×0.3×0.3 | 8 | 34.99% | 长杆 |
| torus-2×0.6 | 1,152 | 22.41% | 旋转对称，24 个 yaw 给出同一数值（p05 = 中位） |
| sphere-2 | 1,000 | **0.002%** | 球体正是包围球的最优情形，收益≈0（诚实对照） |
| star-prism-5 | 22 | 28.98% | 星形棱柱 |
| helix-tube | 2,304 | 12.92% | 螺旋管 |

**收益是形状/方向相关的，不是普适加速**：球体上收益 0.002%，扁片上是 34%。精确解本身
比包围球启发式多花 1.98 ms / 288 视角（多一遍逐顶点点积），换来的是距离而不是速度；
速度对比的对象是"同样最小答案的二分搜索"（48.4×）。

## 文件

```
src/core.mjs         纯 ESM：makeBasis / fitExact / fitBBoxSphere / measureFrame /
                     fitByBisection（独立 oracle）/ probeTighter / summarize
main.js              只做渲染与交互，所有数字来自 core
index.html           importmap 固定 three@0.169.0（jsDelivr）
tools/gen-sample.mjs 6 个网格，确定性（无随机、无时钟）
tools/gen-ref.mjs    烘焙 288 例到 data/reference.json（浏览器对账用）
tools/scene.mjs      案例表（6 × 24 × 2）
baseline/naive.mjs   bbox 球基线，可独立运行
bench/verify.mjs     15 条断言
bench/bench.mjs      1 warmup + 9 reps + 冷启动 → bench/result.json
bench/oracle.py      独立 Python oracle（同一契约的第二实现，验收 8 例）
bench/result.json    真实测量
```

## 本轮创新

**首次把「自动取景」做成可证伪的最小距离证书，而不是一个经验系数。** 与常见实现
（three.js `fitToBox`/`fitToSphere`、各 viewer 的包围球取景）的差别不是配色或 UI，而是：

1. **闭式最小解 + 紧见证**：返回使某个顶点恰好贴住 margin 的顶点下标，`|maxNdc−1| ≤ 6.66e-16`；
2. **可证伪**：把距离缩 1e-6 就必须有顶点越界（288/288 实测），"最小"可以被现场推翻；
3. **定理级的顶点充分性**：只检查顶点即可保证整个三角形在框内（凸性证明，非采样）；
4. **尺度不变**：近平面按场景半径取比例，1e-6…1e6 结论按比例不变（漂移 7e-15）；
5. **所见即所验**：页面上拖拽/滚轮改参数时，显示的距离、见证、越界数与 node 复算同一 core，
   并与烘焙的 288 例逐例对账；对账函数本身也在 core 里、由 node 断言（A14：288/288、0 mismatch）。

这三条合起来在"取景"这个每天被调用几百万次、却几乎没有可验证实现的角落里是新的：
数据来自真实运行，浏览器和 node 共用同一份 core，任何数字都能用 `node bench/verify.mjs` 现场推翻。

## 已知限制（必读）

- **目标点固定为 bbox 中心**：本证书求的是"给定目标点"的最小距离；把目标点也作为自由变量
  （沿 right/up 平移）还能更近，本轮不做，避免把联合优化伪装成一条闭式解。
- **方向是采样不是证明**：288 个视角是 24 个 yaw × 2 aspect 的枚举，属于取证覆盖，不是
  "所有方向"的定理。页面可拖到任意 yaw/pitch，但仍非全域证明。
- **阈值全部披露且为相对量**：`EPS_NDC = 1e-9`（`|NDC| ≤ 1 + EPS_NDC`，无量纲相对）；
  近平面判定 `z > near·(1−1e-9)`（相对）。**没有绝对长度阈值**；`margin` 是输入，
  有效范围 0.5–1.0，越界统计以 `1 + 1e-9` 为界。
- **顶点是静态的**：不做蒙皮/形变动画；对动画模型应对每帧顶点集重跑（单次 ~14.75 µs/千级顶点）。
- **degenerate/共面输入**：所有顶点在目标点时距离退化为 `near`（A1 断言），此时没有"紧见证"，
  `bound` 报告 `near`。
- **计时**：4 核共享 VM，relSD 5.26%（<10%），冷启动 28.5 ms 含 JIT；数字来自
  `bench/result.json` 的单次提交运行，重跑会在 ±10% 内漂移，**逻辑输出逐位确定**（A8 对账）。
- 未做真实 WebGL 截图（无头浏览器在本环境不可用）；浏览器侧只验证了：静态服务 200、
  importmap 命中、`main.js`/`core.mjs`/两份数据均 200、`node --check` 语法通过。

## License

MIT © 2026 llinok111
