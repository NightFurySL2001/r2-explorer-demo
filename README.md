# Vue File Manager for Cloudflare R2

This is a simple Vue 3 file manager app scaffolded with Vite, ready for development with Cloudflare Pages, Workers and R2, utilising [Vuefinder](https://github.com/n1crack/vuefinder) for the user interface navigation. You should have a Cloudflare account if you want to deploy this project.

> [!WARNING]
> Do not expose this service over prolonged time as there are no protections on the API endpoint. You may get billed for extra usage if used by malicious actors.

## Local Development

```sh
npm install
npm run dev
```

The app will be available at http://localhost:5173/

## Build for Production

```sh
npm run build
```

## Deploy to Cloudflare with website dashboard + GitHub integration

1. Visit Cloudflare dashboard [R2 object storage](https://dash.cloudflare.com/?to=/:account/r2/overview).
2. Create a R2 bucket with name `your-bucket-name`, as defined in `wrangler.jsonc` r2_buckets.bucket_name value.
3. Visit Cloudflare dashboard [Worker & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages).
4. Create a worker to this GitHub repo with a project name.
5. Bind the R2 bucket to the worker in the project - Bindings - Add binding - R2 bucket, binding name `BUCKET` and R2 bucket `your-bucket-name`, as defined in `wrangler.jsonc` r2_buckets.binding and r2_buckets.bucket_name values respectively.
6. Enable `workers.dev` URL in the project - Settings - Domains & Routes - workers.dev - Enable.
7. You can now access the site on the `<project name>.<username>.workers.dev` URL.

## Deploy to Cloudflare with CLI + direct upload

1. Install [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install/):
    ```sh
    npm install -D wrangler
    ```
2. Configure your Cloudflare account:
    ```sh
    npx wrangler login
    ```
3. Create a R2 bucket with name `your-bucket-name`, as defined in `wrangler.jsonc` r2_buckets.bucket_name value.
    ```sh
    npx wrangler r2 bucket create your-bucket-name
    ```
    Choose "No" as the bucket has already been added in `wrangler.jsonc`.
4. Build the frontend asset files to prepare for upload.
    ```sh
    npm run build
    ```
5. Run the Wrangler deploy. This will upload all the required files for the Cloudflare Worker and deploy to `r2-explorer.<username>.workers.dev`. (`r2-explorer` is defined in `wrangler.jsonc` name value)
    ```sh
    npx wrangler deploy
    ```
6. You can now access the site on the `r2-explorer.<username>.workers.dev` URL.

## License

Licensed under MIT license.

---

-   For Vuefinder, see the [Vuefinder GitHub repo (n1crack/vuefinder)](https://github.com/n1crack/vuefinder)
-   For Cloudflare Workers Sites, see the [Cloudflare documentation](https://developers.cloudflare.com/workers/).
-   For Cloudflare Pages, see the [Cloudflare Pages documentation](https://developers.cloudflare.com/pages/).
-   For Cloudflare Wrangler commands, see the [Cloudflare Wranger documentation](https://developers.cloudflare.com/workers/wrangler/commands/).
