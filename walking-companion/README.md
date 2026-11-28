# UNION NO.1 平板页

本目录包含 P1 横屏平板页面、五段概念演示、Square Pop 表情素材和 Anatomy 硬件图。网页使用 HTML、CSS 和 ES Modules，运行时只需要 Python 3.10+ 提供本地网页服务。

## 启动

在本目录运行 `python -B start-tablet.py`。设备地址提示出现时直接按回车即可在电脑上预览，填入 Mosaico 屏幕显示的地址则启动局域网转发。[启动和配对步骤](TABLET-START.zh-CN.md)

- `js/scenes.js` 配置场景封面和本地 MP4。演示点击后才加载。[素材来源](assets/images/provenance.json)
- `js/p1-hardware.js` 根据当前场景或设备回包更新部件标注、信号流与镜头。[硬件图结构](tools/anatomy-parts.md)
- `preview.py` 提供页面、视频和 Mosaico 局域网转发。[实机遥测接入](EXPRESSION-LIVE-INTEGRATION.md)

## 检查

```sh
python -B -m unittest discover -s tests
```
