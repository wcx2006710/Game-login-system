# 第三方库（离线内置）

为保证**断网 / 校园网限制环境下仍可完整演示**，本项目不使用 CDN，而是把用到的库打包进本目录。
所有文件均通过 `Express.static` 直接从 `/vendor/` 路径提供，不产生任何外部请求。

| 文件 | 库 | 版本 | 体积 | 来源 | License |
| --- | --- | --- | --- | --- | --- |
| `tsparticles.slim.bundle.min.js` | tsParticles (slim bundle) | 3.8.1 | 149 KB | <https://github.com/tsparticles/tsparticles> | MIT |
| `chart.umd.min.js` | Chart.js | 4.4.7 | 201 KB | <https://github.com/chartjs/Chart.js> | MIT |

## 引入方式

```html
<script src="/vendor/tsparticles.slim.bundle.min.js"></script>
<script src="/vendor/chart.umd.min.js"></script>
```

## 未内置但同样致谢的库

| 库 | 处理方式 | 来源 | License |
| --- | --- | --- | --- |
| Lucide Icons | 未下载 358 KB 的 UMD 包，改为取 16 个 SVG 内联进 `public/js/icons.js`（共 8.5 KB，省 98%） | <https://github.com/lucide-icons/lucide> | ISC |
| zxcvbn | 未引入（gzip 后 398 KB，远超本项目静态资源总量）；密码强度改用 `public/js/ui.js` 中的自研评分函数 | <https://github.com/dropbox/zxcvbn> | MIT |

## 更新方法

```bash
curl -o public/vendor/tsparticles.slim.bundle.min.js \
  https://unpkg.com/@tsparticles/slim@3.8.1/tsparticles.slim.bundle.min.js
curl -o public/vendor/chart.umd.min.js \
  https://unpkg.com/chart.js@4.4.7/dist/chart.umd.js
```
