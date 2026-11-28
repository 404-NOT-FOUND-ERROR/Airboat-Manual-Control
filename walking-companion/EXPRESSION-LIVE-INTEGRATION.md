# Mosaico 实时表情接入

## 当前状态

P1 左侧显示 Square Pop 表情与语音对话。右侧可选五种生活场景，上方是表情节点画布，下方是 Anatomy 硬件链路。网页通过本地服务与 Mosaico 六位码配对。开发者模式打开原有手动控制。

旧固件连接后显示「已连接 · 表情预览」。配套补丁是以 1.44.0 的 `48ee43d` 为底的接入参考。AirBoat 主项目已在 `b447ca0a5ffb676ec54e65a4f4e95efba8455259` 合入遥测，随 1.53.0 固件安装并核对启动健康。实际平板热点联测待完成。

## 固件状态契约

已配对的网页在 `status` 发现 `workbench: true` 后查询 `workbench BOOT TOKEN CLIENT`。该请求返回 `face` 与 `dialogue`，沿用 /api 的来源校验。设备返回示例：

```json
{
  "face": {
    "catalog": "1b835f35bd1cb71d08590f3027fba25d2892a8ec5bb7f56a5145e3be16ea359b",
    "semantic": "happy",
    "generation": 42,
    "frame": 73,
    "frames": 154,
    "fps": 25,
    "active": true,
    "playing": true,
    "listening": false,
    "listen_frame": 0,
    "mirror": false,
    "loop": true
  },
  "dialogue": { "phase": "speaking", "turn": 1, "revision": 3, "input": "你好", "output": "我们一起走走吧" }
}
```

字段意义如下。

- `catalog` 是固件所用 Square Pop AFM 的 SHA-256。P1 只有在目录哈希相同时才显示「实机同步」。
- `semantic` 是播放器当前生效的表情名。
- `generation` 每次换表情、取消或离开主页后递增。
- `frame` 与 `frames` 是设备当前帧号和动画总帧数。Square Pop 使用 25 fps，包含进入、循环主体和收尾。
- `active` 表示表情页目前由主机显示。
- `playing` 表示表情正在播放。
- `listening` 与 `listen_frame` 对应叠加的聆听条。
- `mirror` 是设备实际采用的镜像状态。
- `loop` 是设备当前语义的循环策略。
- `dialogue` 的输入来自小智语音识别，输出为本机开始播放时发布的回复句。网页内存只保留当前回包。

界面按设备的目录版本和帧号渲染，并用下一条快照校正。现有固件内部的短过渡桥接画面没有单独编码，手机热点下仍需现场核对同步观感。桨链显示驱动器输出百分比。

## 源码位置

固件实现位于主项目 `firmware/mosaico-vibe/projects/airboat_baseline`。`components/app_airboat_ui/app_airboat_ui.c` 发布 `app_expression_view_read()` 和 `app_xiaozhi_read_dialogue()` 的快照。`components/app_remote/remote_protocol.c` 生成回包，`components/app_remote/private/remote_internal.h` 定义 1024 字节响应上限。历史基线的改动可查看 [1.44.0 接入补丁](firmware-integration/mosaico-p1-telemetry.patch)，已合入遥测的主线可直接使用现有实现。

平板由 `p1-link.js` 读取 `status` 和 `workbench`，由 `p1.js` 更新字幕与表情画布。三路驱动输出来自 `status.motors`。[遥测请求](js/p1-link.js) · [页面状态](js/p1.js)

固件改动后，在 host protocol test 中验证配对和状态回包包含固定目录快照，未知表情字符串不会越界，JSON 长度低于 `REMOTE_RESPONSE_BYTES`。安装后再用真实 Mosaico 检查语音、空闲表情、表情菜单、听音叠加及离开主页后的状态。
