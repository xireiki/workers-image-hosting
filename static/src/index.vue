<script>
import { LazyImg, Waterfall } from 'vue-waterfall-plugin-next'
import Loading from 'vue-loading-overlay';
import 'vue-loading-overlay/dist/css/index.css';
import 'vue-waterfall-plugin-next/style.css'
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
        breakpoints: {
  1200: { //当屏幕宽度小于等于1200
    rowPerView: 4,
  },
  800: { //当屏幕宽度小于等于800
    rowPerView: 3,
  },
  500: { //当屏幕宽度小于等于500
    rowPerView: 2,
  }
}
        }
    },
    mounted(){
     const drag=document.getElementById('drag')
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
    },
    methods:{
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
          results.forEach(r => {
            if (r && r.data) {
              that.file_info.unshift({
                link: r.data.link,
                category: r.data.category || 'other'
              });
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
          if (f.size > 50 * 1024 * 1024) {
            mdui.alert('文件过大，单文件限制 50MB');
            continue;
          }
         that.status=true;
        uplist.push(up(f));
        }
        Promise.all(uplist).then(results=>{
          results.forEach(r=>{
            if (r && r.data) {
              that.file_info.unshift({ link: r.data.link, category: r.data.category || 'other' });
            }
          });
          return that.status=false
        }).catch(err=>{
            mdui.alert((err && err.response && err.response.data && err.response.data.info) || '上传失败')
        return that.status=false
        })
    },
    doCopy(e) {
        this.$copyText(this.file_info[e].link).then(()=>{
          mdui.alert('复制成功')
        },()=>{
          mdui.alert('上传中...')
        }
        )
      },
      display(e){
      const gallery = new Viewer(e);
      gallery.show()
    },
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
   
    <div style="font-weight: 300; top:20%;" class="center" v-if="powerby">
      GITHUB:<a href="https://github.com/iiop123/workers-image-hosting">Workers-ImageHosting</a>
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
    <Waterfall :list="file_info" id="images" :breakpoints="breakpoints">
  <template #item="{ item, url, index }">
    <div class="mdui-card card-min">
  <div class="mdui-card-media">
    <LazyImg :url="item.link" @click="display($event.target)" />
  </div>
  <div class="mdui-card-actions actions-row">
    <div class="meta">{{ item.category || 'other' }}</div>
    <button class="mdui-btn mdui-ripple mdui-color-indigo mdui-text-color-white" @click="doCopy(index)">复制</button>
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
.main{flex:1;padding:12px;max-width:1200px;margin:0 auto;width:100%}
.card-min{border-radius:8px;overflow:hidden}
.card-min img{width:100%;height:auto;display:block}
.actions-row{display:flex;justify-content:space-between;align-items:center;padding:8px}
.meta{font-size:12px;color:#666}
.app-footer{padding:12px;text-align:center;color:#888;font-size:13px}

/* responsive adjustments */
@media (max-width:600px){
  .title{font-size:16px}
  .upload-btn{padding:10px}
  .drop_text{font-size:14px}
}
</style>
