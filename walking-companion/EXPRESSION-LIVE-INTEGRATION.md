# Mosaico 实时表情接入

## 当前状态

P1 左侧显示 Square Pop 表情与语音对话。右侧可选五种生活场景，上方是表情节点画布，下方是 Anatomy 硬件链路。网页通过本地服务与 Mosaico 六位码配对。开发者模式打开原有手动控制。

旧固件连接后显示「已连接 · 表情预览」。配套补丁以 1.44.0 的 `48ee43d` 为底，提供独立的局域网同步接口。现场主线另行整合及验收。

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

- 播放器快照：[app_expression_player.h](../../firmware/mosaico-vibe/projects/airboat_baseline/components/app_expression_player/include/app_expression_player.h)
- UI owner：[app_airboat_ui.c](../../firmware/mosaico-vibe/projects/airboat_baseline/components/app_airboat_ui/app_airboat_ui.c)，主页 tick 已读取 `face_snapshot`。
- 遥控服务：[app_remote.h](../../firmware/mosaico-vibe/projects/airboat_baseline/components/app_remote/include/app_remote.h)，已有互动和远程表演状态的发布模式。
- 状态 JSON：[remote_protocol.c](../../firmware/mosaico-vibe/projects/airboat_baseline/components/app_remote/remote_protocol.c)。
- 响应上限：[remote_internal.h](../../firmware/mosaico-vibe/projects/airboat_baseline/components/app_remote/private/remote_internal.h)，当前上限 1024 字节。
- 手机状态处理：[p1.js](js/p1.js)

固件改动后，在 host protocol test 中验证配对和状态回包包含固定目录快照，未知表情字符串不会越界，JSON 长度低于 `REMOTE_RESPONSE_BYTES`。安装后再用真实 Mosaico 检查语音、空闲表情、表情菜单、听音叠加及离开主页后的状态。
