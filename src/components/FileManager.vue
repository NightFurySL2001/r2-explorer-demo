<template>
    <VueFinder
        id="my_vuefinder"
        :driver="driver"
        :config="{
            initialPath: 'r2://',
            persist: true,
        }"
        style="display: flex; flex-direction: column"
        @select="(selection: DirEntry[]) => emit('select', selection)"
    ></VueFinder>
</template>

<script setup lang="ts">
import { RemoteDriver } from "vuefinder";
import type { DirEntry } from "vuefinder";

const emit = defineEmits<{
    (e: "select", selection: DirEntry[]): void;
}>();

const driver = new RemoteDriver({
    // ----- CHANGE ME! -----
    // [REQUIRED] URL for Vuefinder API endpoint
    baseURL: "/api/vuefinder",

    // Additional headers & url & authorization bearer token
    // url: {
    //     list: "/files",
    //     upload: "/upload",
    //     delete: "/delete",
    //     rename: "/rename",
    //     copy: "/copy",
    //     move: "/move",
    //     archive: "/archive",
    //     unarchive: "/unarchive",
    //     createFile: "/create-file",
    //     createFolder: "/create-folder",
    //     preview: "/preview",
    //     download: "/download",
    //     search: "/search",
    //     save: "/save",
    // },
    // headers: { "X-ADDITIONAL-HEADER": "yes" },
    // token: "BEARER TOKEN",
});
</script>

<style>
.vuefinder {
    & > div {
        flex-grow: 1;
        .vuefinder__main__container {
            height: 100% !important;
            max-height: none !important;
        }
    }
}
</style>
