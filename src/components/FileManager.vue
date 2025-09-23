<template>
    <VueFinder
        id="my_vuefinder"
        :request="request"
        style="display: flex; flex-direction: column"
        @select="(selection: any) => emit('select', selection)"
    ></VueFinder>
</template>

<script setup lang="ts">
const emit = defineEmits<{
    (e: "select", selection: any): void;
}>();

// Or ...
const request = {
    // ----- CHANGE ME! -----
    // [REQUIRED] Url for development server endpoint
    baseUrl: "/api/vuefinder",
    // ----- CHANGE ME! -----

    // Additional headers & params & body
    // headers: { "X-ADDITIONAL-HEADER": "yes" },
    // params: { additionalParam1: 'yes' },
    // body: { additionalBody1: ['yes'] },

    // And/or transform request callback
    // transformRequest: (req: Request) => {
    //   if (req.method === 'get') {
    //     req.params.vf = '1'
    //   }
    //   return req
    // },

    // XSRF Token header name
    // xsrfHeaderName: "X-CSRF-TOKEN",
};
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
