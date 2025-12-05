import {
  Application,
  Router,
  normalizePathnameMiddleware
} from '@cfworker/web';
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
// 从环境中读取密码（在 Cloudflare Worker 中通过 Wrangler 的 binding `PASS` 注入）
const PASS = globalThis.PASS || null; // 若未提供则为 null

const router = new Router();

// SHA-256 哈希函数
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

async function randomString(len) { // 随机链接生成
  len = len || 6;
  let $chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';    // 默认去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1
  let maxPos = $chars.length;
  let result = '';
  for (let i = 0; i < len; i++) {
    result += $chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return result;
}

// 静态资源路由 — 使用标准 Worker（通过 Application 中间件）处理静态资源
async function handleAssetRequest(request) {
  return getAssetFromKV({ request });
}

// 兼容本地 dev：直接使用原始 event 调用 getAssetFromKV，保证响应流交给 runtime
addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);
    const pathname = url.pathname;
    const asset = new RegExp('/assets/.*', 'i');
    const index = new RegExp('/index.*', 'i');
    const list = new RegExp('/list.*', 'i');

    // Serve index.html for root path while keeping URL as '/'
    if (pathname === '/') {
      event.respondWith(
        getAssetFromKV(event, {
          mapRequestToAsset: (req) => {
            const u = new URL(req.url);
            u.pathname = '/index.html';
            return new Request(u.toString(), req);
          }
        })
      );
      return;
    }

    // Serve list.html for /list while keeping URL as '/list'
    if (pathname === '/list') {
      event.respondWith(
        getAssetFromKV(event, {
          mapRequestToAsset: (req) => {
            const u = new URL(req.url);
            u.pathname = '/list.html';
            return new Request(u.toString(), req);
          }
        })
      );
      return;
    }

    if (asset.test(pathname) || index.test(pathname) || list.test(pathname)) {
      event.respondWith(getAssetFromKV(event));
    }
  } catch (e) {
    // ignore
  }
});

// 首页直接返回静态文件
// 首页跳转到 /index.html（由 getAssetFromKV 处理静态资源）
router.get('/', ({ res }) => {
  res.redirect('/index.html');
});

// /list 直接返回 list.html
// /list 跳转到 /list.html
router.get('/list', ({ res }) => {
  res.redirect('/list.html');
});


let header = new Headers()
header.set('access-control-allow-origin', '*')

