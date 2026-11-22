# 人體血液循環 3D｜v0.6.16 正式發布版

**最終版本：v0.6.16。沿用已確認操作順暢的 v0.6.15；原始八份 GLB、home-button.js、既有 3D 操作模式均保留。**

## 本輪變動

1. 操作節點改成 11 個教學位置：四心腔、肺動脈/肺靜脈、頭部末端、左右手掌、左右足部末端。17 個內部連通節點仍保留，121/121 組有向路徑在程式層連通。
2. 選單只寫「起點」「終點」，移除「清除」；換任一位置會自動隱藏舊路線，需按「顯示路徑」重新播放。點任何血管層次、動脈或靜脈開關，都回到無高亮的構造模式。
3. 刪除非解剖中心線的細黃色引導軌跡；原生血管僅使用較淡的暖黃色材質高亮；肺、頭、四肢的微血管仍是放大教學示意。
4. 原有 3D 心臟四個腔室的 GLB 節點中心座標已讀取作為路徑錨點，兩條示意心內路徑改為深入心室再向上接大動脈，並加粗。**這不是已分割或實測的心腔管腔**，待使用者目視驗證。
5. 示意血流光點放大為紅色，附柔和光暈；高含氧亮紅色，低含氧暗紅色。沿既有有向路徑前進，經過肺部或組織微血管後改變顏色。
6. 使用舊版已記錄的左右手臂中心線、部分右足與頭部中心線，補足雙手、雙腳和頭部路線。鏡射產生的左小腿來源段明確標為 **simplified**，不冒稱原始量測中心線。

## 已驗證與限制

- `node tests/test-flow-network.mjs` 通過 121 組 A→B 的有向連通及接縫檢查；統計並輸出 `flow/all-pairs-audit.json`。
- `node --check app.js` 通過 JavaScript 語法檢查。
- **尚未完成真正的 WebGL 人工驗收。** 3D 解剖表面是否完全貼合需要打開預覽檢視，尤其四心腔深度、頭部/足部微血管的位置與幾段未量測分支。
- 為精簡教學，完整 GLB 中仍有少數大血管「整個 mesh 變色」的分支高亮；後續可依實際畫面切割成局部高亮。
- 胸廓、器官、外殼、四腔室模式與返回首頁按鈕均維持舊版；PWA SW cache 已更新。
- 單檔 HTML 仍需首次連線載入 Meshopt 解碼器（與 v0.6.4 相同）。


### v0.6.6 additions
- Correct depth-aware translucent heart tube inside true four-chamber GLB centres; anatomical mesh unchanged.
- Near/far pulmonary measured branch replaces premature proximal alveolar shortcut; capillary at distal right lung.
- Point color remains oxygenated red or deoxygenated maroon, including inside both heart circuits.
- Curated medium: renal, hepatic, mesenteric and portal native artery/vein meshes; additional half-transparent duodenum/jejunum toggle.
- Core excludes organ-specific branches; selected major cardiovascular route can still highlight vessels outside the core visual tier.
- All source-to-GLB gaps are explicitly approximate; no claim of true microvascular digitization.


### v0.6.7 — 肺循環黃光段連續、心腔管線加粗、中度消化器官血管
- 肺動脈幹分叉、右肺中葉動脈、右上肺靜脈原本已有 GLB，但 v0.6.6 未列入血流高亮；現在在原生網格上做連續金色高亮。原路網示意段仍不作為假血管顯示。
- 心內管線由 0.0048 半徑升至 0.0095，末端連續平滑增至 0.0125；不變動四腔室座標與模型。
- 中度將原生上腸繫膜動脈／靜脈、肝門靜脈、肝靜脈、肝動脈等網格以低強度強化材質顯示；不建立虛構的肝竇、腸絨毛內微血管。原始網格仍保留，核心模式不顯示器官特定分支。
- 中度加入原始 GLB 中存在的下胰十二指腸動脈及前支，作為十二指腸動脈供應的補充。沒有額外建立不存在的空腸動脈分支。
- 未通過實際 WebGL 多角度視覺驗收，請使用 ClassroomPreview 旋轉確認。


### v0.6.11 最終版面整合（待目視驗收）
- 左側固定教師控制欄，寬高依視窗自動調整，控制欄與整頁均不產生內部捲軸；內容透過縮放適應高度。
- 中度→簡化；核心→超簡化；未變更內部模型層級代碼。
- 紅色追蹤點以畫面可辨識尺寸呈現，保留鮮紅／深紅兩種血氧提示；光點不受深度遮蔽。
- 右心內路徑與左心內路徑分別使用冷藍與暖粉管線；播放時只令經過一側的心房心室暫時半透明，未經過側仍依老師顯示模式。
- 簡化層的肝門靜脈、肝靜脈、腸繫膜動靜脈採原生網格『局部透視』顯示，解決短小而深藏器官造成難以辨認。這並不表示 GLB 提供完整肝竇或絨毛血管。
- 重設視角使用原始人體外殼的真實世界座標包圍盒置中，並依視角及外形決定合理初始距離。
- 本輪保留所有八份 GLB、回首頁按鈕與既有 PWA 資源；121 條選擇路徑仍須測試。


