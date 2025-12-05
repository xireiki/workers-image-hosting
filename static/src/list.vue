<script>
import { LazyImg, Waterfall } from 'vue-waterfall-plugin-next'
import Loading from 'vue-loading-overlay';
import 'vue-loading-overlay/dist/css/index.css';
import 'vue-waterfall-plugin-next/style.css'
import './common.css'
import 'https://cdn.jsdelivr.net/npm/viewerjs@1.11.1/dist/viewer.min.js'
export default{
    data(){
        return{
        list:[],
        auth:true,
        pass:'',
        loading:false,
        cacheExpiry: 30 * 60 * 1000,
        breakpoints: {},
        resizeTimer: null,
        showScrollTop: false
        }
    },
    mounted(){
      // 初始化自适应布局
      this.calculateBreakpoints();
      
      const cachedPass = localStorage.getItem('list_pass');
      const passExpiry = localStorage.getItem('list_pass_expiry');
      const cachedList = localStorage.getItem('list_data');
      
      if (cachedPass && passExpiry && parseInt(passExpiry) > Date.now()) {
        this.pass = cachedPass;
        this.auth = false;
        if (cachedList) {
          this.list = JSON.parse(cachedList);
        }
      }
      // 点击页面其他位置时关闭 overlay 按钮
      this._docClickHandler = (e) => {
        if (e.target.closest && e.target.closest('.image-wrapper')) return;
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
      };
      window.addEventListener('scroll', this._scrollHandler);
    },
    beforeUnmount(){
      if (this._docClickHandler) document.removeEventListener('click', this._docClickHandler);
      if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
      if (this._scrollHandler) window.removeEventListener('scroll', this._scrollHandler);
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
    },
    methods:{
      calculateBreakpoints(){
        // 获取设备像素比（DPI 相关）
        const dpr = window.devicePixelRatio || 1;
        // 获取视口宽度
        const viewportWidth = window.innerWidth;
        
        // 定义理想的卡片宽度范围（单位：px）
        // 考虑 DPI：高 DPI 设备上可以显示更多细节
        const minCardWidth = 180 / Math.max(dpr * 0.8, 1); // 最小卡片宽度
        const idealCardWidth = 280 / Math.max(dpr * 0.8, 1); // 理想卡片宽度
        const maxCardWidth = 400 / Math.max(dpr * 0.8, 1); // 最大卡片宽度
        
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
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hash));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
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
            this.list = [];
            for (let i = 0; i < succ.keys.length; i++) {
                  const it = succ.keys[i];
                  // ensure action toggle flag
                  it._actionsActive = false;
                  this.list.push(it);
            }
            this.list.sort((a,b)=>{
              return b.metadata.date-a.metadata.date
            })
            localStorage.setItem('list_pass', this.pass);
            localStorage.setItem('list_pass_expiry', (Date.now() + this.cacheExpiry).toString());
            localStorage.setItem('list_data', JSON.stringify(this.list));
            this.auth=false
            this.loading = false;
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
      this.list = [];
      this.query();
    },
    isImage(category) {
        return category === 'image';
    },
    getThumbnailUrl(fileName) {
      // 计算合适的缩略图宽度（基于屏幕宽度）
      const screenWidth = window.innerWidth;
      const dpr = window.devicePixelRatio || 1;
      // 估算每列宽度（考虑列数）
      const cols = screenWidth < 600 ? 2 : (screenWidth < 1200 ? 3 : 4);
      const platSize = Math.min(Math.floor((screenWidth / cols) * dpr), 800);
      
      // 使用后端缩略图 API
      return `/api/thumb/${fileName}?width=${platSize}`;
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
    display(e, fileName){
      const gallery = new Viewer(e, {
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
      this.getPassCache().then(async pass => {
        const hashedPass = await this.hashPassword(pass);
        const deleteUrl = `/api/file/${kvKey}?pass=${encodeURIComponent(hashedPass)}`;
        return fetch(deleteUrl, { method: 'DELETE' });
      })
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw response;
      })
      .then(data => {
        mdui.alert('文件已删除');
        // 通过 KV key 查找并删除，避免使用可能失效的索引
        const index = this.list.findIndex(item => item.name === kvKey);
        if (index !== -1) {
          this.list.splice(index, 1);
          localStorage.setItem('list_data', JSON.stringify(this.list));
        }
      })
      .catch(err => {
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

      <main class="main">
        <Waterfall 
          ref="waterfall" 
          :list="list" 
          :breakpoints="breakpoints" 
          :gutter="16"
          :hasAroundGutter="true"
          :rowKey="'name'"
          id="images"
        >
          <template #item="{ item, url, index }">
            <div class="mdui-card card-min">
              <div v-if="isImage(item.metadata.category)" class="mdui-card-media media-image">
                <div class="image-bg" :style="{ backgroundImage: 'url(' + getThumbnailUrl(item.name) + ')' }"></div>
                <div class="image-wrapper">
                  <LazyImg :url="getThumbnailUrl(item.name)" :data-original="'/api/file/'+item.name" @click="display($event.target, item.metadata.originalName || item.name)" class="preview-img"></LazyImg>
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
              <div v-else class="mdui-card-media media-icon">
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
              <div class="card-info">
                <div class="info-row info-line">
                  <div class="left-info">
                    <div class="category-tag" :title="item.metadata.category">
                      <i class="mdui-icon material-icons" style="font-size:16px">{{ getFileIcon(item.metadata.category) }}</i>
                    </div>
                    <div class="file-name-scroll" :title="item.metadata.originalName || item.name">{{ item.metadata.originalName || item.name }}</div>
                  </div>
                  <div class="right-actions">
                    <button class="icon-btn" @click="activateThenCopy(index)" title="复制">
                      <i class="mdui-icon material-icons">content_copy</i>
                    </button>
                    <button class="icon-btn" @click="activateThenDownload(index)" title="下载">
                      <i class="mdui-icon material-icons">get_app</i>
                    </button>
                    <button class="icon-btn" @click="activateThenDelete(index)" title="删除" style="color:#d32f2f">
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