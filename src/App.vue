<script setup lang="ts">
import FileManager from "./components/FileManager.vue";
import type { DirEntry } from "../interfaces/vuefinder";

function close() {
    console.log("Close file manager");
}
function handleSelectFile(selection: DirEntry[]) {
    console.log("Selected file:", selection);
}
</script>

<template>
    <FileManager
        style="height: 100vh; width: 100vw"
        @close="close"
        @select="handleSelectFile"
    />
</template>
