import type { Component } from 'vue'
import type { Emitter } from 'mitt'
import type { RequestConfig } from './vuefinderAjax'

// MenuContext Interface
interface MenuContext {
  searchQuery: string
  items: DirEntry[]
  target: DirEntry | null
}

// Item Interface
interface ContextMenuItem {
  id: string
  title: (i18n: App['i18n']) => string // Function that takes i18n and returns a string
  action: (app: App, selectedItems: DirEntry[]) => void // Action callback that takes app and selected items
  link?: (app: App, selectedItems: DirEntry[]) => void // Optional link callback
  show: (app: App, ctx: MenuContext) => boolean // Function that checks if the item should be shown
}

interface App {
  version: string
  root: HTMLElement | null
  debug: boolean
  emitter: Emitter<any>
  storage: any
  i18n: any
  modal: any
  dragSelect: any
  requester: any
  features: string[]
  view: string
  fullScreen: boolean
  showTreeView: boolean
  pinnedFolders: string[]
  treeViewData: any[]
  selectButton: boolean
  maxFileSize: number
  theme: any
  metricUnits: boolean
  filesize: (size: number) => string
  compactListView: boolean
  persist: boolean
  showThumbnails: boolean
  loadingIndicator: string
  contextMenuItems: any[]
  customIcon: string
  fs: any
}

export interface VueFinderProps {
  id?: string
  request: string | RequestConfig
  persist?: boolean
  path?: string
  features?: boolean | string[]
  debug?: boolean
  theme?: 'system' | 'light' | 'dark'
  locale?: string
  maxHeight?: string
  maxFileSize?: string
  fullScreen?: boolean
  showTreeView?: boolean
  pinnedFolders?: string[]
  showThumbnails?: boolean
  selectButton?: SelectButton
  loadingIndicator?: 'circular' | 'linear'
  contextMenuItems?: ContextMenuItem[]
  onError?: (error: any) => void
  onSelect?: SelectEvent
  'onUpdate:path'?: UpdatePathEvent
  icon?: CustomIcon
}

export type SelectEvent = (items: DirEntry[]) => void
export type UpdatePathEvent = (path: string) => void
export type CustomIcon = (
  app: App,
  item: DirEntry,
) => { is: string | Component; props?: any } | undefined

export type DirEntryType = 'file' | 'dir'

export interface DirEntry {
  basename: string
  extension: string
  path: string
  storage: string
  type: DirEntryType
  file_size: number
  last_modified: number
  mime_type: string
  visibility: string
}

export type SelectButton = {
  /**
   * show select button
   */
  active: boolean
  /**
   * allow multiple selection
   */
  multiple: boolean
  /**
   * handle click event
   */
  click: (items: DirEntry[], event: any) => void
}

export interface StorageInfo {
  filesystem?: string
}
