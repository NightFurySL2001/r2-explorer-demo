import { AutoRouter } from "itty-router";
import vuefinderRouter from "./vuefinder.ts";

// Create a new router
const router = AutoRouter({ base: "/api" });

// Route handlers
router.get("/hello", () => {
    return Response.json({ message: "Hello, world!" });
});

// Attach the sub-router for all /api/vuefinder/* routes
router.all("/vuefinder/*", vuefinderRouter.fetch);

// Fallback for all other requests
router.all("*", () =>
    Response.json({ error: "Not Found" }, { status: 404 })
);

// Worker entrypoint
export default { ...router };
