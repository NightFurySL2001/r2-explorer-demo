import {
    Router, error as json_error, json, StatusError, type IRequestStrict, type RequestHandler
} from 'itty-router'
import { Zip, ZipDeflate, unzip } from 'fflate';

import type {
    DirEntry,
    SearchParams,
    TransferParams,
    SaveParams,
    RenameParams,
    DeleteParams,
    ArchiveParams,
    UnarchiveParams,
    FileOperationResult,
} from 'vuefinder';

import type {
    UploadRequest,
    CreateItemRequest,
    ErrorResponse as VuefinderErrorResponse,
} from './route-types'

/***** Cloudflare R2 Interactions *****/

const KEEP_FILE = '.r2keepdir'
const STORAGE_TYPE = 'r2'
const SYSTEM_FILE_METADATA_KEY = 'systemFile'
const SYSTEM_FILE_METADATA_VALUE = 'true'

function _isSystemKeepFile(obj: Pick<R2Object, 'key' | 'customMetadata'>): boolean {
    return obj.key.endsWith(KEEP_FILE) && obj.customMetadata?.[SYSTEM_FILE_METADATA_KEY] === SYSTEM_FILE_METADATA_VALUE
}

function _guessMime(filename: string): string | undefined {
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
    return map[ext]
}

function _addStoragePrefix(path: string): string {
    if (!path || path === '/') return `${STORAGE_TYPE}://`

    return path.startsWith(`${STORAGE_TYPE}://`)
        ? path
        : `${STORAGE_TYPE}://${path.replace(/^\/+/, '')}`
}

function _removeStoragePrefix(path: string): string {
    if (path === '/') return ''

    const withoutPrefix = path.startsWith(`${STORAGE_TYPE}://`)
        ? path.slice(`${STORAGE_TYPE}://`.length)
        : path

    return withoutPrefix.replace(/^\/+/, '')
}

function _toVuefinderResource(obj: R2Object): DirEntry {
    return {
        type: 'file',
        visibility: 'public',
        dir: _addStoragePrefix(obj.key.split('/').slice(0, -1).join('/')),
        path: _addStoragePrefix(obj.key),
        file_size: obj.size,
        last_modified: obj.uploaded.getTime(),
        mime_type: obj.httpMetadata?.contentType || _guessMime(obj.key) || 'application/octet-stream',
        basename: obj.key.replace(/\/$/g, '').split('/').pop() ?? '',
        extension: obj.key.includes('.') ? (obj.key.split('.').pop() ?? '') : '',
        storage: STORAGE_TYPE,
    }
}

async function _checkIfExists(path: string, env: Env): Promise<boolean> {
    const obj = await env.BUCKET.get(path)
    return !!obj
}

async function _createNewFolderPlaceholder(env: Env, path: string): Promise<void> {
    path = _removeStoragePrefix(path)
    if (path.endsWith('/')) path = path.slice(0, -1)

    const newFolderKey = _removeStoragePrefix(`${path}/${KEEP_FILE}`)
    if (await _checkIfExists(newFolderKey, env)) {
        throw new StatusError(400, 'Folder already exists')
    }
    await env.BUCKET.put(newFolderKey, '', {
        httpMetadata: { contentType: 'text/plain' },
        customMetadata: {
            [SYSTEM_FILE_METADATA_KEY]: SYSTEM_FILE_METADATA_VALUE,
        },
    })
}

/**
 * List all files in a directory including subdirectories, return as raw R2Objects without converting to Vuefinder resource format. This is used for internal operations like delete and archive where we need to preserve the original metadata and structure of the files in R2, and we don't want to filter out system keep files which are needed to preserve folder structure during deletion and archiving.
 * @param env 
 * @param currentDir 
 * @returns list of R2Objects in the directory and its subdirectories
 */
