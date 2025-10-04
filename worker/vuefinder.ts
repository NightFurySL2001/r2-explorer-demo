import { AutoRouter, IRequest, json, error as json_error, StatusError } from 'itty-router'
import JSZip from 'jszip'

import type { R2Bucket, R2Object, R2ListOptions } from '@cloudflare/workers-types'

import type { DirEntry } from '../interfaces/vuefinder'

// Define the environment interface for type safety
interface Env {
    BUCKET: R2Bucket
}

interface PathRequest extends IRequest {
    currentDir: string
}

interface ReturnFileList {
    adapter: string
    storages: string[]
    storage_info: Record<string, any>
    dirname: string
    files: DirEntry[]
}

interface BodyItem {
    path: string
    type: 'file' | 'dir'
}

const KEEP_FILE = '.r2keepdir'
const KEEP_FILE_EXIST_RESPONSE = `${KEEP_FILE} is used as folder placeholder and not a valid name`

// Router
const router = AutoRouter({
    prefix: '/api/vuefinder',
    catch: (error: any) => {
        if (error instanceof StatusError) {
            // wrap error message in json response
            return json_error(error.status, { message: error.message })
        } else if (error instanceof Error) {
            return json_error(500, { message: error.message ?? 'Internal Server Error' })
        } else {
            return json_error(500, { message: 'Unknown error' })
        }
    },
})

const STORAGE_TYPE: string = 'r2'

// --- Private Helper Functions ---

function _guessMime(filename: string): string {
    const ext = (filename.split('.').pop() || '').toLowerCase()
    const map: Record<string, string> = {
        txt: 'text/plain',
        json: 'text/json',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        zip: 'application/zip',
        svg: 'image/svg+xml',
        pdf: 'application/pdf',
        mp4: 'video/mp4',
    }
    return map[ext] || 'text/plain'
}

function _toVuefinderResource(obj: R2Object): DirEntry {
    return {
        type: 'file',
        visibility: 'public',
        path: obj.key,
        file_size: obj.size,
        last_modified: obj.uploaded.getTime(),
        mime_type: _guessMime(obj.key),
        basename: obj.key.replace(/\/$/g, '').split('/').pop() ?? '',
        extension: obj.key.includes('.') ? (obj.key.split('.').pop() ?? '') : '',
        storage: STORAGE_TYPE,
    }
}

function _decodePath(path: string): string {
    if (!path || path === '/') return ''
    let decodedPath = path
    if (decodedPath.startsWith(`${STORAGE_TYPE}://`)) {
        decodedPath = decodedPath.slice(`${STORAGE_TYPE}://`.length)
    }
    if (decodedPath.startsWith('/')) {
        decodedPath = decodedPath.slice(1)
    }
    return decodedPath
}

async function _checkIfExists(path: string, env: Env): Promise<boolean> {
    const obj = await env.BUCKET.get(path)
    return !!obj
}

// --- Private GET Handlers ---

async function getAllFiles(request: PathRequest, env: Env) {
    const path = request.currentDir
    const options: R2ListOptions = {
        delimiter: '/',
        limit: 1000,
        prefix: path.endsWith('/') || path === '' ? path : path + '/',
    }

    const objects = await env.BUCKET.list(options)
    // loop through all files
    let truncated = objects.truncated
    let cursor = objects.truncated ? objects.cursor : undefined
    while (truncated) {
        const next = await env.BUCKET.list({
            ...options,
            cursor: cursor,
        })
        objects.objects.push(...next.objects)

        truncated = next.truncated
        cursor = next.truncated ? next.cursor : undefined
    }

    const url = new URL(request.url)
    const filter = url.searchParams.get('filter')
    let files: R2Object[] = objects.objects
    if (filter) {
        files = files.filter((obj) => obj.key.toLowerCase().includes(filter.toLowerCase()))
    }
    files.sort((a, b) => a.key.localeCompare(b.key))

    const folders: DirEntry[] = objects.delimitedPrefixes
        .map((dirpath) =>
            dirpath !== '/'
                ? {
                      type: 'dir',
                      path: dirpath.replace(/\/+$/g, ''),
                      visibility: 'public',
                      last_modified: Date.now(),
                      mime_type: 'application/vnd.directory',
                      basename: dirpath.replace(/\/$/g, '').split('/').pop() ?? '',
                      extension: '',
                      storage: STORAGE_TYPE,
                      file_size: 0,
                  }
                : null,
        )
        .filter((folder): folder is DirEntry => folder !== null)

    const result: ReturnFileList = {
        adapter: 'r2',
        storages: ['r2'],
        storage_info: {
            r2: { filesystem: 'cloudflare.r2' },
        },
        dirname: _decodePath(path).replace(/\/$/g, ''),
        files: [
            ...folders,
            ...files.filter((file) => !file.key.endsWith(KEEP_FILE)).map(_toVuefinderResource),
        ],
    }
    return json(result)
}

