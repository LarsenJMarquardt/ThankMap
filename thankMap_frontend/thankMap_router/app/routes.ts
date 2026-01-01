import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),

    route("share/:code", "routes/shares.tsx"),
] satisfies RouteConfig;