async function _getAllFilesInDir(env: Env, currentDir: string): Promise<R2Object[]> {
    currentDir = _removeStoragePrefix(currentDir)
    const options: R2ListOptions = {
        limit: 1000, // fixed limit to 1000, as R2 has a maximum limit of 1000 per request
        include: ['httpMetadata', 'customMetadata'],
        prefix: currentDir.endsWith('/') || currentDir === '' ? currentDir : `${currentDir}/`,
    }

    const listed = await env.BUCKET.list(options)
    let truncated = listed.truncated
    let cursor = listed.truncated ? listed.cursor : undefined
    while (truncated) {
        const next = await env.BUCKET.list({
            ...options,
            cursor,
        })
        listed.objects.push(...next.objects)

        truncated = next.truncated
        cursor = next.truncated ? next.cursor : undefined
    }

    return listed.objects
}

/**
 * List files in a directory (non-recursive) and convert to Vuefinder resource format. This endpoint returns JSON that is directly consumed by Vuefinder frontend.
 * @param env 
 * @param currentDir 
 * @returns List of files and folders in the directory in Vuefinder resource format.
 */
async function listFilesInDir(env: Env, currentDir: string): Promise<FileOperationResult> {
    currentDir = _removeStoragePrefix(currentDir)
    const options: R2ListOptions = {
        delimiter: '/',
        limit: 1000, // fixed limit to 1000, as R2 has a maximum limit of 1000 per request
        include: ['httpMetadata', 'customMetadata'],
        prefix: currentDir.endsWith('/') || currentDir === '' ? currentDir : `${currentDir}/`,
    }

    const listed = await env.BUCKET.list(options)
    let truncated = listed.truncated
    let cursor = listed.truncated ? listed.cursor : undefined
    while (truncated) {
        const next = await env.BUCKET.list({
            ...options,
            cursor,
        })
        listed.objects.push(...next.objects)

        truncated = next.truncated
        cursor = next.truncated ? next.cursor : undefined
    }

    let files: R2Object[] = listed.objects
    files.sort((a, b) => a.key.localeCompare(b.key))

    const folders: DirEntry[] = listed.delimitedPrefixes.flatMap((dirpath) => {
        if (dirpath === '/') return []

        const noEndingSlashPath = dirpath.replace(/\/+$/g, '')
        return [
            {
                type: 'dir',
                dir: _addStoragePrefix(noEndingSlashPath.split('/').slice(0, -1).join('/')),
                path: _addStoragePrefix(noEndingSlashPath),
                visibility: 'public',
                last_modified: Date.now(),
                mime_type: 'application/vnd.directory',
                basename: noEndingSlashPath.split('/').pop() ?? '',
                extension: '',
                storage: STORAGE_TYPE,
                file_size: 0,
            } satisfies DirEntry,
        ]
    })

    const result: FileOperationResult = {
        storages: ['r2'],
        dirname: _addStoragePrefix(currentDir.replace(/\/$/g, '')),
        read_only: false,
        files: [...folders, ...files.filter((file) => !_isSystemKeepFile(file)).map(_toVuefinderResource)],
    }

    return result
}


/**
 * List files in a directory (non-recursive) and convert to Vuefinder resource format. This endpoint returns JSON that is directly consumed by Vuefinder frontend.
 * @param env 
 * @param searchDir 
 * @param searchOptions
 * @returns List of files and folders in the directory in Vuefinder resource format.
 */
