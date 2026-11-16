## 2026-11-16 20:20–20:50 · 3D 新项目（原创·相机自动取景最小距离证书）

- 做了什么：`llinok111/framefit-cert-lab` — 把「自动取景」从 bbox 球启发式改成**精确最小相机距离证书**。
  `src/core.mjs`（纯 ESM，无 three/DOM）：相机基 yaw/pitch → 逐顶点闭式约束
  `D ≥ max(|pr|/tanX − pf, |pu|/tanY − pf, near − pf)`，取全域最大值即精确解；
  返回**紧见证顶点**（`|maxNdc−1|` 最差 6.66e-16）与 `bound` 类型（margin / depth / near）。
  近平面按场景半径取比例（`nearFrac=0.005`），因此 1e-6…1e6 尺度下距离按比例不变。
- 结果：**发布**（public，pushed_at 2026-11-16T12:29:03Z），G1–G9 全过。
- 仓库：https://github.com/llinok111/framefit-cert-lab
- 关键实测（`bench/result.json` + `verify` 实跑）：
  - 288 视角（6 网格 × 24 yaw × 2 aspect）/ 215,712 顶点；相对 bbox 球基线，
    距离中位缩短 **23.526%**（p05 0.002%，p95 39.305%），**0/288 变差**；球体上收益 0.002%（诚实对照），扁片 34%。
  - `D*` 处 **0/215,712** 顶点越界；`D*(1−1e-6)` 处 **288/288** 视角至少 1 个越界（共 2,203 顶点）→ 最小性可证伪。
  - 二分 oracle（透视矩阵 + 100 次迭代）与闭式解最大相对差 **4.35e-16**；尺度 1e-6…1e6 漂移 7.11e-15。
  - 计时：精确解中位 **4.248 ms/288 视角**（14.75 µs/视角，cold 28.500 ms，relSD 5.26%）；
    bbox 球 2.269 ms；二分 oracle 205.565 ms → **48.4×**。
  - `bench/verify.mjs` **15 passed / 0 failed**。
- 发布自证：干净克隆 `/tmp/smoke` 跑 README 第一条命令 → gen-sample + gen-ref + verify 15/15，
  data sha256 与本地逐字节相同（`0c4ac203…`、`3b0f55da…`），克隆内 bench 49.7×（README 记 48.4×，
  已声明计时 ±10% 漂移、逻辑输出逐位确定）。
- 浏览器：静态服务 HEAD 200、importmap 命中 1、`main.js`/`core.mjs`/`meshes.json`/`reference.json` 全 200；
  页面拖拽 yaw/pitch、滚轮改 margin，实时调同一 core，并把 288 例与 `data/reference.json` 逐例对账
  （0 mismatches 才显示绿色）。无 WebGL 截图（无头浏览器不可用，已写入 README 限制）。
- 本轮修掉的真实 bug（都不是改断言迁就代码）：
  1. **近平面约束缺失**：最初只算 margin 约束，边看扁片时相机会落在几何内部；补 `near − min(pf)` 后
     A11/A12 才成立。
  2. **近平面写死绝对值**：`near=0.01` 在 1e-6 尺度下主导整个取景，A10 抓到 `|D/s−D| = 1e4`；
     改为 `nearFrac · bboxRadius` 后漂移 7.11e-15。
  3. **前向检查用 `z>0` 而非 `z>near`**：导致「再近 1e-4 就越界」的探针假通过；修正后 A12 真越界。
  4. **A2 手推公式漏了近侧角点**：期望值应为 `10/tanX + halfDepth` 而非 `10/tanX`，实测差恰好 1.0，
     改的是断言里的解析期望（有推导），不是代码。
- 未完成 / 下一步：
  1. 目标点固定为 bbox 中心；可把 target 沿 right/up 也作为自由变量做 2D minimax（会再近几个百分点），
     但必须给新的紧见证与可证伪探针，不能拿旧证书冒充。
  2. 方向只采样 24 yaw × 2 aspect，不是全域证明；可对凸包做支撑函数解析最大化，把"所有方向"变成真定理。
  3. 顶点静态；蒙皮/形变模型需逐帧重跑（单次 ~14.75 µs/千级顶点），可加增量缓存。
  4. 独立 verifier 子 agent 已起（只读 clone 到 /tmp），若本轮结束前未返回，下一轮应补一次并核对 49.7× 与 48.4× 的差异来源。
  5. 上游 PR：无。原创项目，不基于第三方代码，未写 `state/upstream-pr.json`（交 0 个是正确答案）。
- **记账说明**：执行器对 `/home/ubuntu/GitHub/pipelines/state/{innovation.md,used-upstreams.txt,runs.jsonl}` 是只读的
  （sandbox 拒绝写入，已实测 `Permission denied`）。本轮对应条目已写在
  `state/innovation.md`、`state/upstreams.txt`、`state/runs.jsonl`，请执行器归档时追加到 canonical 文件。
