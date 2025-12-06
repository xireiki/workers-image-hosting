<script>
import { Buffer } from 'buffer';
window.Buffer = Buffer;

import { LazyImg, Waterfall } from 'vue-waterfall-plugin-next'
import Loading from 'vue-loading-overlay';
import 'vue-loading-overlay/dist/css/index.css';
import 'vue-waterfall-plugin-next/style.css'
import './common.css'
import 'https://cdn.jsdelivr.net/npm/viewerjs@1.11.1/dist/viewer.min.js'
import axios from 'axios'
import { getThumbnailUrl, hashPassword } from './utils.js'
import { imageLoadManager } from './sw-register.js'
import * as mm from 'music-metadata-browser';

// 允许任意文件类型，前端仅做大小校验，后端负责类型与分类
export default{
    data(){
        return{
        file_info_all:[],  // 全量数据
        file_info:[],      // 显示的数据
        status:false,
        over_page:false,
        powerby:true,
        breakpoints: {},
        resizeTimer: null,
        loadBatchSize: 20, // 每次加载数量
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
      
      const drag=document.querySelector('#drag')
      if (drag) {
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
      }
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
      
      // 添加滚动监听
      this._scrollHandler = () => {
        if (this.isLoadingMore) return;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        // 距离底部 800px 时加载更多
        if (scrollTop + windowHeight >= documentHeight - 800) {
          this.loadMoreItems();
        }
      };
      window.addEventListener('scroll', this._scrollHandler, { passive: true });
      
      // 初始加载
      this.loadMoreItems();
    },
    beforeUnmount(){
      if (this._docClickHandler) document.removeEventListener('click', this._docClickHandler);
      window.removeEventListener('resize', this.calculateBreakpoints);
      imageLoadManager.disconnect();
    },
    beforeUnmount(){
      if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
      if (this._scrollHandler) window.removeEventListener('scroll', this._scrollHandler);
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      if (this.layoutTimer) clearTimeout(this.layoutTimer);
    },
    methods:{
      async extractMediaCover(fileUrl) {
        try {
          const response = await fetch(fileUrl, {
            headers: { 'Range': 'bytes=0-2097151' }
          });
          
          if (!response.ok && response.status !== 206) {
            return null;
          }
          
          const blob = await response.blob();
          
          try {
            const metadata = await mm.parseBlob(blob, { skipCovers: false });
            
            if (metadata.common?.picture && metadata.common.picture.length > 0) {
              const picture = metadata.common.picture[0];
              const coverBlob = new Blob([picture.data], { type: picture.format });
              return URL.createObjectURL(coverBlob);
            }
          } catch (metadataError) {
            console.log('Metadata parsing failed');
          }
          
          return null;
        } catch (error) {
          console.warn('Failed to extract cover:', error);
          return null;
        }
      },
      
      async extractVideoFrame(fileUrl) {
        return new Promise((resolve) => {
          const video = document.createElement('video');
          video.crossOrigin = 'anonymous';
          video.preload = 'metadata';
          
          video.addEventListener('loadeddata', () => {
            video.currentTime = 1;
          });
          
          video.addEventListener('seeked', () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(URL.createObjectURL(blob));
              } else {
                resolve(null);
              }
              video.src = '';
            }, 'image/jpeg', 0.8);
          });
          
          video.addEventListener('error', () => {
            resolve(null);
          });
          
          video.src = fileUrl;
        });
      },
    loadMoreItems(){
      if (this.isLoadingMore) return;
      if (this.file_info.length >= this.file_info_all.length) return;
      
      this.isLoadingMore = true;
      const startIdx = this.file_info.length;
      const endIdx = Math.min(startIdx + this.loadBatchSize, this.file_info_all.length);
      const newItems = this.file_info_all.slice(startIdx, endIdx);
      
      // 追加新项
      this.file_info.push(...newItems);
      
      this.$nextTick(() => {
        this.isLoadingMore = false;
        
        // 设置智能预加载
        imageLoadManager.observeImages(
          this.$refs.waterfall,
          this.file_info,
          (link, item) => this.getThumbnailUrl(link, item?.category)
        );
        
        // 依赖图片@load事件触发布局
      });
    },
    onImageLoad(index){
      // 标记图片加载完成
      if (this.file_info[index]) {
        this.file_info[index]._imageLoading = false;
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
    file(){
      let file_id=this.$refs.inp
      this.powerby=false
      const that=this
      let uplist=[]
       ////////
      async function up(file) {
          let f=new FormData()
          f.append('img',file)
          const pass = sessionStorage.getItem('pass');
          if (pass) {
            f.append('pass', pass);
          }
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
          uplist.push(up(f));
          that.status = true;
        }

        Promise.all(uplist).then(async results => {
          for (let idx = 0; idx < results.length; idx++) {
            const r = results[idx];
            if (r && r.data) {
                const fileObj = file_id.files[idx];
                if (fileObj && r.data.category === 'image') {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const newItem = {
                      link: r.data.link,
                      category: r.data.category || 'other',
                      localData: e.target.result,
                      name: fileObj.name || 'file',
                      deleteToken: r.data.deleteToken,
                      _imageLoading: true,
                      actionsActive: false
                    };
                    that.file_info_all.unshift(newItem);
                    that.file_info.unshift(newItem);
                  };
                  reader.readAsDataURL(fileObj);
                } else {
                  const newItem = {
                    link: r.data.link,
                    category: r.data.category || 'other',
                    name: fileObj ? fileObj.name : 'file',
                    deleteToken: r.data.deleteToken,
                    _imageLoading: false,
                    actionsActive: false
                  };
                  
                  // 为音视频提取封面
                  if (r.data.category === 'video') {
                    const coverUrl = await that.extractVideoFrame(r.data.link);
                    if (coverUrl) {
                      newItem.coverUrl = coverUrl;
                    }
                  } else if (r.data.category === 'sound') {
                    const coverUrl = await that.extractMediaCover(r.data.link);
                    if (coverUrl) {
                      newItem.coverUrl = coverUrl;
                    }
                  }
                  
                  that.file_info_all.unshift(newItem);
                  that.file_info.unshift(newItem);
                }
            }
          }
            that.status = false;
            // 上传完成后关闭首次加载遮罩
            that.isFirstLoad = false;
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
          const pass = sessionStorage.getItem('pass');
          if (pass) {
            f.append('pass', pass);
          }
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
         that.status=true;
        uplist.push(up(f));
        }
        Promise.all(uplist).then(async results=>{
          for (let idx = 0; idx < results.length; idx++) {
            const r = results[idx];
            if (r && r.data) {
              const fileObj = fileList[idx];
              if (fileObj && r.data.category === 'image') {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const newItem = {
                    link: r.data.link,
                    category: r.data.category || 'other',
                    localData: e.target.result,
                    name: fileObj.name || 'file',
                    actionsActive: false,
                    deleteToken: r.data.deleteToken,
                    _imageLoading: true
                  };
                  that.file_info_all.unshift(newItem);
                  that.file_info.unshift(newItem);
                };
                reader.readAsDataURL(fileObj);
              } else {
                const newItem = {
                  link: r.data.link,
                  category: r.data.category || 'other',
                  name: fileObj ? fileObj.name : 'file',
                  actionsActive: false,
                  deleteToken: r.data.deleteToken,
                  _imageLoading: false
                };
                
                // 为音视频提取封面
                if (r.data.category === 'video') {
                  const coverUrl = await that.extractVideoFrame(r.data.link);
                  if (coverUrl) {
                    newItem.coverUrl = coverUrl;
                  }
                } else if (r.data.category === 'sound') {
                  const coverUrl = await that.extractMediaCover(r.data.link);
                  if (coverUrl) {
                    newItem.coverUrl = coverUrl;
                  }
                }
                
                that.file_info_all.unshift(newItem);
                that.file_info.unshift(newItem);
              }
            }
          }
            that.status = false;
            // 上传完成后关闭首次加载遮罩
            that.isFirstLoad = false;
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
      
      // 检查是否有 deleteToken
      if (!item.deleteToken) {
        mdui.alert('无法删除：缺少删除权限（token）');
        return;
      }
      
      if (!confirm(`确定要删除文件 "${item.name || fileName}" 吗？`)) return;
      
      // 使用 token 删除
      const deleteUrl = `/api/file/${fileName}?token=${encodeURIComponent(item.deleteToken)}`;
      
      fetch(deleteUrl, { method: 'DELETE' })
        .then(async response => {
          if (!response.ok) {
            throw new Error('删除请求失败');
          }
          
          // 删除成功，显示提示
          mdui.snackbar({
            message: '文件已删除',
            position: 'bottom'
          });
          
          // 找到并删除项目
          const fileInfoIndex = this.file_info.findIndex(item => {
            const itemFileName = item.link ? item.link.split('/').pop() : item.name;
            return itemFileName === fileName;
          });
          const fileInfoAllIndex = this.file_info_all.findIndex(item => {
            const itemFileName = item.link ? item.link.split('/').pop() : item.name;
            return itemFileName === fileName;
          });
          
          if (fileInfoIndex !== -1) {
            this.file_info.splice(fileInfoIndex, 1);
          }
          if (fileInfoAllIndex !== -1) {
            this.file_info_all.splice(fileInfoAllIndex, 1);
          }
        })
        .catch(err => {
          console.error('删除失败:', err);
          mdui.alert('删除失败：请稍后重试');
        });
    },
    isImage(category) {
      return category === 'image';
    },
    getThumbnailUrl(originalUrl, category = 'image') {
      return getThumbnailUrl(originalUrl, false, category);
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
    displayVideo(videoUrl, fileName) {
      // 预加载视频获取尺寸
      const video = document.createElement('video');
      video.src = videoUrl;
      video.preload = 'metadata';
      
      video.addEventListener('loadedmetadata', () => {
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const aspectRatio = videoWidth / videoHeight;
        
        // 计算视口可用区域（留出边距和标题栏空间）
        const viewportWidth = window.innerWidth - 40; // 左右20px padding
        const viewportHeight = window.innerHeight - 120; // 上下60px padding + 标题栏
        
        let playerWidth, playerHeight;
        
        // 根据视频宽高比和视口大小计算最佳播放器尺寸
        if (aspectRatio > viewportWidth / viewportHeight) {
          // 视频更宽，以宽度为基准
          playerWidth = Math.min(videoWidth, viewportWidth);
          playerHeight = playerWidth / aspectRatio;
        } else {
          // 视频更高或接近方形，以高度为基准
          playerHeight = Math.min(videoHeight, viewportHeight);
          playerWidth = playerHeight * aspectRatio;
        }
        
        const modal = document.createElement('div');
        modal.className = 'media-player-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;padding:20px;';
        
        modal.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;color:white;">
              <h3 style="margin:0;font-size:18px;">${fileName || '视频播放'}</h3>
              <button class="close-btn" style="background:rgba(255,255,255,0.2);border:none;color:white;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:20px;">&times;</button>
            </div>
            <video controls autoplay style="width:${playerWidth}px;height:${playerHeight}px;background:#000;border-radius:8px;">
              <source src="${videoUrl}" type="video/mp4">
              您的浏览器不支持视频播放。
            </video>
          </div>
        `;
        
        document.body.appendChild(modal);
        
        const closeBtn = modal.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => {
          document.body.removeChild(modal);
        });
        
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            document.body.removeChild(modal);
          }
        });
      });
    },
    async displayAudio(audioUrl, fileName) {
      const modal = document.createElement('div');
      modal.className = 'media-player-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;overflow:auto;';
      
      // 尝试获取音频元数据
      let metadata = {
        title: fileName || '未知歌曲',
        artist: '加载中...',
        album: '加载中...',
        duration: 0
      };
      
      modal.innerHTML = `
        <div style="width:100%;max-width:800px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
          <div style="padding:32px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
              <h3 style="margin:0;color:white;font-size:24px;font-weight:600;">音频播放器</h3>
              <button class="close-btn" style="background:rgba(255,255,255,0.2);border:none;color:white;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:24px;transition:all 0.3s;">&times;</button>
            </div>
            
            <div style="background:rgba(255,255,255,0.1);border-radius:12px;padding:24px;margin-bottom:24px;">
              <div class="song-info" style="color:white;margin-bottom:16px;">
                <div style="font-size:20px;font-weight:600;margin-bottom:8px;" class="song-title">${metadata.title}</div>
                <div style="font-size:14px;opacity:0.9;" class="song-artist">${metadata.artist}</div>
                <div style="font-size:12px;opacity:0.7;margin-top:4px;" class="song-album">专辑: ${metadata.album}</div>
              </div>
              
              <audio controls autoplay style="width:100%;margin-bottom:16px;" class="audio-player">
                <source src="${audioUrl}">
                您的浏览器不支持音频播放。
              </audio>
              
              <div class="audio-meta" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;color:white;font-size:12px;opacity:0.8;">
                <div>文件名: <span class="meta-filename">${fileName}</span></div>
                <div>时长: <span class="meta-duration">--:--</span></div>
              </div>
            </div>
            
            <div class="lyrics-container" style="background:rgba(255,255,255,0.1);border-radius:12px;padding:20px;max-height:300px;overflow-y:auto;color:white;position:relative;z-index:1;">
              <div class="lyrics-title" style="font-size:14px;font-weight:600;margin-bottom:12px;opacity:0.9;">歌词</div>
              <div class="lyrics-content" style="font-size:14px;line-height:2;opacity:0.8;text-align:center;position:relative;">
                <p style="margin:0;opacity:0.5;">暂无歌词</p>
              </div>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const audio = modal.querySelector('.audio-player');
      const durationEl = modal.querySelector('.meta-duration');
      const titleEl = modal.querySelector('.song-title');
      const artistEl = modal.querySelector('.song-artist');
      const albumEl = modal.querySelector('.song-album');
      const lyricsEl = modal.querySelector('.lyrics-content');
      
      // 歌词点击跳转
      lyricsEl.addEventListener('click', (e) => {
        const lyricGroup = e.target.closest('.lyric-group');
        
        if (lyricGroup) {
          const time = parseFloat(lyricGroup.getAttribute('data-time'));
          
          if (!isNaN(time) && audio && time >= 0 && time <= audio.duration) {
            audio.currentTime = time;
            resetInteractionTimer();
          }
        }
      });
      
      let lyricsData = [];
      
      // 解析 LRC 格式歌词
      const parseLRC = (lrcText) => {
        const lines = lrcText.split('\n');
        const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
        
        // 第一遍：解析所有带时间轴的行
        const lyricsMap = new Map();
        
        lines.forEach(line => {
          const matches = [...line.matchAll(timeRegex)];
          if (matches.length > 0) {
            const text = line.replace(timeRegex, '').trim();
            // 跳过元数据行和空行
            if (text && !text.startsWith('//') && !/^(ti|ar|al|by|offset):/.test(text)) {
              matches.forEach(match => {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;
                const time = minutes * 60 + seconds + ms / 1000;
                const timeKey = time.toFixed(2);
                
                if (!lyricsMap.has(timeKey)) {
                  lyricsMap.set(timeKey, { time, text: '', translation: '' });
                }
                
                // 如果当前位置已有原文，则这是翻译
                if (lyricsMap.get(timeKey).text) {
                  lyricsMap.get(timeKey).translation = text;
                } else {
                  lyricsMap.get(timeKey).text = text;
                }
              });
            }
          }
        });
        
        // 转换为数组并排序
        return Array.from(lyricsMap.values())
          .sort((a, b) => a.time - b.time);
      };
      
      // 用户交互状态管理
      let userInteracting = false;
      let interactionTimer = null;
      
      // 更新当前歌词高亮
      const updateLyrics = () => {
        if (lyricsData.length === 0) return;
        
        const currentTime = audio.currentTime;
        let currentIndex = -1;
        
        for (let i = 0; i < lyricsData.length; i++) {
          if (currentTime >= lyricsData[i].time) {
            currentIndex = i;
          } else {
            break;
          }
        }
        
        const lyricGroups = lyricsEl.querySelectorAll('.lyric-group');
        lyricGroups.forEach((group, index) => {
          const mainLine = group.querySelector('.lyric-main');
          const transLine = group.querySelector('.lyric-trans');
          
          if (index === currentIndex) {
            mainLine.style.opacity = '1';
            mainLine.style.fontWeight = '600';
            mainLine.style.transform = 'scale(1.05)';
            if (transLine) {
              transLine.style.opacity = '1';
              transLine.style.fontWeight = '600';
              transLine.style.transform = 'scale(1.05)';
            }
            // 只在非用户交互状态下自动滚动
            if (!userInteracting) {
              group.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } else {
            mainLine.style.opacity = '0.5';
            mainLine.style.fontWeight = 'normal';
            mainLine.style.transform = 'scale(1)';
            if (transLine) {
              transLine.style.opacity = '0.5';
              transLine.style.fontWeight = 'normal';
              transLine.style.transform = 'scale(1)';
            }
          }
        });
      };
      
      // 重置交互状态的函数
      const resetInteractionTimer = () => {
        userInteracting = true;
        if (interactionTimer) {
          clearTimeout(interactionTimer);
        }
        interactionTimer = setTimeout(() => {
          userInteracting = false;
        }, 3000);
      };
      
      // 解析音频元数据
      try {
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        
        const parsedMetadata = await mm.parseBlob(blob);
        
        if (parsedMetadata.common.title) {
          titleEl.textContent = parsedMetadata.common.title;
        }
        if (parsedMetadata.common.artist) {
          artistEl.textContent = parsedMetadata.common.artist;
        }
        if (parsedMetadata.common.album) {
          albumEl.textContent = `专辑: ${parsedMetadata.common.album}`;
        }
        
        // 解析歌词
        if (parsedMetadata.native) {
          for (const format in parsedMetadata.native) {
            const usltTag = parsedMetadata.native[format].find(tag => tag.id === 'USLT' || tag.id === 'LYRICS');
            if (usltTag) {
              let lyricsText = '';
              if (usltTag.value && usltTag.value.text) {
                lyricsText = usltTag.value.text;
              } else if (typeof usltTag.value === 'string') {
                lyricsText = usltTag.value;
              }
              if (lyricsText) {
                // 判断是否为 LRC 格式
                if (lyricsText.includes('[') && /\[\d{2}:\d{2}/.test(lyricsText)) {
                  lyricsData = parseLRC(lyricsText);
                  
                  lyricsEl.innerHTML = lyricsData.map((line, index) => {
                    let html = `<div class="lyric-group" data-index="${index}" data-time="${line.time}" style="margin:12px 0;cursor:pointer;user-select:none;">`;
                    
                    // 主歌词
                    html += `<p class="lyric-main" style="margin:0;opacity:0.6;transition:all 0.3s;font-size:16px;line-height:1.4;pointer-events:none;">${line.text || '&nbsp;'}</p>`;
                    
                    // 注音（如果有）
                    if (line.phonetic) {
                      html += `<p class="lyric-phonetic" style="margin:1px 0 0 0;opacity:0.4;transition:all 0.3s;font-size:12px;color:#ddd;line-height:1.3;pointer-events:none;">${line.phonetic}</p>`;
                    }
                    
                    // 翻译（如果有）
                    if (line.translation) {
                      html += `<p class="lyric-trans" style="margin:1px 0 0 0;opacity:0.5;transition:all 0.3s;font-size:13px;color:#e0e0e0;line-height:1.4;pointer-events:none;">${line.translation}</p>`;
                    }
                    
                    html += `</div>`;
                    return html;
                  }).join('');
                  
                  console.log('Lyrics HTML generated, groups count:', lyricsEl.querySelectorAll('.lyric-group').length);
                  
                  // 监听歌词容器的滚动事件
                  lyricsEl.addEventListener('wheel', resetInteractionTimer);
                  lyricsEl.addEventListener('touchmove', resetInteractionTimer);
                  lyricsEl.addEventListener('scroll', resetInteractionTimer);
                  
                  // 监听歌词容器的失焦事件
                  lyricsEl.addEventListener('mouseleave', resetInteractionTimer);
                  
                  // 监听用户手动调节播放进度
                  audio.addEventListener('seeking', resetInteractionTimer);
                  audio.addEventListener('seeked', resetInteractionTimer);
                  
                  // 监听播放进度
                  audio.addEventListener('timeupdate', updateLyrics);
                } else {
                  // 普通文本歌词
                  lyricsEl.innerHTML = lyricsText.split('\n').map(line => 
                    `<p style="margin:8px 0;opacity:0.8;transition:opacity 0.3s;">${line || '&nbsp;'}</p>`
                  ).join('');
                }
                break;
              }
            }
          }
        }
      } catch (error) {
        console.error('解析音频元数据失败:', error);
        artistEl.textContent = '未知艺术家';
        albumEl.textContent = '专辑: 未知专辑';
      }
      
      // 更新时长
      const updateDuration = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          const duration = audio.duration;
          const minutes = Math.floor(duration / 60);
          const seconds = Math.floor(duration % 60);
          durationEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
      };
      
      // 如果已经加载完成，立即更新
      if (audio.readyState >= 1) {
        updateDuration();
      }
      
      // 监听加载完成事件
      audio.addEventListener('loadedmetadata', updateDuration);
      audio.addEventListener('durationchange', updateDuration);
      
      const closeBtn = modal.querySelector('.close-btn');
      closeBtn.addEventListener('click', () => {
        audio.pause();
        document.body.removeChild(modal);
      });
      
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.3)';
        closeBtn.style.transform = 'rotate(90deg)';
      });
      
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.2)';
        closeBtn.style.transform = 'rotate(0deg)';
      });
      
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          audio.pause();
          document.body.removeChild(modal);
        }
      });
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

      <!-- 首次加载遮罩 -->
      <div v-if="isFirstLoad && file_info.length > 0" class="first-load-mask">
        <div class="spinner"></div>
        <div class="loading-text">正在加载图片...</div>
      </div>

      <main class="main">
        <Waterfall 
          ref="waterfall" 
          :list="file_info" 
          :breakpoints="breakpoints"
          :gutter="16"
          :hasAroundGutter="true"
          :rowKey="options => options.item.link"
          :delay="100"
          :lazyload="false"
          id="images"
        >
          <template #item="{ item, url, index }">
            <div class="mdui-card card-min">
              <div v-if="isImage(item.category)" class="mdui-card-media media-image">
                <!-- <div class="image-bg" :style="{backgroundImage: `url(${item.localData || getThumbnailUrl(item.link, item.category)})`}"></div> -->
                <div class="image-wrapper" :class="{loading: item._imageLoading !== false}">
                  <img 
                    v-if="item.localData" 
                    :src="item.localData" 
                    @click="display(item.localData, item.name || 'file')" 
                    class="preview-img"
                    :class="{loaded: item._imageLoading === false}"
                    @load="() => onImageLoad(index)"
                  />
                  <img 
                    v-else
                    :src="getThumbnailUrl(item.link, item.category)" 
                    @click="display(item.link, item.name || 'file')" 
                    class="preview-img"
                    :class="{loaded: item._imageLoading === false}"
                    @load="() => onImageLoad(index)"
                  />
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
              <div v-else-if="item.category === 'video'" class="mdui-card-media media-image" @click="displayVideo(item.link, item.name || 'video')" style="cursor:pointer;">
                <div v-if="item.coverUrl" class="image-wrapper">
                  <img :src="item.coverUrl" class="preview-img loaded" />
                  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.5);border-radius:50%;width:60px;height:60px;display:flex;align-items:center;justify-content:center;">
                    <i class="mdui-icon material-icons" style="color:white;font-size:36px;">play_arrow</i>
                  </div>
                </div>
                <div v-else class="file-icon-container">
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
              <div v-else-if="item.category === 'sound'" class="mdui-card-media media-image" @click="displayAudio(item.link, item.name || 'audio')" style="cursor:pointer;">
                <div v-if="item.coverUrl" class="image-wrapper">
                  <img :src="item.coverUrl" class="preview-img loaded" />
                  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.5);border-radius:50%;width:60px;height:60px;display:flex;align-items:center;justify-content:center;">
                    <i class="mdui-icon material-icons" style="color:white;font-size:36px;">music_note</i>
                  </div>
                </div>
                <div v-else class="file-icon-container">
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