async function searchFilesInDir(env: Env, searchDir: string, searchOptions: SearchParams): Promise<FileOperationResult> {
    searchDir = _removeStoragePrefix(searchDir)
    const options: R2ListOptions = {
        limit: 1000, // fixed limit to 1000, as R2 has a maximum limit of 1000 per request
        include: ['httpMetadata', 'customMetadata'],
        prefix: searchDir.endsWith('/') || searchDir === '' ? searchDir : `${searchDir}/`,
    }
    if (!searchOptions.deep) {
        options.delimiter = '/'
    }

    const listed = await env.BUCKET.list(options)
    let truncated = listed.truncated
    let cursor = listed.truncated ? listed.cursor : undefined
    while (truncated) {
        const next = await env.BUCKET.list({
            ...options,
            cursor,
        })
        listed.objects.push(...next.objects)

        truncated = next.truncated
        cursor = next.truncated ? next.cursor : undefined
    }

    let files: R2Object[] = listed.objects
    if (searchOptions.filter) {
        files = files.filter((file) => file.key.includes(searchOptions.filter))
    }
    if (searchOptions.size) {
        files = files.filter((file) => {
            if (searchOptions.size === 'small') return file.size < 1024 * 1024 // < 1MB
            if (searchOptions.size === 'medium') return file.size >= 1024 * 1024 && file.size < 1024 * 1024 * 10 // 1MB - 10MB
            if (searchOptions.size === 'large') return file.size >= 1024 * 1024 * 10 // > 10MB
            return true
        })
    }
    files.sort((a, b) => a.key.localeCompare(b.key))

    const folders: DirEntry[] = listed.delimitedPrefixes.flatMap((dirpath) => {
        if (dirpath === '/') return []

        const noEndingSlashPath = dirpath.replace(/\/+$/g, '')
        if (searchOptions.filter && !noEndingSlashPath.includes(searchOptions.filter)) {
            return []
        }
        return {
            type: 'dir',
            dir: _addStoragePrefix(noEndingSlashPath.split('/').slice(0, -1).join('/')),
            path: _addStoragePrefix(noEndingSlashPath),
            visibility: 'public',
            last_modified: Date.now(),
            mime_type: 'application/vnd.directory',
            basename: noEndingSlashPath.split('/').pop() ?? '',
            extension: '',
            storage: STORAGE_TYPE,
            file_size: 0,
        } satisfies DirEntry
    })

    const result: FileOperationResult = {
        storages: ['r2'],
        dirname: _addStoragePrefix(searchDir.replace(/\/$/g, '')),
        read_only: false,
        files: [...folders, ...files.filter((file) => !_isSystemKeepFile(file)).map(_toVuefinderResource)],
    }

    return result
}

async function getPreview(env: Env, currentFile: string): Promise<Response> {
    const obj = await env.BUCKET.get(currentFile)
    if (!obj) throw new StatusError(404, 'Not found')

    return new Response(obj.body as ReadableStream<Uint8Array>, {
        headers: {
            'Content-Type': obj.httpMetadata?.contentType || _guessMime(currentFile) || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${currentFile.split('/').pop()}"`,
        },
    })
}

async function getDownload(env: Env, currentFile: string): Promise<Response> {
    const obj = await env.BUCKET.get(currentFile)
    if (!obj) throw new StatusError(404, 'Not found')

    return new Response(obj.body as ReadableStream<Uint8Array>, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${currentFile.split('/').pop()}"`,
        },
    })
}

async function createNewFolder(env: Env, currentDir: string, newFolderName: string): Promise<void> {
    await _createNewFolderPlaceholder(env, `${currentDir}/${newFolderName}`)
}

async function createNewFile(env: Env, currentDir: string, newFileName: string): Promise<void> {
    const newFileNameKey = _removeStoragePrefix(`${currentDir}/${newFileName}`)
    if (await _checkIfExists(newFileNameKey, env)) {
        throw new StatusError(400, 'File already exists')
    }

    await env.BUCKET.put(newFileNameKey, '', {
        httpMetadata: { contentType: "text/plain" },
    })
}

async function renameFile(env: Env, currentDir: string, oldFilePath: string, newFileName: string): Promise<void> {
    const src = _removeStoragePrefix(oldFilePath)
    const srcObj = await env.BUCKET.get(src)
    if (!srcObj) throw new StatusError(404, 'Not found')

    const dst = _removeStoragePrefix(`${currentDir}/${newFileName}`)
    if (await _checkIfExists(dst, env)) {
        throw new StatusError(400, 'File already exists')
    }

    await env.BUCKET.put(dst, srcObj.body, {
        httpMetadata: srcObj.httpMetadata,
        customMetadata: srcObj.customMetadata,
    })
    await env.BUCKET.delete(src)
}

