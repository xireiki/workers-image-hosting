# 图片加载优化说明

## 实现的优化功能

### 1. Service Worker 缓存策略
- **位置**: `static/public/sw.js`
- **功能**:
  - 图片请求采用"缓存优先"策略，大幅提升重复访问速度
  - 其他资源采用"网络优先，缓存降级"策略
  - 自动限制缓存大小（最多100张图片），避免占用过多存储
  - 在独立线程运行，不阻塞主渲染线程

### 2. 智能预加载机制
- **位置**: `static/src/sw-register.js`
- **功能**:
  - 使用 Intersection Observer 监听图片进入视口
  - 当图片距离视口还有 1000px 时自动开始预加载
  - 批量预加载（每批5张，间隔100ms），避免网络拥塞
  - 预加载当前可见图片及后续10张

### 3. 渐进式加载
- **每次加载 20 张卡片**，滚动到底部 800px 时自动加载下一批
- 避免一次性渲染大量 DOM 导致页面卡顿
- 配合 Service Worker 实现流畅的无限滚动体验

### 4. 浏览器原生懒加载
- 所有图片添加 `loading="lazy"` 属性
- 浏览器自动延迟加载屏幕外图片
- 与 Service Worker 协同工作

## 性能提升

### 减少主线程阻塞
- Service Worker 在独立线程处理网络请求和缓存
- 图片解码和缓存操作不影响页面交互

### 优化加载顺序
1. 首屏：立即加载前 20 张卡片
2. 预加载：提前加载即将进入视口的图片（距离 1000px）
3. 懒加载：浏览器自动处理更远的图片

### 缓存效果
- 首次访问：正常加载
- 再次访问：从 Service Worker 缓存读取（几乎瞬间显示）
- 离线支持：已缓存的图片即使离线也能查看

## 使用方法

### 自动启用
构建后自动包含 Service Worker，无需额外配置。

### 清除缓存
在浏览器控制台执行：
```javascript
imageLoadManager.clearCache()
```

### 手动预加载特定图片
```javascript
imageLoadManager.preloadImages([
  '/api/file/image1.jpg',
  '/api/file/image2.jpg'
])
```

## 浏览器兼容性

- Service Worker: Chrome 40+, Firefox 44+, Safari 11.1+, Edge 17+
- Intersection Observer: Chrome 51+, Firefox 55+, Safari 12.1+, Edge 15+
- 不支持的浏览器会降级到普通加载模式，不影响功能

## 注意事项

1. Service Worker 需要 HTTPS 或 localhost 环境
2. 首次访问需要注册 Service Worker，第二次访问才能享受缓存
3. 缓存限制为 100 张图片（FIFO 策略），可在 `sw.js` 中调整
4. 预加载配置可在 `sw-register.js` 中调整（批量大小、延迟、预加载数量等）