async function getPreview(request: PathRequest, env: Env) {
    const path = request.currentDir
    if (!path) throw new StatusError(400, 'Missing path')
    const obj = await env.BUCKET.get(path)
    if (!obj) throw new StatusError(404, 'Not found')

    return new Response(obj.body as ReadableStream<Uint8Array>, {
        headers: {
            'Content-Type': obj.httpMetadata?.contentType || _guessMime(path),
            'Content-Disposition': `inline; filename="${path.split('/').pop()}"`,
        },
    })
}

async function getDownload(request: PathRequest, env: Env) {
    const path = request.currentDir
    if (!path) throw new StatusError(400, 'Missing path')
    const obj = await env.BUCKET.get(path)
    if (!obj) throw new StatusError(404, 'Not found')

    return new Response(obj.body as ReadableStream<Uint8Array>, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
        },
    })
}

async function getSubdirs(request: PathRequest, env: Env) {
    const result = await getAllFiles(request, env)
    const folders = []
    for (const file of ((await result.json()) as any).files) {
        if (file.type === 'dir') {
            folders.push(file)
        }
    }
    return json({ folders })
}

// --- Private POST Handlers ---

async function postNewFolder(request: PathRequest, env: Env) {
    const body: { name: string } = await request.json()
    if (body.name === KEEP_FILE) {
        throw new StatusError(400, KEEP_FILE_EXIST_RESPONSE)
    }
    const name = _decodePath(`${request.currentDir}/${body.name}/${KEEP_FILE}`)
    if (await _checkIfExists(name, env)) {
        throw new StatusError(400, 'Folder already exists')
    }
    // R2 has no folders → create placeholder object
    await env.BUCKET.put(name, '')
    return getAllFiles(request, env)
}

async function postNewFile(request: PathRequest, env: Env) {
    const body: { name: string } = await request.json()
    if (body.name === KEEP_FILE) {
        throw new StatusError(400, KEEP_FILE_EXIST_RESPONSE)
    }
    const name = _decodePath(`${request.currentDir}/${body.name}`)
    if (await _checkIfExists(name, env)) {
        throw new StatusError(400, 'File already exists')
    }
    await env.BUCKET.put(name, '')
    return getAllFiles(request, env)
}

async function postRename(request: PathRequest, env: Env) {
    const body: { item: string; name: string } = await request.json()
    // check destination name
    if (body.name === KEEP_FILE) {
        throw new StatusError(400, KEEP_FILE_EXIST_RESPONSE)
    }
    // check file exists
    const src = _decodePath(body.item)
    const obj = await env.BUCKET.get(src)
    if (!obj) throw new StatusError(404, 'Not found')
    // perform rename
    const dst = _decodePath(`${request.currentDir}/${body.name}`)
    if (await _checkIfExists(dst, env)) {
        throw new StatusError(400, 'File already exists')
    }
    await env.BUCKET.put(dst, obj.body)
    await env.BUCKET.delete(src)
    return getAllFiles(request, env)
}

async function postMoveOrCopy(request: PathRequest, env: Env, endpoint: string) {
    const body: { item: string; items: BodyItem[] } = await request.json()
    const dstDir = _decodePath(body.item)
    for (const item of body.items || []) {
        const src = _decodePath(item.path)
        const obj = await env.BUCKET.get(src)
        if (!obj) continue

        const dstFilename = src.split('/').pop()
        if (dstFilename === KEEP_FILE) {
            throw new StatusError(400, KEEP_FILE_EXIST_RESPONSE)
        }
        const dst = `${dstDir}/${dstFilename}`
        if (await _checkIfExists(dst, env)) {
            throw new StatusError(400, 'File already exists')
        }
        await env.BUCKET.put(dst, obj.body)
        if (endpoint === 'POST:move') {
            await env.BUCKET.delete(src)
        }
    }
    return getAllFiles(request, env)
}