async function moveOrCopyFiles(env: Env, sources: string[], destination: string, action: 'move' | 'copy'): Promise<void> {
    destination = _removeStoragePrefix(destination)

    for (const sourcePath of sources) {
        const src = _removeStoragePrefix(sourcePath)
        const srcObj = await env.BUCKET.get(src)
        if (!srcObj) continue

        const dstFilename = src.split('/').pop()

        const dst = _removeStoragePrefix(`${destination}/${dstFilename}`)
        if (await _checkIfExists(dst, env)) {
            throw new StatusError(400, 'File already exists')
        }

        await env.BUCKET.put(dst, srcObj.body, {
            httpMetadata: srcObj.httpMetadata,
            customMetadata: srcObj.customMetadata,
        })
        if (action === 'move') {
            await env.BUCKET.delete(src)
        }
    }
}

async function deleteFiles(env: Env, items: DeleteParams['items']): Promise<void> {
    for (const item of items) {
        if (item.type === 'file') {
            const key = _removeStoragePrefix(item.path)
            if (key.endsWith(KEEP_FILE)) {
                // check if file exist
                const obj = await env.BUCKET.get(key)
                if (!obj) continue

                if (!_isSystemKeepFile(obj)) {
                    // clear the file and mark it as system keep file to avoid deletion of the folder
                    await env.BUCKET.put(key, '', {
                        httpMetadata: obj.httpMetadata,
                        customMetadata: {
                            ...(obj.customMetadata || {}),
                            [SYSTEM_FILE_METADATA_KEY]: SYSTEM_FILE_METADATA_VALUE,
                        },
                    })
                    continue
                }
            }

            await env.BUCKET.delete(key)
        } else if (item.type === 'dir') {
            for (const obj of await _getAllFilesInDir(env, item.path)) {
                await env.BUCKET.delete(obj.key)
            }
        }
    }
}

async function uploadFile(env: Env, currentDir: string, request: UploadRequest): Promise<void> {
    const name = request.name || request.file.name
    const key = _removeStoragePrefix(`${currentDir}/${name}`)
    if (await _checkIfExists(key, env)) {
        throw new StatusError(400, 'File already exists')
    }

    const arrayBuffer = await request.file.arrayBuffer()
    await env.BUCKET.put(key, arrayBuffer, {
        httpMetadata: { contentType: request.file.type || request.type || _guessMime(name) },
    })
}

async function createArchive(env: Env, currentDirView: ArchiveParams['path'], destinationZipDir: ArchiveParams['destination'], name: ArchiveParams['name'], items: ArchiveParams['items']): Promise<void> {
    name = name || 'archive.zip'
    if (!name.endsWith('.zip')) name += '.zip'
    currentDirView = _removeStoragePrefix(currentDirView)
    destinationZipDir = _removeStoragePrefix(destinationZipDir ?? currentDirView)

    function removeCurrentDirFromFileName(itemPath: string): string {
        itemPath = _removeStoragePrefix(itemPath)
        const normalisedPath = itemPath.startsWith(currentDirView + "/") ? itemPath.slice(currentDirView.length + 1) : itemPath
        return normalisedPath.startsWith('/') ? normalisedPath.slice(1) : normalisedPath
    }

    // setup steaming zip to avoid loading all files from R2 into memory at once
    const chunks: Uint8Array[] = [];
    const zip = new Zip((err: Error | null, chunk: Uint8Array, _final: boolean) => {
        if (err) throw err;
        chunks.push(chunk);
    });

    // function to add R2 object into zip stream
    const addR2ObjectIntoZip = async (key: string, zipPath: string) => {
        const obj = await env.BUCKET.get(_removeStoragePrefix(key));
        if (!obj?.body) return;

        const file = new ZipDeflate(zipPath);
        zip.add(file);
        const reader = obj.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            file.push(value);
        }

        file.push(new Uint8Array(0), true);
    };

    for (const item of items) {
        if (item.type === "file") {
            await addR2ObjectIntoZip(
                item.path,
                removeCurrentDirFromFileName(item.path)
            );
        } else {
            const objList = await _getAllFilesInDir(env, item.path);

            for (const objMeta of objList) {
                if (_isSystemKeepFile(objMeta)) {
                    // add keep file as empty folder in zip to preserve folder structure
                    let folderPath = removeCurrentDirFromFileName(objMeta.key.replace(new RegExp(`${KEEP_FILE}$`), ''))
                    if (!folderPath.endsWith('/')) folderPath += '/'
                    // push a empty file into zip to act as folder
                    const folder = new ZipDeflate(folderPath);
                    zip.add(folder);
                    folder.push(new Uint8Array(0), true);
                } else {
                    // save the file into zip
                    await addR2ObjectIntoZip(
                        objMeta.key,
                        removeCurrentDirFromFileName(objMeta.key)
                    );
                }
            }
        }
    }

    zip.end();

    // allow final zip callback to flush
    await new Promise((r) => setTimeout(r, 0));

    // fully in-memory ZIP
    const zipBuffer = Uint8Array.from(
        chunks.reduce((acc, c) => acc.concat(Array.from(c)), [] as number[])
    );

    await env.BUCKET.put(
        _removeStoragePrefix(`${destinationZipDir}/${name}`),
        zipBuffer,
        {
            httpMetadata: {
                contentType: "application/zip",
            },
        }
    );
}

