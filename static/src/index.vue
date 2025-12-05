<script>
import { LazyImg, Waterfall } from 'vue-waterfall-plugin-next'
import Loading from 'vue-loading-overlay';
import 'vue-loading-overlay/dist/css/index.css';
import 'vue-waterfall-plugin-next/style.css'
import './common.css'
import 'https://cdn.jsdelivr.net/npm/viewerjs@1.11.1/dist/viewer.min.js'
import axios from 'axios'

// 允许任意文件类型，前端仅做大小校验，后端负责类型与分类
export default{
    data(){
        return{
        file_info:[],
        status:false,
        over_page:false,
        powerby:true,
        breakpoints: {},
        resizeTimer: null
        }
    },
    mounted(){
      // 初始化自适应布局
      this.calculateBreakpoints();
      
      const drag=document.querySelector('.drag')
      drag.addEventListener('dragenter',(e)=>{
        e.preventDefault()
        this.over_page=true
      })
      drag.addEventListener('dragleave',(e)=>{
        e.preventDefault()
        
        if (
        e.clientX <= 0 ||
          e.clientY <= 0 ||
          e.clientX >= window.innerWidth ||
          e.clientY >= window.innerHeight
    ){
      this.over_page=false
    }
      })
      drag.addEventListener('dragover',(e)=>{
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy';
      })
      drag.addEventListener('drop',(e)=>{
        e.preventDefault()
        this.drop_upload(e)
      })
      // 点击页面其他位置时关闭所有 image overlay 按钮
      this._docClickHandler = (e) => {
        if (e.target.closest && e.target.closest('.image-wrapper')) return;
        // 关闭所有
        this.file_info.forEach(fi => {
          if (fi.actionsActive) fi.actionsActive = false;
        });
      };
      document.addEventListener('click', this._docClickHandler);
      window.addEventListener('resize', this.calculateBreakpoints);
      
      // 使用防抖处理 resize
      this._resizeHandler = () => {
        if (this.resizeTimer) {
          clearTimeout(this.resizeTimer);
        }
        this.resizeTimer = setTimeout(() => {
          this.calculateBreakpoints();
        }, 150);
      };
      window.removeEventListener('resize', this.calculateBreakpoints);
      window.addEventListener('resize', this._resizeHandler);
    },
    beforeUnmount(){
      if (this._docClickHandler) document.removeEventListener('click', this._docClickHandler);
      window.removeEventListener('resize', this.calculateBreakpoints);
    },
    beforeUnmount(){
      if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
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
    file(){
      let file_id=this.$refs.inp
      this.powerby=false
      const that=this
      let uplist=[]
       ////////
      async function up(file) {
          let f=new FormData()
          f.append('img',file)
          let UploadObj={
        method:'post',
        url:'/api',
        data:f
      }
      return axios(UploadObj)
      }
      ////

        for (let i = 0; i < file_id.files.length; i++) {
          const f = file_id.files[i];
          if (f.size > 25 * 1024 * 1024) { // 最大 50MB 前端限制
            mdui.alert('文件过大，单文件限制 50MB');
            continue;
          }
          uplist.push(up(f));
          that.status = true;
        }

        Promise.all(uplist).then(results => {
          results.forEach((r, idx) => {
            if (r && r.data) {
                const fileObj = file_id.files[idx];
                if (fileObj && r.data.category === 'image') {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    that.file_info.unshift({
                      link: r.data.link,
                      category: r.data.category || 'other',
                      localData: e.target.result,
                      name: fileObj.name || 'file'
                    });
                  };
                  reader.readAsDataURL(fileObj);
                } else {
                  that.file_info.unshift({
                    link: r.data.link,
                    category: r.data.category || 'other',
                    name: fileObj ? fileObj.name : 'file'
                  });
                }
            }
          });
            that.status = false;
        }).catch(err=>{
          mdui.alert((err && err.response && err.response.data && err.response.data.info) || '上传失败');
          that.status = false;
        })
    },
    drop_upload(files){
      let fileList = files.dataTransfer.files;
      this.powerby=false;
      const that=this;
      this.over_page=false;
      let uplist=[];
      ////////
      async function up(file) {
          let f=new FormData();
          f.append('img',file);
          let UploadObj={
        method:'post',
        url:'/api',
        data:f
      };
      return axios(UploadObj);
      }
      ////

        for (let i = 0; i < fileList.length; i++) {
          const f = fileList[i];
          if (f.size > 25 * 1024 * 1024) {
            mdui.alert('文件过大，单文件限制 25MB');
            continue;
          }
         that.status=true;
        uplist.push(up(f));
        }
        Promise.all(uplist).then(results=>{
          results.forEach((r, idx)=>{
            if (r && r.data) {
              const fileObj = fileList[idx];
              if (fileObj && r.data.category === 'image') {
                const reader = new FileReader();
                reader.onload = (e) => {
                  that.file_info.unshift({
                    link: r.data.link,
                    category: r.data.category || 'other',
                    localData: e.target.result,
                    name: fileObj.name || 'file',
                    actionsActive: false
                  });
                };
                reader.readAsDataURL(fileObj);
              } else {
                that.file_info.unshift({
                  link: r.data.link,
                  category: r.data.category || 'other',
                  name: fileObj ? fileObj.name : 'file',
                  actionsActive: false
                });
              }
            }
          });
            that.status = false;
        }).catch(err=>{
            mdui.alert((err && err.response && err.response.data && err.response.data.info) || '上传失败');
            that.status=false;
        })
    },
    toggleActions(index){
      if (!this.file_info[index]) return;
      this.$set ? this.$set(this.file_info[index], 'actionsActive', !this.file_info[index].actionsActive) : (this.file_info[index].actionsActive = !this.file_info[index].actionsActive);
    },
    activateThenCopy(index){
      if (this.file_info[index]) this.file_info[index].actionsActive = true;
      this.doCopy(index);
    },
    activateThenDelete(index){
      if (this.file_info[index]) this.file_info[index].actionsActive = true;
      this.doDelete(index);
    },
    activateThenDownload(index){
      if (this.file_info[index]) this.file_info[index].actionsActive = true;
      this.doDownload(index);
    },
    doCopy(e) {
        this.$copyText(this.file_info[e].link).then(()=>{
          mdui.snackbar('复制成功')
        },()=>{
          mdui.snackbar('复制失败')
        })
    },
    doDownload(e) {
      const item = this.file_info[e];
      if (!item) return;
      const link = document.createElement('a');
      link.href = item.link;
      link.download = item.name || 'download';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    doDelete(e) {
      const item = this.file_info[e];
      if (!item) return;
      // 从 link 中提取文件名 (link格式: /api/file/filename)
      const fileName = item.link ? item.link.split('/').pop() : item.name;
      if (!fileName) {
        mdui.alert('无法获取文件名');
        return;
      }
      if (!confirm(`确定要删除文件 "${item.name || fileName}" 吗？`)) return;
      const deleteUrl = `/api/file/${fileName}`;
      fetch(deleteUrl, { method: 'DELETE' })
        .then(response => {
          if (response.ok) return response.json();
          throw response;
        })
        .then(() => {
          mdui.alert('文件已删除');
          // 通过 link 查找并删除,避免使用可能失效的索引
          const index = this.file_info.findIndex(item => {
            const itemFileName = item.link ? item.link.split('/').pop() : item.name;
            return itemFileName === fileName;
          });
          if (index !== -1) {
            this.file_info.splice(index, 1);
          }
        })
        .catch(() => {
          mdui.alert('删除失败：请稍后重试');
        });
    },
    isImage(category) {
      return category === 'image';
    },
    getThumbnailUrl(originalUrl) {
      // 如果是本地数据（base64），直接返回
      if (!originalUrl || originalUrl.startsWith('data:')) {
        return originalUrl;
      }
      // 计算合适的缩略图宽度（基于屏幕宽度）
      const screenWidth = window.innerWidth;
      const dpr = window.devicePixelRatio || 1;
      // 估算每列宽度（考虑列数）
      const cols = screenWidth < 600 ? 2 : (screenWidth < 1200 ? 3 : 4);
      const platSize = Math.min(Math.floor((screenWidth / cols) * dpr), 800);
      
      // 使用后端缩略图 API
      // 从 /api/file/xxx 提取文件名
      const fileName = originalUrl.replace('/api/file/', '');
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
  <div id="drag" style="position: absolute; inset:0;">
    <div class="overlay flex_center" v-if="over_page">  
      <div class="drop_text flex_center">
      </div>
    </div>
    <Transition name="loading">
      <Loading :active="this.status" loader="bars" width="50" height="50" color="rgb(0,123,255)"></Loading>
    </Transition>
   
    <!-- 顶部 GitHub 链接已移除（底部保留），当没有已上传文件时显示居中大上传按钮 -->
    <div v-if="file_info.length === 0" class="empty-state">
      <div class="empty-inner">
        <button class="big-upload-btn" @click="$refs.inp.click()">
          <i class="mdui-icon material-icons">cloud_upload</i>
          <div class="btn-text">点击或拖拽文件到此处上传</div>
        </button>
        <input type="file" ref="inp" multiple @change="file" style="display:none" />
      </div>
    </div>

    <div class="app-container">
      <header class="app-header">
        <div class="title">简洁图床</div>
        <div class="actions">
          <label class="upload-btn">
            <i class="mdui-icon material-icons">cloud_upload</i>
            <input type="file" ref="inp" multiple @change="file" style="display:none" />
          </label>
        </div>
      </header>

      <main class="main">
        <Waterfall 
          ref="waterfall" 
          :list="file_info" 
          :breakpoints="breakpoints"
          :gutter="16"
          :hasAroundGutter="true"
          :rowKey="'link'"
          id="images"
        >
          <template #item="{ item, url, index }">
            <div class="mdui-card card-min">
              <div v-if="isImage(item.category)" class="mdui-card-media media-image">
                <div class="image-bg" :style="{backgroundImage: `url(${item.localData || getThumbnailUrl(item.link)})`}"></div>
                <div class="image-wrapper">
                  <img v-if="item.localData" :src="item.localData" @click="display($event.target, item.name || 'file')" class="preview-img" />
                  <LazyImg v-else :url="getThumbnailUrl(item.link)" :data-original="item.link" @click="display($event.target, item.name || 'file')" class="preview-img" />
                </div>
                <div class="overlay-actions" :class="{active: item.actionsActive}" @click.stop="toggleActions(index)">
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
                  <i class="mdui-icon material-icons">{{ getFileIcon(item.category) }}</i>
                </div>
                <div class="overlay-actions" :class="{active: item.actionsActive}" @click.stop="toggleActions(index)">
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
                    <div class="category-tag" :title="item.category">
                      <i class="mdui-icon material-icons" style="font-size:16px">{{ getFileIcon(item.category) }}</i>
                    </div>
                    <div class="file-name-scroll" :title="item.name || 'file'">{{ item.name || 'file' }}</div>
                  </div>
                  <div class="right-actions">
                    <button class="icon-btn" @click="activateThenCopy(index)" title="复制">
                      <i class="mdui-icon material-icons">content_copy</i>
                    </button>
                    <button class="icon-btn" @click="activateThenDownload(index)" title="下载">
                      <i class="mdui-icon material-icons">get_app</i>
                    </button>
                    <button class="icon-btn delete-btn" @click="activateThenDelete(index)" title="删除">
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
    </div>
  </div>
</template>
<style>
@import 'https://cdn.jsdelivr.net/npm/viewerjs@1.11.1/dist/viewer.min.css';
:root{box-sizing:border-box}
*,*::before,*::after{box-sizing:inherit}
html,body{width:100%;height:100%;margin:0;overflow-x:hidden;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;touch-action:manipulation}
body{font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial}

/* index.vue 特有样式 */
.overlay{
  background-color: rgba(0,0,0,.6);
  z-index: 40;
  position: fixed;
  inset: 0;
  display:flex;
  align-items:center;
  justify-content:center;
}
.drop_text{
  border: 2px dashed rgba(255,255,255,0.9);
  border-radius: 12px;
  padding: 20px;
  color: #fff;
  font-size: 16px;
  text-align: center;
  max-width: 75%;
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
.upload-btn{
  display:inline-flex;
  align-items:center;
  gap:8px;
  cursor:pointer;
  padding:8px 12px;
  border-radius:8px;
  background: #1976d2;
  color:#fff;
}
.upload-btn i{font-size:20px}
.app-footer{padding:12px;text-align:center;color:#888;font-size:13px}

/* empty state: centered big upload button */
.empty-state{
  position: absolute;
  inset: 0;
  display:flex;
  align-items:center;
  justify-content:center;
  z-index: 20;
  pointer-events: none;
}
.empty-inner{pointer-events: auto; text-align:center}
.big-upload-btn{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  width: 220px;
  height: 220px;
  border-radius: 16px;
  border: 2px dashed rgba(0,0,0,0.08);
  background: #ffffff;
  box-shadow: 0 6px 18px rgba(0,0,0,0.06);
  cursor:pointer;
}
.big-upload-btn .mdui-icon{font-size:48px;color:#1976d2}
.big-upload-btn .btn-text{margin-top:12px;color:#333;font-size:14px}

/* responsive adjustments */
@media (max-width:600px){
  .title{font-size:16px}
  .upload-btn{padding:10px}
  .drop_text{font-size:14px}
  .mdui-btn{padding:2px 6px !important;font-size:10px !important;min-width:auto !important}
  .app-header{position:sticky;top:0;z-index:60;background:#fff}
  .big-upload-btn{width:180px;height:180px;border-radius:12px}
  .big-upload-btn .mdui-icon{font-size:40px}
}
</style>
