# Mosaico 实时表情接入

## 当前状态

P1 左侧使用 Square Pop 浏览器素材与逐帧播放器，右侧保留五种生活场景。页面可通过本地服务连接 Mosaico，使用六位码配对、发起邀请或表情点动、领取手机相册里的照片，并在开发者模式打开原有手动控制。

当前固件的遥控状态包含电机、互动计时、远程表演、照片和活动日志。回包尚未包含主机实际显示的表情帧。网页连接实机后会明确显示「已连接 · 表情预览」。

## 固件状态契约

固件将播放器快照通过已有 UI owner 发布到遥控状态，P1 已可读取以下可选字段：

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
    "mirror": true
  }
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

播放器当前已有 `emote`、`generation`、`frame`、`frames`、`active`、`playing`、`listening` 和 `listen_frame`。遥控层只需增加一个有界、线程安全的只读快照发布，并在状态 JSON 加上 `face`。P1 每 200 ms 请求一次状态，在浏览器本地按播放器帧率连续绘制，然后用下一条设备快照校正。

## 源码位置

- 播放器快照：[app_expression_player.h](../../firmware/mosaico-vibe/projects/airboat_baseline/components/app_expression_player/include/app_expression_player.h)
- UI owner：[app_airboat_ui.c](../../firmware/mosaico-vibe/projects/airboat_baseline/components/app_airboat_ui/app_airboat_ui.c)，主页 tick 已读取 `face_snapshot`。
- 遥控服务：[app_remote.h](../../firmware/mosaico-vibe/projects/airboat_baseline/components/app_remote/include/app_remote.h)，已有互动和远程表演状态的发布模式。
- 状态 JSON：[remote_protocol.c](../../firmware/mosaico-vibe/projects/airboat_baseline/components/app_remote/remote_protocol.c)。
- 响应上限：[remote_internal.h](../../firmware/mosaico-vibe/projects/airboat_baseline/components/app_remote/private/remote_internal.h)，当前上限 1024 字节。
- 手机状态处理：[p1.js](js/p1.js)

固件改动后，在 host protocol test 中验证配对和状态回包包含固定目录快照，未知表情字符串不会越界，JSON 长度低于 `REMOTE_RESPONSE_BYTES`。安装后再用真实 Mosaico 检查语音、空闲表情、表情菜单、听音叠加及离开主页后的状态。
