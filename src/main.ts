import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

import 'vuefinder/dist/style.css'
// @ts-expect-error: ignore missing types
import VueFinder from 'vuefinder/dist/vuefinder'


const app = createApp(App)
app.use(VueFinder)
app.mount('#app')