async function unzipArchive(env: Env, destinationDir: UnarchiveParams['path'], archiveFile: UnarchiveParams['item']): Promise<void> {
    const archivePath = _removeStoragePrefix(archiveFile)
    const archiveObj = await env.BUCKET.get(archivePath)
    if (!archiveObj) throw new StatusError(404, 'Archive not found')

    const buf = new Uint8Array(await archiveObj.arrayBuffer());
    const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        unzip(buf, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });
    for (const [filename, content] of Object.entries(files)) {
        let finalFilename = `${destinationDir}/${filename}`
        console.log('Extracting file:', filename, 'size:', content);
        if (filename.endsWith('/')) {
            // create a keep file to preserve folder structure
            await _createNewFolderPlaceholder(env, finalFilename)
        } else {
            await env.BUCKET.put(
                _removeStoragePrefix(finalFilename),
                content
            );
        }
    }
}

async function saveTextFile(env: Env, filePath: SaveParams['path'], content: SaveParams['content']): Promise<void> {
    if (!filePath) throw new StatusError(400, 'Missing path')
    await env.BUCKET.put(filePath, content || '', {
        httpMetadata: { contentType: 'text/plain' },
    })
}

/***** API Router Setup *****/

const router = Router({
    base: '/api/vuefinder',
    catch: (error: any): Response => {
        if (error instanceof StatusError) {
            return json_error(error.status, { message: error.message, status: false } satisfies VuefinderErrorResponse)
        }

        if (error instanceof Error) {
            return json_error(500, { message: error.message ?? 'Internal Server Error', status: false } satisfies VuefinderErrorResponse)
        }

        return json_error(500, { message: 'Unknown error', status: false } satisfies VuefinderErrorResponse)
    },
})

type VuefinderRequest = IRequestStrict & {
    currentPath: string;
}

const withVuefinderFilePath: RequestHandler<VuefinderRequest> = async (request): Promise<void> => {
    let path: string | undefined | null
    if (request.method === 'GET') {
        const query = new URL(request.url).searchParams
        // Vuefinder path query parameter will always have the storage prefix (e.g. r2://path/to/file)
        path = query.get('path')
    } else if (request.method === 'POST') {
        // For POST requests, the path is expected to be in the request body, and it will also have the storage prefix
        const body = await request.clone().json() as { path?: string }
        path = body.path
    } else {
        throw new StatusError(405, 'Method Not Allowed')
    }
    if (!path) {
        throw new StatusError(400, 'Missing path parameter')
    }
    request.currentPath = _removeStoragePrefix(path)
}

router.get('/', withVuefinderFilePath, async (request: VuefinderRequest, env: Env) => {
    return listFilesInDir(env, request.currentPath)
})