// 上传api（支持多种文件类型，并分类为 image/document/video/sound）
router.post('/api', async ({ req, res }) => {
  const form = req.body.formData();
  const file = (await form).get('img');

  if (!file || !file.name) {
    res.status = 400;
    res.headers = header;
    res.body = { info: '未提供文件' };
    return;
  }

  const mime = (file.type || '').toLowerCase();
  let category = 'other';

  if (mime.startsWith('image/')) category = 'image';
  else if (mime.startsWith('video/')) category = 'video';
  else if (mime.startsWith('audio/')) category = 'sound';
  else if (mime.startsWith('application/') || mime.startsWith('text/')) category = 'document';
  else {
    // fallback to extension-based classification
    const extMatch = file.name.match(/\.([^.]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';
    const docExt = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv','rtf','odt'];
    const videoExt = ['mp4','mkv','webm','mov','avi','flv','wmv'];
    const audioExt = ['mp3','wav','ogg','m4a','flac','aac'];
    const imageExt = ['png','jpg','jpeg','gif','bmp','webp','svg','tiff'];

    if (videoExt.includes(ext)) category = 'video';
    else if (audioExt.includes(ext)) category = 'sound';
    else if (docExt.includes(ext)) category = 'document';
    else if (imageExt.includes(ext)) category = 'image';
  }

  let url = await randomString();
  let check = await LINK.get(url);
  if (check !== null) {
    url = await randomString();
  }

  const stream = file.stream();
  await LINK.put(url, stream, {
    metadata: {
      size: file.size,
      name: url,
      originalName: file.name,
      type: file.type,
      date: new Date().getTime(),
      category: category
    }
  });

  res.headers = header;
  res.body = {
    link: req.url + '/file/' + url,
    category: category
  };
});

// 获取缩略图（Cloudflare Image Resizing）
router.get('/api/thumb/:p', async ({ req, res }) => {
  const { metadata } = await LINK.getWithMetadata(req.params.p, { type: "text" });
  const category = metadata && metadata.category ? metadata.category : 'other';
  
  // 只有图片才生成缩略图
  if (category !== 'image') {
    res.status = 400;
    res.headers = header;
    res.body = { info: '只支持图片缩略图' };
    return;
  }

  // 从查询参数获取缩略图宽度，默认 400px，最大 800px
  const width = Math.min(parseInt(req.url.searchParams.get('width') || '400'), 800);
  
  // 获取原始图片
  const body = await LINK.get(req.params.p, { cacheTtl: 864000, type: "stream" });
  const type = metadata && metadata.type ? metadata.type : 'image/jpeg';
  
  // 使用 Cloudflare Image Resizing
  // 通过 cf 选项指定图片转换参数
  const hostname = new URL(req.url).hostname;
  const imageUrl = `https://${hostname}/api/file/${req.params.p}`;
  
  const imageResponse = await fetch(imageUrl, {
    cf: {
      image: {
        width: width,
        quality: 85,
        format: 'auto'
      }
    }
  });

  res.headers = header;
  res.headers.set('Cache-Control', 'public, max-age=864000');
  res.headers.set('Content-Type', imageResponse.headers.get('Content-Type') || type);
  res.body = imageResponse.body;
});

// 获取文件（返回二进制流并在头部包含 category）
router.get('/api/file/:p', async ({ req, res }) => {
  const body = await LINK.get(req.params.p, { cacheTtl: 864000, type: "stream" });
  const { metadata } = await LINK.getWithMetadata(req.params.p, { type: "text" });
  const type = metadata && metadata.type ? metadata.type : 'application/octet-stream';
  const size = metadata && metadata.size ? metadata.size : null;
  const category = metadata && metadata.category ? metadata.category : 'other';
  const originalName = metadata && metadata.originalName ? metadata.originalName : req.params.p;

  if (req.headers.has('If-None-Match')) {
    res.status = 304;
    return;
  }

  res.headers = header;
  res.headers.set('Cache-Control', 'public, max-age=864000');
  res.headers.set('Content-Type', type);
  res.headers.set('X-Category', category);
  res.headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
  if (size !== null) res.etag = size;
  res.body = body;
});

// 简易登陆验证
router.get('/query', async ({ req, res }) => {
  const paramas = req.url.searchParams;
  const provided = paramas.get('pass');
  if (provided && PASS) {
    const hashedPass = await hashPassword(PASS);
    if (provided === hashedPass) {
      const key = await LINK.list();
      res.body = key;
      return;
    }
  }
  res.status = 403;
  res.body = { info: '密码错误' };
});

// 删除文件接口
router.delete('/api/file/:p', async ({ req, res }) => {
  // 删除需要密码验证（使用 PASS 环境变量）
  const provided = req.url.searchParams.get('pass');
  if (!provided || !PASS) {
    res.status = 403;
    res.headers = header;
    res.body = { info: '密码错误，无法删除' };
    return;
  }
  
  const hashedPass = await hashPassword(PASS);
  if (provided !== hashedPass) {
    res.status = 403;
    res.headers = header;
    res.body = { info: '密码错误，无法删除' };
    return;
  }

  const fileKey = req.params.p;
  if (!fileKey) {
    res.status = 400;
    res.headers = header;
    res.body = { info: '文件键不存在' };
    return;
  }

  try {
    await LINK.delete(fileKey);
    res.status = 200;
    res.headers = header;
    res.body = { info: '文件已删除' };
  } catch (err) {
    res.status = 500;
    res.headers = header;
    res.body = { info: '删除失败: ' + err.message };
  }
});

// 随机获取文件接口
router.get('/api/random', async ({ req, res }) => {
  const params = req.url.searchParams;
  const provided = params.get('pass');
  const type = params.get('type'); // 可选: image, video, sound, document
  
  // 验证密码
  if (!provided || !PASS) {
    res.status = 403;
    res.headers = header;
    res.body = { info: '密码错误' };
    return;
  }
  
  const hashedPass = await hashPassword(PASS);
  if (provided !== hashedPass) {
    res.status = 403;
    res.headers = header;
    res.body = { info: '密码错误' };
    return;
  }
  
  try {
    // 获取所有文件列表
    const allFiles = await LINK.list();
    if (!allFiles.keys || allFiles.keys.length === 0) {
      res.status = 404;
      res.headers = header;
      res.body = { info: '没有可用文件' };
      return;
    }
    
    // 根据 type 过滤文件
    let filteredFiles = allFiles.keys;
    if (type) {
      filteredFiles = allFiles.keys.filter(file => {
        return file.metadata && file.metadata.category === type;
      });
      
      if (filteredFiles.length === 0) {
        res.status = 404;
        res.headers = header;
        res.body = { info: `没有找到类型为 ${type} 的文件` };
        return;
      }
    }
    
    // 随机选择一个文件
    const randomIndex = Math.floor(Math.random() * filteredFiles.length);
    const randomFile = filteredFiles[randomIndex];
    
    // 重定向到该文件
    return res.redirect(`/api/file/${randomFile.name}`);
  } catch (err) {
    res.status = 500;
    res.headers = header;
    res.body = { info: '获取文件失败: ' + err.message };
  }
});


// Compose the application
const app = new Application();

// 在路由之前添加静态资源处理中间件（替代 Service Worker 的 fetch 侦听）
app.use(async ({ req, res }, next) => {
  const pathname = req.url && req.url.pathname ? req.url.pathname : (new URL(req.url)).pathname;
  const asset = new RegExp('/assets/.*', 'i');
  const index = new RegExp('/index.*', 'i');
  const list = new RegExp('/list.*', 'i');
  if (asset.test(pathname) || index.test(pathname) || list.test(pathname)) {
    try {
      const requestUrl = req.url && req.url.toString ? req.url.toString() : String(req.url);
      const request = new Request(requestUrl, {
        method: req.method || 'GET',
        headers: req.headers || {}
      });
      const assetResponse = await handleAssetRequest(request);
      res.status = assetResponse.status;
      res.headers = new Headers(assetResponse.headers || {});
      res.body = assetResponse;
      return;
    } catch (e) {
      // asset handler failed -> fallthrough to router
    }
  }
  await next();
});

app.use(normalizePathnameMiddleware).use(router.middleware).listen();
