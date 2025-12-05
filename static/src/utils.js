// 公共工具函数

/**
 * 检查是否为内网地址
 * @param {string} hostname - 主机名或IP地址
 * @returns {boolean} 是否为内网地址
 */
export function isLocalNetwork(hostname) {
  if (!hostname) {
    hostname = window.location.hostname;
  }
  
  return hostname === 'localhost' || 
         hostname === '127.0.0.1' || 
         hostname.startsWith('192.168.') || 
         hostname.startsWith('10.') || 
         hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./); // 172.16.0.0/12
}

/**
 * 获取缩略图URL（如果是内网则返回原图）
 * @param {string} originalUrl - 原始图片URL或文件名
 * @param {boolean} isFileName - 是否为文件名（true）还是完整URL（false）
 * @returns {string} 缩略图URL或原图URL
 */
export function getThumbnailUrl(originalUrl, isFileName = false) {
  // 如果是本地数据（base64），直接返回
  if (!originalUrl || originalUrl.startsWith('data:')) {
    return originalUrl;
  }
  
  // 检查是否是内网地址
  if (isLocalNetwork()) {
    // 如果是文件名，需要拼接完整路径
    return isFileName ? `/api/file/${originalUrl}` : originalUrl;
  }
  
  // 计算合适的缩略图宽度（基于屏幕宽度）
  const screenWidth = window.innerWidth;
  const dpr = window.devicePixelRatio || 1;
  // 估算每列宽度（考虑列数）
  const cols = screenWidth < 600 ? 2 : (screenWidth < 1200 ? 3 : 4);
  const platSize = Math.min(Math.floor((screenWidth / cols) * dpr), 800);
  
  // 提取文件名
  const fileName = isFileName ? originalUrl : originalUrl.replace('/api/file/', '');
  
  // 使用后端缩略图 API
  return `/api/thumb/${fileName}?width=${platSize}`;
}

/**
 * SHA-256 哈希加密
 * @param {string} password - 待加密的密码
 * @returns {Promise<string>} 哈希后的十六进制字符串
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
