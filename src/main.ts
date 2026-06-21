import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

import 'vuefinder/dist/style.css'
import VueFinder from 'vuefinder'


const app = createApp(App)
app.use(VueFinder)
app.mount('#app')
