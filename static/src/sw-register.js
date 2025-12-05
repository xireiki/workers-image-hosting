// Service Worker 注册和图片预加载管理
export class ImageLoadManager {
  constructor() {
    this.swRegistration = null;
    this.preloadQueue = [];
    this.preloadBatchSize = 5; // 每批预加载5张
    this.preloadDelay = 100; // 每批之间延迟100ms
    this.isPreloading = false;
    this.observer = null;
  }

  // 注册 Service Worker
  async register() {
    if ('serviceWorker' in navigator) {
      try {
        // 检查是否为生产环境（HTTPS 或部署的域名）
        const isProduction = location.protocol === 'https:' || 
                            location.hostname !== 'localhost' && 
                            location.hostname !== '127.0.0.1';
        
        // 开发环境下跳过 Service Worker
        if (!isProduction) {
          console.log('Development mode: Service Worker disabled');
          return null;
        }
        
        this.swRegistration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });
        console.log('Service Worker registered:', this.swRegistration);
        
        // 等待 Service Worker 激活
        if (this.swRegistration.waiting) {
          this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('Service Worker controller changed');
        });
        
        return this.swRegistration;
      } catch (error) {
        console.warn('Service Worker registration failed:', error);
        // 注册失败不影响应用运行
      }
    } else {
      console.warn('Service Worker not supported');
    }
    return null;
  }

  // 预加载图片列表
  preloadImages(urls) {
    if (!urls || urls.length === 0) return;
    
    // 添加到队列
    this.preloadQueue.push(...urls);
    
    // 开始批量预加载
    if (!this.isPreloading) {
      this.processBatchPreload();
    }
  }

  // 批量处理预加载
  async processBatchPreload() {
    if (this.preloadQueue.length === 0) {
      this.isPreloading = false;
      return;
    }

    this.isPreloading = true;
    
    // 取出一批
    const batch = this.preloadQueue.splice(0, this.preloadBatchSize);
    
    // 通知 Service Worker 预加载
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PRELOAD_IMAGES',
        urls: batch
      });
    }
    
    // 延迟后处理下一批
    setTimeout(() => {
      this.processBatchPreload();
    }, this.preloadDelay);
  }

  // 使用 Intersection Observer 智能预加载
  observeImages(waterfall, items, getThumbnailCallback) {
    if (!('IntersectionObserver' in window)) {
      console.warn('IntersectionObserver not supported');
      return;
    }

    // 清理旧的 observer
    if (this.observer) {
      this.observer.disconnect();
    }

    // 创建观察器 - 提前预加载即将进入视口的图片
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            const img = entry.target;
            const index = parseInt(img.dataset.index || '0');
            
            // 预加载当前可见图片及后续几张
            const preloadUrls = [];
            const preloadCount = 10; // 预加载后续10张
            
            for (let i = index; i < Math.min(index + preloadCount, items.length); i++) {
              const item = items[i];
              if (item && !item.localData) {
                const url = getThumbnailCallback(item.link || item.name);
                if (url) {
                  preloadUrls.push(url);
                }
              }
            }
            
            if (preloadUrls.length > 0) {
              this.preloadImages(preloadUrls);
            }
          }
        });
      },
      {
        // 提前触发 - 当图片距离视口还有1000px时就开始加载
        rootMargin: '1000px 0px',
        threshold: 0
      }
    );

    // 观察所有图片元素
    setTimeout(() => {
      const images = document.querySelectorAll('.preview-img');
      images.forEach((img, index) => {
        img.dataset.index = index;
        this.observer.observe(img);
      });
    }, 500);
  }

  // 清除缓存
  clearCache() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLEAR_CACHE'
      });
    }
  }

  // 卸载
  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

// 导出单例
export const imageLoadManager = new ImageLoadManager();
