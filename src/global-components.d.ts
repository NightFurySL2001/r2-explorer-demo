import 'vue'
import { VueFinder } from 'vuefinder'

declare module 'vue' {
  export interface GlobalComponents {
    VueFinder: typeof VueFinder
  }
}
