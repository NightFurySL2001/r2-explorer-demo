
# Vue File Manager for Cloudflare R2

This is a simple Vue 3 file manager app scaffolded with Vite, ready for development with Cloudflare Pages, Workers and R2, utilising [Vuefinder](https://github.com/n1crack/vuefinder). You should have a Cloudflare account if you want to deploy this project.

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

## Deploy to Cloudflare

1. Install [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install/):
	```sh
	npm install -D wrangler
	```
2. Configure your Cloudflare account:
	```sh
	wrangler login
	```
3. Deploy:
	```sh
	wrangler pages publish dist
	```

---

- For Vuefinder, see the [Vuefinder GitHub repo (n1crack/vuefinder)](https://github.com/n1crack/vuefinder)
- For Cloudflare Workers Sites, see the [Cloudflare documentation](https://developers.cloudflare.com/workers/).
- For Cloudflare Pages, see the [Cloudflare Pages documentation](https://developers.cloudflare.com/pages/).
