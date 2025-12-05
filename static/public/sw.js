// Service Worker for image optimization
const CACHE_NAME = 'image-cache-v1';
const IMAGE_CACHE_SIZE = 100; // 最多缓存100张图片

// 安装事件
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

// 激活事件
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 限制缓存大小
async function limitCacheSize(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxSize) {
    // 删除最旧的缓存（FIFO）
    const deleteCount = keys.length - maxSize;
    for (let i = 0; i < deleteCount; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// 图片请求处理策略：优先缓存，失败时网络请求
async function handleImageRequest(request) {
  try {
    // 先尝试从缓存获取
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // 缓存未命中，发起网络请求
    const networkResponse = await fetch(request);
    
    // 只缓存成功的响应
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      // 克隆响应，因为响应只能使用一次
      cache.put(request, networkResponse.clone());
      
      // 限制缓存大小
      limitCacheSize(CACHE_NAME, IMAGE_CACHE_SIZE);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Image fetch failed:', error);
    // 返回一个占位符或错误响应
    return new Response('Image load failed', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// 其他资源处理：网络优先，失败时使用缓存
async function handleOtherRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// 拦截 fetch 请求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 只处理同源请求
  if (url.origin !== location.origin) {
    return;
  }
  
  // 判断是否为图片请求
  const isImage = 
    request.destination === 'image' ||
    url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i) ||
    url.pathname.includes('/api/file/') ||
    url.pathname.includes('/thumbnail/');
  
  if (isImage) {
    event.respondWith(handleImageRequest(request));
  } else if (request.method === 'GET') {
    event.respondWith(handleOtherRequest(request));
  }
});

// 消息处理 - 用于预加载图片
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRELOAD_IMAGES') {
    const urls = event.data.urls || [];
    event.waitUntil(
      Promise.all(
        urls.map(async (url) => {
          try {
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(url);
            if (!cachedResponse) {
              const response = await fetch(url);
              if (response && response.status === 200) {
                await cache.put(url, response);
              }
            }
          } catch (error) {
            console.error('Preload failed for:', url, error);
          }
        })
      )
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        console.log('Cache cleared');
      })
    );
  }
});