router.get('/search', withVuefinderFilePath, async (request: VuefinderRequest, env: Env) => {
    const query = new URL(request.url).searchParams
    const searchRequest: SearchParams = {
        path: request.currentPath,
        filter: query.get('filter') || "",
        deep: query.get('deep') ? query.get('deep') === 'true' : undefined,
        size: (query.get('size') as SearchParams['size']) || undefined,
    }
    return searchFilesInDir(env, request.currentPath, searchRequest)
})

router.get('/preview', withVuefinderFilePath, async (request: VuefinderRequest, env: Env) => {
    return getPreview(env, request.currentPath)
})

router.get('/download', withVuefinderFilePath, async (request: VuefinderRequest, env: Env) => {
    return getDownload(env, request.currentPath)
})

router.post('/create-folder', withVuefinderFilePath, async (request: VuefinderRequest, env: Env) => {
    const body = (await request.json()) as CreateItemRequest
    await createNewFolder(env, request.currentPath, body.name)
    return listFilesInDir(env, request.currentPath)
})

router.post('/create-file', withVuefinderFilePath, async (request: VuefinderRequest, env: Env) => {
    const body = (await request.json()) as CreateItemRequest
    await createNewFile(env, request.currentPath, body.name)
    return listFilesInDir(env, request.currentPath)
})

router.post('/rename', withVuefinderFilePath, async (request: VuefinderRequest, env: Env) => {
    const body = (await request.json()) as RenameParams
    await renameFile(env, request.currentPath, body.item, body.name)
    return listFilesInDir(env, request.currentPath)
})

router.post('/move', withVuefinderFilePath, async (request: VuefinderRequest, env: Env) => {
    const body = (await request.json()) as TransferParams
    await moveOrCopyFiles(env, body.sources || [], body.destination, 'move')
    return listFilesInDir(env, request.currentPath)
})

router.post('/copy', withVuefinderFilePath, async (request: VuefinderRequest, env: Env) => {
    const body = (await request.json()) as TransferParams
    await moveOrCopyFiles(env, body.sources || [], body.destination, 'copy')
    return listFilesInDir(env, request.currentPath)
})

router.post('/delete', withVuefinderFilePath, async (request: VuefinderRequest, env: Env) => {
    const body = (await request.json()) as DeleteParams
    await deleteFiles(env, body.items)
    return listFilesInDir(env, request.currentPath)
})

router.post('/upload', async (request: VuefinderRequest, env: Env) => {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) throw new StatusError(400, 'No file uploaded')
    const path = formData.get('path')?.toString()
    if (!path) throw new StatusError(400, 'Missing path parameter')

    const body: UploadRequest = {
        file,
        path,
        name: formData.get('name')?.toString() || undefined,
        type: formData.get('type')?.toString() || undefined,
    }
    await uploadFile(env, body.path, body)
    return json({})
})

router.post('/archive', async (request: VuefinderRequest, env: Env) => {
    const body = (await request.json()) as ArchiveParams
    if (!body.path) throw new StatusError(400, 'Missing path parameter')
    if (!body.items || body.items.length === 0) throw new StatusError(400, 'No items to archive')
    if (!body.name) throw new StatusError(400, 'Missing archive name')

    await createArchive(env, body.path, body.destination ?? body.path, body.name, body.items)
    return listFilesInDir(env, body.path)
})

router.post('/unarchive', async (request: VuefinderRequest, env: Env) => {
    const body = (await request.json()) as UnarchiveParams
    if (!body.path) throw new StatusError(400, 'Missing path parameter')
    if (!body.item) throw new StatusError(400, 'Missing item parameter')

    await unzipArchive(env, body.destination ?? body.path, body.item)
    return listFilesInDir(env, body.path)
})

router.post('/save', async (request: VuefinderRequest, env: Env) => {
    const body = (await request.json()) as SaveParams
    if (!body.path) throw new StatusError(400, 'Missing path parameter')
    if (!body.content) body.content = ''

    await saveTextFile(env, body.path, body.content)
    return getPreview(env, body.path)
})

router.all('*', async () => {
    throw new StatusError(404, 'Invalid endpoint')
})

export default { ...router }