## v0.6.11 旋轉縮放與初始視角
- 重設視角使用完整 skin 3D 邊界與畫布長寬比，保留 15% 畫面邊界。
- 在重設時先清除 OrbitControls 阻尼慣性，再重新定位相機與目標點。
- 平板單指旋轉、雙指平移及縮放；電腦右鍵平移。
- 互動期間自動將繪圖 DPR 降至最多 0.90，操作結束後恢復清晰（最高 1.25）。
- 首次開啟此版本會移除本單元舊的懸浮首頁按鈕位置，回到右下角；後續拖曳位置仍可記憶。
- 全程維持原始 3D GLB、原始 home-button.js 的內容未改動。


## v0.6.11 修正與效能策略
- 修正 v0.6.9 中 Canvas 內部像素尺寸被誤當 CSS 顯示寬高，造成鼠標操作期間人物水平跳動的問題。
- 將畫布的 CSS 尺寸綁定在右側展示區，固定 pixelRatio：一般最高 1.1，觸控最高 1.0，不再於手勢開始、結束時重新配置 WebGL 緩衝區。
- 血管由 MeshPhysicalMaterial 改為較輕的 MeshStandardMaterial（保留色彩、粗糙度、金屬參數與原有網格），降低 clearcoat 的著色成本。
- 心腔、自然人體外殼與器官的雙面透明材質設 forceSinglePass，保留相同透明度設定，減少透明材質重複繪圖呼叫。
- 隱藏的 QA 診斷新增 WebGL draw calls、三角形數及平均單次 render 耗時，供後續在教師裝置進一步驗證。
- 不修改任何 3D GLB、教學路網及既有 home-button.js。
- 尚未完成實際裝置 WebGL FPS 比對；畫質／半透明顯示需在最終驗收時檢查。


## v0.6.11 修正：滾輪更新被延遲
- 原因：OrbitControls 在 wheel 處理函式內已經呼叫 update() 並發出 change；而 draw() 下一幀再次 update() 可能回傳 false，原本的「needsRender || moved || moving」就略過畫面繪製。
- 在畫面更新引擎加入 controls.addEventListener('change', requestRender)，每次相機有變動都發出重繪通知。
- 修正滾輪縮放、雙指縮放、旋轉、平移可能在待機狀態延遲到下一次互動才更新的問題。
- QA 診斷資料新增 cameraDistance，供瀏覽器測試確認相機距離已於滾輪後立即反映到畫面（不需點擊）。
- 維持待機不重繪、固定 DPR、全版排版、11 起終點、121 組路徑、GLB 與 home-button.js 原樣。


## v0.6.12 最後整合：單顆定位血球／1×・2×／操作欄間距
- 從 v0.6.11 已驗證流暢版直接修改，不重寫 OrbitControls、相機、繪圖核心或 GLB。
- 單次只顯示一顆追蹤光點。依路線到達終點後從起點開始下一輪；原本亮紅色／暗紅色血氧指示與微血管交換維持。
- 血流路徑下方提供「正常 1×／加速 2×」；預設 1× 原速度 (.11 世界單位/秒)，切換 2× 僅影響血球前進速度、不改相機／3D 管線及網格。
- 四個左側面板之間增加少量間距，小螢幕自動縮放控制欄以維持不捲動。
- 依共通規範保留滿版固定操作欄（無內部捲軸）、原始 home-button.js（右下預設可拖曳）、平板雙指平移／縮放、PWA 快取、11 個位置及 121 組順向血流路網。
- meshopt decoder 初次使用需要網路，成功快取後方能離線使用；離線實機驗收仍需實際裝置檢查。


## v0.6.15 心內示意管／冠狀血管
- 心內血流示意改採真正的單根平滑 TubeGeometry，使用光照材質呈現圓潤立體感；刪除 v0.6.14 深色筋線與外框。
- 圓滑 V 型保留既有 3D 錨點（心房入口、心室深部、動脈出口），不改原始 GLB；心內段仍是教學示意。
- 心臟有任何可見心腔呈現半透明時，隱藏冠狀動脈與冠狀靜脈，恢復不透明即依血管層次顯示。


## v0.6.16 最終介面精簡
- 移除血流速度切換列中的可見「速度」標籤，保留「正常 1×／加速 2×」按鈕。
- 移除血流路徑卡片底部黃色提示文字的可見位置；保留隱藏的即時狀態，供輔助工具及程式使用。
- 未更動 3D 模型、血流座標、相機、操作、材質或返回首頁按鈕。
