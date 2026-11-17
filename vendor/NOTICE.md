# 内置字体组件来源

此目录固定保存本地 xuexitong-autostudy-folk 1.0.19 快照中的字体依赖块。该参考版本来自 [cq-eng/xuexitong-autostudy](https://github.com/cq-eng/xuexitong-autostudy)，由维护者确认；本项目基础 fork 为 [ZhangYHhhhhhh/xuexitong-autostudy](https://github.com/ZhangYHhhhhhh/xuexitong-autostudy)，原项目为 [DaRin1403/xuexitong-autostudy](https://github.com/DaRin1403/xuexitong-autostudy)。这些项目关系不替代下列第三方组件作者署名。
来源文件散列、依赖块散列、资源地址及映射表版本记录在 font-deps.lock.json。
构建不访问这些地址；来源地址中的 main 不是构建时的浮动依赖。

font-deps.js 保留原始组件代码、映射表元数据及原快照的 MIT 声明：

- Typr.js 兼容解析器：原快照构建工具标注来源 lyjx29/xiaoai-chaoxing 的 src/vendor_typr.js。
- blueimp-md5：原快照构建工具标注版本 2.19.0。
- 字体指纹表：表内作者 wyn665817，版本 20220515.1，license 字段为 MIT。

本项目保留这些来源说明，不把第三方代码归为本项目原创。原始快照没有附各组件的独立完整版权文件；这里只转录已有声明，不声称完成了上游所有版本的许可核验。

使用 node tools/embed-font-deps.cjs 生成脚本内的隔离、延迟初始化依赖块。
使用 node tools/embed-font-deps.cjs --check 验证生成结果与锁定资源相同。
更新资源必须显式替换本地文件、审阅来源与许可、更新锁定散列并运行全部测试。