async function postDelete(request: PathRequest, env: Env) {
    const body: { items: BodyItem[] } = await request.json()
    for (const item of body.items || []) {
        if (item.type === 'file') {
            await env.BUCKET.delete(_decodePath(item.path))
        } else if (item.type === 'dir') {
            // delete all files with this prefix
            const fileprefix = _decodePath(`${request.currentDir}/${item.path}/`)
            const objects = await env.BUCKET.list({
                prefix: fileprefix,
            })
            // loop through all files
            let truncated = objects.truncated
            let cursor = objects.truncated ? objects.cursor : undefined
            while (truncated) {
                const next = await env.BUCKET.list({
                    prefix: fileprefix,
                    cursor: cursor,
                })
                objects.objects.push(...next.objects)

                truncated = next.truncated
                cursor = next.truncated ? next.cursor : undefined
            }
            for (const obj of objects.objects) {
                await env.BUCKET.delete(obj.key)
            }
        }
    }
    return getAllFiles(request, env)
}

async function postUpload(request: PathRequest, env: Env) {
    const formData: FormData = await request.formData()
    // get file first, then extract name from form field or file name
    const file = formData.get('file')
    if (!file || !(file instanceof File)) throw new StatusError(400, 'No file uploaded')

    let name = formData.get('name') || file.name
    if (typeof name !== 'string' || !name) throw new StatusError(400, 'Invalid file name')
    if (name === KEEP_FILE) {
        throw new StatusError(400, KEEP_FILE_EXIST_RESPONSE)
    }
    name = _decodePath(`${request.currentDir}/${name}`)
    // check file exists
    if (await _checkIfExists(name, env)) {
        throw new StatusError(400, 'File already exists')
    }

    const arrayBuffer = await file.arrayBuffer()
    await env.BUCKET.put(name, arrayBuffer, {
        httpMetadata: { contentType: file.type },
    })

    return json({ status: true, message: 'OK', path: name })
}

async function postArchive(request: PathRequest, env: Env) {
    const body: { name: string; items: BodyItem[] } = await request.json()
    let name = body.name || 'archive.zip'
    if (!name.endsWith('.zip')) name += '.zip'

    const items = body.items || []
    const zip = new JSZip()

    for (const item of items) {
        const obj = await env.BUCKET.get(_decodePath(item.path))
        if (obj) {
            const arrBuf = await obj.arrayBuffer()
            zip.file(item.path.split('/').pop() || 'file', arrBuf)
        }
    }

    const archive = await zip.generateAsync({ type: 'uint8array' })
    await env.BUCKET.put(name, archive, {
        httpMetadata: { contentType: 'application/zip' },
    })

    return getAllFiles(request, env)
}

async function postUnarchive(request: PathRequest, env: Env) {
    const body: { item: string } = await request.json()
    const archivePath = body.item
    const obj = await env.BUCKET.get(archivePath)
    if (!obj) throw new StatusError(404, 'Archive not found')

    const buf = await obj.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    for (const [filename, zipEntry] of Object.entries(zip.files)) {
        const content = await zipEntry.async('uint8array')
        await env.BUCKET.put(filename, content)
    }

    return getAllFiles(request, env)
}

async function postSave(request: PathRequest, env: Env) {
    const path = request.currentDir
    if (!path) throw new StatusError(400, 'Missing path')
    const body: { content: string } = await request.json()
    await env.BUCKET.put(path, body.content || '')
    return getPreview(request, env)
}

// --- Dispatcher Function ---
async function fetch(request: IRequest, env: Env) {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')
    const endpoint = `${request.method}:${q}`

    // extract the current dir path and store it in the current request object
    const pathRequest = request as PathRequest
    pathRequest.currentDir = _decodePath(url.searchParams.get('path') || '/')

    switch (endpoint) {
        // ---------- GET ----------
        case 'GET:index':
        case 'GET:search':
            return getAllFiles(pathRequest, env)
        case 'GET:preview':
            return getPreview(pathRequest, env)
        case 'GET:download':
            return getDownload(pathRequest, env)
        case 'GET:subfolders':
            return getSubdirs(pathRequest, env)

        // ---------- POST ----------
        case 'POST:newfolder':
            return postNewFolder(pathRequest, env)
        case 'POST:newfile':
            return postNewFile(pathRequest, env)
        case 'POST:rename':
            return postRename(pathRequest, env)
        case 'POST:move':
        case 'POST:copy':
            return postMoveOrCopy(pathRequest, env, endpoint)
        case 'POST:delete':
            return postDelete(pathRequest, env)
        case 'POST:upload':
            return postUpload(pathRequest, env)
        case 'POST:archive':
            return postArchive(pathRequest, env)
        case 'POST:unarchive':
            return postUnarchive(pathRequest, env)
        case 'POST:save':
            return postSave(pathRequest, env)

        default:
            throw new StatusError(400, 'Invalid endpoint')
    }
}

// --- Router binds everything to dispatcher ---
router.all('*', fetch)

export default { ...router }
