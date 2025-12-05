<script>
import { LazyImg, Waterfall } from 'vue-waterfall-plugin-next'
import Loading from 'vue-loading-overlay';
import 'vue-loading-overlay/dist/css/index.css';
import 'vue-waterfall-plugin-next/style.css'
import './common.css'
import 'https://cdn.jsdelivr.net/npm/viewerjs@1.11.1/dist/viewer.min.js'
import { getThumbnailUrl, hashPassword } from './utils.js'
import { imageLoadManager } from './sw-register.js'
export default{
    data(){
        return{
        list_all:[],   // 全量数据
        list:[],       // 显示的数据
        auth:true,
        pass:'',
        loading:false,
        cacheExpiry: 30 * 60 * 1000,
        breakpoints: {},
        resizeTimer: null,
        showScrollTop: false,
        loadBatchSize: 20,
        isLoadingMore: false,
        layoutTimer: null,  // 布局防抖定时器
        isFirstLoad: true   // 是否首次加载
        }
    },
    mounted(){
      // 注册 Service Worker
      imageLoadManager.register();
      
      // 初始化自适应布局
      this.calculateBreakpoints();
      
      const cachedPass = localStorage.getItem('list_pass');
      const passExpiry = localStorage.getItem('list_pass_expiry');
      const cachedList = localStorage.getItem('list_data');
      
      if (cachedPass && passExpiry && parseInt(passExpiry) > Date.now()) {
        this.pass = cachedPass;
        this.auth = false;
        if (cachedList) {
          this.list_all = JSON.parse(cachedList);
          // 初始化所有item的加载状态
          this.list_all.forEach(item => {
            item._imageLoading = true;
            item._actionsActive = false;
          });
          // 初始加载
          this.$nextTick(() => {
            this.loadMoreItems();
          });
        }
      }
      // 点击页面其他位置时关闭 overlay 按钮
      this._docClickHandler = (e) => {
        if (e.target.closest && e.target.closest('.media-image')) return;
        this.list.forEach(it => { if (it._actionsActive) it._actionsActive = false; });
      };
      document.addEventListener('click', this._docClickHandler);
      
      // 使用防抖处理 resize
      this._resizeHandler = () => {
        if (this.resizeTimer) {
          clearTimeout(this.resizeTimer);
        }
        this.resizeTimer = setTimeout(() => {
          this.calculateBreakpoints();
        }, 150);
      };
      window.addEventListener('resize', this._resizeHandler);
      
      // 监听滚动事件
      this._scrollHandler = () => {
        this.showScrollTop = window.scrollY > 200;
        
        // 动态加载
        if (this.isLoadingMore || this.auth) return;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        // 距离底部 800px 时加载更多
        if (scrollTop + windowHeight >= documentHeight - 800) {
          this.loadMoreItems();
        }
      };
      window.addEventListener('scroll', this._scrollHandler, { passive: true });
    },
    beforeUnmount(){
      if (this._docClickHandler) document.removeEventListener('click', this._docClickHandler);
      if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
      if (this._scrollHandler) window.removeEventListener('scroll', this._scrollHandler);
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      if (this.layoutTimer) clearTimeout(this.layoutTimer);
      imageLoadManager.disconnect();
    },
    methods:{
      loadMoreItems(){
        if (this.isLoadingMore) return;
        if (this.list.length >= this.list_all.length) return;
        
        this.isLoadingMore = true;
        const startIdx = this.list.length;
        const endIdx = Math.min(startIdx + this.loadBatchSize, this.list_all.length);
        const newItems = this.list_all.slice(startIdx, endIdx);
        
        // 追加新项
        this.list.push(...newItems);
        
        this.$nextTick(() => {
          this.isLoadingMore = false;
          
          // 设置智能预加载
          imageLoadManager.observeImages(
            this.$refs.waterfall,
            this.list,
            (name, item) => this.getThumbnailUrl(name, item?.metadata?.category)
          );
          
          // 依赖图片@load事件触发布局
        });
      },
      onImageLoad(index){
        // 标记图片加载完成
        if (this.list[index]) {
          this.list[index]._imageLoading = false;
        }
        
        // 首次加载完成后关闭遮罩
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
        }
        
        // 图片加载完成后触发布局更新（防抖）
        if (this.layoutTimer) {
          clearTimeout(this.layoutTimer);
        }
        this.layoutTimer = setTimeout(() => {
          this.$nextTick(() => {
            if (this.$refs.waterfall && this.$refs.waterfall.renderer) {
              this.$refs.waterfall.renderer();
            }
          });
        }, 100);
      },
      calculateBreakpoints(){
        // 获取设备像素比（DPI 相关）
        const dpr = window.devicePixelRatio || 1;
        // 获取视口宽度
        const viewportWidth = window.innerWidth;
        
        // 定义理想的卡片宽度范围（单位：px）
        // 考虑 DPI：高 DPI 设备上可以显示更多细节
        const minCardWidth = 150 / Math.max(dpr * 0.8, 1); // 最小卡片宽度
        const idealCardWidth = 220 / Math.max(dpr * 0.8, 1); // 理想卡片宽度
        const maxCardWidth = 320 / Math.max(dpr * 0.8, 1); // 最大卡片宽度
        
        // 卡片间距
        const gutter = 16;
        
        // 计算可以容纳的列数
        const calculateColumns = (width) => {
          // 移动端限制：屏幕宽度小于 600px 时最多 2 列
          const maxCols = width < 600 ? 2 : 8;
          
          // 尝试不同的列数，找到最接近理想卡片宽度的配置
          let bestCols = 1;
          let bestDiff = Infinity;
          
          for (let cols = 1; cols <= maxCols; cols++) {
            const totalGutter = gutter * (cols - 1);
            const availableWidth = width - totalGutter;
            const cardWidth = availableWidth / cols;
            
            // 如果卡片宽度小于最小值，跳过
            if (cardWidth < minCardWidth) continue;
            
            // 如果卡片宽度超过最大值，且列数大于1，选择更多列
            if (cardWidth > maxCardWidth && cols < maxCols) continue;
            
            // 计算与理想宽度的差距
            const diff = Math.abs(cardWidth - idealCardWidth);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestCols = cols;
            }
          }
          
          return bestCols;
        };
        
        // 生成断点配置
        const breakpoints = {};
        const breakpointWidths = [400, 600, 800, 1000, 1200, 1400, 1600, 1920, 2560];
        
        breakpointWidths.forEach(bp => {
          const cols = calculateColumns(bp);
          breakpoints[bp] = { 
            rowPerView: cols,
            // 可选：设置间距
            // gutter: gutter
          };
        });
        
        // 设置默认值（基于当前窗口宽度）
        const defaultCols = calculateColumns(Math.max(viewportWidth, 180));
        
        // 更新 breakpoints - 创建全新对象触发响应式更新
        this.breakpoints = JSON.parse(JSON.stringify({
          0: { rowPerView: Math.max(defaultCols, 1) },
          ...breakpoints
        }));
      },
      async hashPassword(password) {
        return hashPassword(password);
      },
      async query(){
        this.loading = true;
        const hashedPass = await this.hashPassword(this.pass);
        fetch(`/query?pass=${hashedPass}`,{
            method:'GET'
        }).then((response)=>{
          if (response.ok) {
            return response.json()
          }
            throw response
        }).then((succ)=>{
            this.list_all = [];
            this.list = [];
            for (let i = 0; i < succ.keys.length; i++) {
                  const it = succ.keys[i];
                  // ensure action toggle flag
                  it._actionsActive = false;
                  // 初始化图片加载状态
                  it._imageLoading = true;
                  this.list_all.push(it);
            }
            this.list_all.sort((a,b)=>{
              return b.metadata.date-a.metadata.date
            })
            localStorage.setItem('list_pass', this.pass);
            localStorage.setItem('list_pass_expiry', (Date.now() + this.cacheExpiry).toString());
            localStorage.setItem('list_data', JSON.stringify(this.list_all));
            this.auth=false
            this.loading = false;
            // 初始加载第一批数据
            this.$nextTick(() => {
              this.loadMoreItems();
            });
        }).catch((err)=>{
          mdui.alert('密码错误')
          this.loading = false;
        })
    },
    refreshCache(){
      // 从当前 this.pass 获取密码并重新查询
      const currentPass = this.pass;
      if (!currentPass) {
        mdui.alert('请先输入密码');
        return;
      }
      // 清除列表缓存，保留密码缓存以便重新查询
      localStorage.removeItem('list_data');
      this.list_all = [];
      this.list = [];
      this.query();
    },
    isImage(category) {
        return category === 'image';
    },
    getThumbnailUrl(fileName, category = 'image') {
      return getThumbnailUrl(fileName, true, category);
    },
    getFileIcon(category) {
        const iconMap = {
          'image': 'image',
          'video': 'videocam',
          'sound': 'audiotrack',
          'document': 'description',
          'other': 'insert_drive_file'
        };
        return iconMap[category] || 'insert_drive_file';
    },
    display(imageUrl, fileName){
      const startTime = Date.now();
      let loaderShown = false;
      
      // 创建加载动画元素，但先不显示
      const loader = document.createElement('div');
      loader.className = 'image-loader';
      loader.innerHTML = '<div class="spinner"></div>';
      loader.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const spinner = loader.querySelector('.spinner');
      spinner.style.cssText = 'border:4px solid #f3f3f3;border-top:4px solid #3498db;border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite;';
      
      // 添加旋转动画
      if (!document.getElementById('spin-keyframes')) {
        const style = document.createElement('style');
        style.id = 'spin-keyframes';
        style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }
      
      // 250ms后才显示加载动画
      const loaderTimeout = setTimeout(() => {
        document.body.appendChild(loader);
        loaderShown = true;
      }, 250);
      
      // 预加载原图
      const img = new Image();
      img.onload = () => {
        // 清除定时器
        clearTimeout(loaderTimeout);
        // 如果加载动画已显示，移除它
        if (loaderShown) {
          document.body.removeChild(loader);
        }
        
        // 显示预览
        const gallery = new Viewer(img, {
          title: function(image) {
            return fileName || image.alt || '';
          },
          toolbar: {
            zoomIn: 1,
            zoomOut: 1,
            oneToOne: 1,
            reset: 1,
            rotateLeft: 1,
            rotateRight: 1,
            flipHorizontal: 1,
            flipVertical: 1,
          }
        });
        gallery.show();
      };
      img.onerror = () => {
        // 清除定时器
        clearTimeout(loaderTimeout);
        // 如果加载动画已显示，移除它
        if (loaderShown) {
          document.body.removeChild(loader);
        }
        mdui.alert('图片加载失败');
      };
      img.src = imageUrl;
    },
    displayFileInfo(item) {
      // 创建弹窗
      const modal = document.createElement('div');
      modal.className = 'file-info-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity 0.3s ease, background 0.3s ease;';
      
      // 格式化文件大小
      const formatSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      };
      
      // 格式化时间
      const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      };
      
      const category = item.metadata.category || 'other';
      const icon = this.getFileIcon(category);
      const fileUrl = `/api/file/${item.name}`;
      const isImage = category === 'image';
      const thumbnailUrl = isImage ? this.getThumbnailUrl(item.name) : '';
      
      // 根据是否为图片调整布局
      const leftContent = isImage 
        ? `<div class="file-thumbnail" style="width:100%;max-width:120px;aspect-ratio:1;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.15);background:#f5f5f5;"><img src="${thumbnailUrl}" style="width:100%;height:100%;object-fit:cover;"></div>`
        : `<i class="mdui-icon material-icons" style="font-size:min(80px, 15vw);color:#666;">${icon}</i>`;
      
      const leftWidth = isImage ? 'min(120px, 25vw)' : '33.33%';
      const leftPadding = isImage ? '0' : '';
      
      modal.innerHTML = `
        <div class="file-info-content" style="background:white;border-radius:8px;width:500px;max-width:90vw;overflow:hidden;transform:scale(0.7);opacity:0;transition:transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;">
          <div class="file-info-header" style="display:flex;align-items:center;padding:min(24px, 4vw);gap:min(20px, 3vw);border-bottom:1px solid #eee;">
            <div class="file-icon-large" style="flex:0 0 ${leftWidth};display:flex;align-items:center;justify-content:center;${leftPadding}">
              ${leftContent}
            </div>
            <div class="file-actions" style="flex:1;display:flex;gap:min(12px, 2vw);justify-content:center;flex-wrap:wrap;align-content:center;">
              <button class="action-btn" data-action="copy" style="padding:8px 16px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:14px;">
                <i class="mdui-icon material-icons" style="font-size:18px;">content_copy</i>
                <span>复制</span>
              </button>
              <button class="action-btn" data-action="download" style="padding:8px 16px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:14px;">
                <i class="mdui-icon material-icons" style="font-size:18px;">get_app</i>
                <span>下载</span>
              </button>
              <button class="action-btn" data-action="delete" style="padding:8px 16px;border:none;border-radius:4px;background-color:red !important;color:white;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:14px;">
                <i class="mdui-icon material-icons" style="font-size:18px;">delete</i>
                <span>删除</span>
              </button>
            </div>
          </div>
          <div class="file-info-body" style="padding:24px;">
            <div class="info-item" style="margin-bottom:16px;">
              <div style="color:#999;font-size:12px;margin-bottom:4px;">文件名</div>
              <div style="font-size:14px;word-break:break-all;">${item.metadata.originalName || item.name}</div>
            </div>
            <div class="info-item" style="margin-bottom:16px;">
              <div style="color:#999;font-size:12px;margin-bottom:4px;">类型 (MIME)</div>
              <div style="font-size:14px;">${item.metadata.type || '未知'}</div>
            </div>
            <div class="info-item" style="margin-bottom:16px;">
              <div style="color:#999;font-size:12px;margin-bottom:4px;">大小</div>
              <div style="font-size:14px;">${formatSize(item.metadata.size || 0)}</div>
            </div>
            <div class="info-item">
              <div style="color:#999;font-size:12px;margin-bottom:4px;">上传时间</div>
              <div style="font-size:14px;">${formatDate(item.metadata.date)}</div>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // 触发动画
      const content = modal.querySelector('.file-info-content');
      setTimeout(() => {
        modal.style.opacity = '1';
        modal.style.background = 'rgba(0,0,0,0.8)';
        content.style.transform = 'scale(1)';
        content.style.opacity = '1';
      }, 10);
      
      // 点击背景关闭
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          // 关闭动画
          modal.style.opacity = '0';
          modal.style.background = 'rgba(0,0,0,0)';
          content.style.transform = 'scale(0.7)';
          content.style.opacity = '0';
          setTimeout(() => {
            document.body.removeChild(modal);
          }, 300);
        }
      });
      
      // 点击按钮事件
      const copyBtn = modal.querySelector('[data-action="copy"]');
      const downloadBtn = modal.querySelector('[data-action="download"]');
      const deleteBtn = modal.querySelector('[data-action="delete"]');
      
      copyBtn.addEventListener('click', () => {
        this.$copyText(`${window.location.origin}${fileUrl}`).then(() => {
          mdui.snackbar('复制成功');
        }, () => {
          mdui.snackbar('复制失败');
        });
      });
      
      downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = item.metadata.originalName || item.name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
      
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`确定要删除文件 "${item.metadata.originalName || item.name}" 吗？`)) return;
        
        // 关闭动画
        modal.style.opacity = '0';
        modal.style.background = 'rgba(0,0,0,0)';
        content.style.transform = 'scale(0.7)';
        content.style.opacity = '0';
        setTimeout(() => {
          document.body.removeChild(modal);
        }, 300);
        
        // 获取密码
        try {
          const pass = await this.getPassCache();
          const hashedPass = await this.hashPassword(pass);
          const deleteUrl = `/api/file/${item.name}?pass=${encodeURIComponent(hashedPass)}`;
          
          const response = await fetch(deleteUrl, { method: 'DELETE' });
          if (!response.ok) {
            throw new Error('删除请求失败');
          }
          
          // 删除成功
          const listIndex = this.list.findIndex(it => it.name === item.name);
          const listAllIndex = this.list_all.findIndex(it => it.name === item.name);
          
          if (listIndex !== -1) {
            this.list.splice(listIndex, 1);
          }
          if (listAllIndex !== -1) {
            this.list_all.splice(listAllIndex, 1);
          }
          
          localStorage.setItem('list_data', JSON.stringify(this.list_all));
          mdui.snackbar({ message: '文件已删除', position: 'bottom' });
        } catch (err) {
          console.error('删除失败:', err);
          mdui.alert('删除失败：请稍后重试');
        }
      });
    },
      toggleListActions(index){
        if (!this.list[index]) return;
        this.list[index]._actionsActive = !this.list[index]._actionsActive;
      },
      activateThenCopy(index){
        if (this.list[index]) this.list[index]._actionsActive = true;
        this.doCopy(index);
      },
      activateThenDelete(index){
        if (this.list[index]) this.list[index]._actionsActive = true;
        this.doDelete(index);
      },
      activateThenDownload(index){
        if (this.list[index]) this.list[index]._actionsActive = true;
        this.doDownload(index);
      },
    doCopy(e) {
        // mark actions active when copying from overlay
        if (this.list[e]) this.list[e]._actionsActive = true;
        this.$copyText(`${window.location.origin}/api/file/${this.list[e].name}`).then(()=>{
          mdui.snackbar('复制成功')
        },()=>{
          mdui.snackbar('复制失败')
        })
    },
    doDownload(e) {
      const item = this.list[e];
      const url = `/api/file/${item.name}`;
      const link = document.createElement('a');
      link.href = url;
      link.download = item.metadata.originalName || item.name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    async doDelete(e) {
      const item = this.list[e];
      if (!item) {
        mdui.alert('文件不存在');
        return;
      }
      // item.name 是 KV 的 key (随机生成的唯一标识)
      // item.metadata.originalName 是用户上传的原始文件名
      const kvKey = item.name; // 这是 KV 存储的 key
      const displayName = item.metadata.originalName || item.name;
      
      if (!confirm(`确定要删除文件 "${displayName}" 吗？`)) {
        return;
      }
      
      // 获取或提示密码（使用缓存）
      this.getPassCache()
        .then(async pass => {
          const hashedPass = await this.hashPassword(pass);
          const deleteUrl = `/api/file/${kvKey}?pass=${encodeURIComponent(hashedPass)}`;
          const response = await fetch(deleteUrl, { method: 'DELETE' });
          
          if (!response.ok) {
            throw new Error('删除请求失败');
          }
          
          // 删除成功，显示提示
          mdui.snackbar({
            message: '文件已删除',
            position: 'bottom'
          });
          
          // 找到并删除项目
          const listIndex = this.list.findIndex(item => item.name === kvKey);
          const listAllIndex = this.list_all.findIndex(item => item.name === kvKey);
          
          if (listIndex !== -1) {
            this.list.splice(listIndex, 1);
          }
          if (listAllIndex !== -1) {
            this.list_all.splice(listAllIndex, 1);
          }
          
          localStorage.setItem('list_data', JSON.stringify(this.list_all));
        })
        .catch(err => {
          // 捕获所有错误
          console.error('删除失败:', err);
          mdui.alert('删除失败：请稍后重试');
        });
    },

    getPassCache(){
      return new Promise((resolve, reject) => {
        const cached = localStorage.getItem('list_pass');
        const expiry = localStorage.getItem('list_pass_expiry');
        if (cached && expiry && parseInt(expiry) > Date.now()) {
          this.pass = cached;
          resolve(cached);
          return;
        }
        mdui.prompt('请输入删除密码', '密码校验', value =>{
          if (!value) { mdui.alert('需要密码'); reject(new Error('no-pass')); return; }
          this.pass = value;
          localStorage.setItem('list_pass', value);
          localStorage.setItem('list_pass_expiry', (Date.now() + 30*60*1000).toString());
          resolve(value);
        });
      });
    },

    goToUpload(){
      window.location.href = '/';
    },

    scrollToTop(){
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },
  components:{
    Waterfall,
    LazyImg,
    Loading
  }
}
</script>
<template>
  <div style="position: absolute; inset:0;">
    <Transition name="loading">
      <Loading :active="loading" loader="bars" width="50" height="50" color="rgb(0,123,255)"></Loading>
    </Transition>

    <!-- 认证界面 -->
    <div v-if="auth" class="auth-container">
      <div class="auth-box">
        <div class="auth-title">文件列表</div>
        <div class="mdui-textfield mdui-textfield-floating-label" style="width:100%">
          <label class="mdui-textfield-label">密码</label>
          <input class="mdui-textfield-input" v-model="pass" type="password" @keyup.enter="query"/>
        </div>
        <button class="mdui-btn mdui-btn-raised mdui-color-indigo mdui-text-color-white" style="margin-top: 16px; width:100%;" @click="query">查询</button>
      </div>
    </div>

    <!-- 列表界面 -->
    <div class="app-container" v-if="!auth">
      <header class="app-header">
        <div class="title">文件列表</div>
        <div style="display: flex; gap: 8px;">
          <button class="refresh-btn" @click="goToUpload" title="上传图片">
            <i class="mdui-icon material-icons">cloud_upload</i>
          </button>
          <button class="refresh-btn" @click="refreshCache" title="更新缓存">
            <i class="mdui-icon material-icons">refresh</i>
          </button>
        </div>
      </header>

      <!-- 首次加载遮罩 -->
      <div v-if="isFirstLoad && list.length > 0" class="first-load-mask">
        <div class="spinner"></div>
        <div class="loading-text">正在加载图片...</div>
      </div>

      <main class="main">
        <Waterfall 
          ref="waterfall" 
          :list="list" 
          :breakpoints="breakpoints" 
          :gutter="16"
          :hasAroundGutter="true"
          :rowKey="options => options.item.name"
          :delay="100"
          :lazyload="false"
          id="images"
        >
          <template #item="{ item, url, index }">
            <div class="mdui-card card-min">
              <div v-if="isImage(item.metadata.category)" class="mdui-card-media media-image" @click="display('/api/file/'+item.name, item.metadata.originalName || item.name)" style="cursor:pointer;">
                <!-- <div class="image-bg" :style="{ backgroundImage: 'url(' + getThumbnailUrl(item.name, item.metadata.category) + ')' }"></div> -->
                <div class="image-wrapper" :class="{loading: item._imageLoading !== false}">
                  <img 
                    :src="getThumbnailUrl(item.name, item.metadata.category)" 
                    class="preview-img"
                    :class="{loaded: item._imageLoading === false}"
                    @load="() => onImageLoad(index)"
                  />
                </div>
                <div class="overlay-actions" :class="{active: item._actionsActive}" @click.stop="toggleListActions(index)">
                  <button class="overlay-btn" @click.stop="activateThenCopy(index)">
                    <i class="mdui-icon material-icons">content_copy</i>
                  </button>
                  <button class="overlay-btn" @click.stop="activateThenDownload(index)">
                    <i class="mdui-icon material-icons">get_app</i>
                  </button>
                  <button class="overlay-btn delete" @click.stop="activateThenDelete(index)">
                    <i class="mdui-icon material-icons">delete</i>
                  </button>
                </div>
              </div>
              <div v-else class="mdui-card-media media-icon" @click="displayFileInfo(item)" style="cursor:pointer;">
                <div class="file-icon-container">
                  <i class="mdui-icon material-icons">{{ getFileIcon(item.metadata.category) }}</i>
                </div>
                <div class="overlay-actions" :class="{active: item._actionsActive}" @click.stop="toggleListActions(index)">
                  <button class="overlay-btn" @click.stop="activateThenCopy(index)">
                    <i class="mdui-icon material-icons">content_copy</i>
                  </button>
                  <button class="overlay-btn" @click.stop="activateThenDownload(index)">
                    <i class="mdui-icon material-icons">get_app</i>
                  </button>
                  <button class="overlay-btn delete" @click.stop="activateThenDelete(index)">
                    <i class="mdui-icon material-icons">delete</i>
                  </button>
                </div>
              </div>
              <div class="card-info" @click="displayFileInfo(item)" style="cursor:pointer;">
                <div class="info-row info-line">
                  <div class="left-info">
                    <div class="category-tag" :title="item.metadata.category">
                      <i class="mdui-icon material-icons" style="font-size:16px">{{ getFileIcon(item.metadata.category) }}</i>
                    </div>
                    <div class="file-name-scroll" :title="item.metadata.originalName || item.name">{{ item.metadata.originalName || item.name }}</div>
                  </div>
                  <div class="right-actions">
                    <button class="icon-btn" @click.stop="activateThenCopy(index)" title="复制">
                      <i class="mdui-icon material-icons">content_copy</i>
                    </button>
                    <button class="icon-btn" @click.stop="activateThenDownload(index)" title="下载">
                      <i class="mdui-icon material-icons">get_app</i>
                    </button>
                    <button class="icon-btn" @click.stop="activateThenDelete(index)" title="删除" style="color:#d32f2f">
                      <i class="mdui-icon material-icons">delete</i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </Waterfall>
      </main>

      <footer class="app-footer">Powered by <a href="https://github.com/iiop123/workers-image-hosting">Workers-ImageHosting</a></footer>
      
      <!-- 回到顶部按钮 -->
      <Transition name="fade">
        <button v-if="showScrollTop" class="scroll-top-btn" @click="scrollToTop" title="回到顶部">
          <i class="mdui-icon material-icons">arrow_upward</i>
        </button>
      </Transition>
    </div>
  </div>
</template>
<style>
@import 'https://cdn.jsdelivr.net/npm/viewerjs@1.11.1/dist/viewer.min.css';
:root{box-sizing:border-box}
*,*::before,*::after{box-sizing:inherit}
html,body{width:100%;height:100%;margin:0;overflow-x:hidden;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;touch-action:manipulation}
body{font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial}

.lazy__img[lazy=loading] {
  padding: 5em 0;
  width: 48px;
}

.lazy__img[lazy=loaded] {
  width: 100%;
}

.lazy__img[lazy=error] {
  padding: 5em 0;
  width: 48px;
}

/* 认证界面 - list.vue 特有 */
.auth-container{
  position: absolute;
  inset: 0;
  display:flex;
  align-items:center;
  justify-content:center;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  z-index: 10;
}
.auth-box{
  background: #fff;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.1);
  width: 90%;
  max-width: 320px;
  text-align: center;
}
.auth-title{
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
  color: #333;
}

.app-container{
  min-height:100vh;
  display:flex;
  flex-direction:column;
  background: #f7f9fb;
  max-width:100%;
  overflow-x:hidden;
}
.app-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #eceff1;
}
.title{
  font-size:18px;
  font-weight:600;
}
.refresh-btn{
  background:none;
  border:none;
  cursor:pointer;
  padding:8px;
  border-radius:50%;
  display:flex;
  align-items:center;
  justify-content:center;
  color:#1976d2;
  transition:all 0.3s ease;
}
.refresh-btn:hover{
  background:#f0f0f0;
  transform:rotate(180deg);
}
.refresh-btn .mdui-icon{
  font-size:24px;
}

.category-tag{display:flex;align-items:center;gap:4px;font-size:11px;color:#1976d2;background:#e3f2fd;padding:2px 6px;border-radius:4px;flex-shrink:0}
.icon-btn{background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;color:#1976d2;font-size:18px;transition:all 0.2s}
.icon-btn:hover{color:#1565c0;transform:scale(1.1)}
.app-footer{padding:12px;text-align:center;color:#888;font-size:13px}

/* 回到顶部按钮 */
.scroll-top-btn{
  position:fixed;
  bottom:24px;
  right:24px;
  width:56px;
  height:56px;
  border-radius:50%;
  background:#1976d2;
  color:#fff;
  border:none;
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 4px 12px rgba(25,118,210,0.4);
  transition:all 0.3s ease;
  z-index:1000;
}
.scroll-top-btn:hover{
  background:#1565c0;
  transform:translateY(-4px);
  box-shadow:0 6px 16px rgba(25,118,210,0.5);
}
.scroll-top-btn .mdui-icon{
  font-size:24px;
}

/* 淡入淡出动画 */
.fade-enter-active, .fade-leave-active{
  transition:opacity 0.3s, transform 0.3s;
}
.fade-enter-from, .fade-leave-to{
  opacity:0;
  transform:translateY(10px) scale(0.9);
}

/* responsive adjustments */
@media (max-width:600px){
  .title{font-size:16px}
  .scroll-top-btn{
    width:48px;
    height:48px;
    bottom:16px;
    right:16px;
  }
  .scroll-top-btn .mdui-icon{
    font-size:20px;
  }
  .auth-box{padding:24px}
  .auth-title{font-size:20px}
  .mdui-btn{padding:2px 6px !important;font-size:10px !important;min-width:auto !important}
  .app-header{position:sticky;top:0;z-index:60;background:#fff}
  .category-tag span{display:none}
}
</style>