"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "proxy";
exports.ids = ["proxy"];
exports.modules = {

/***/ "(middleware)/../../../node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Flee%2FRepos%2Fledwards%2Fswupod%2F.claude%2Fworktrees%2Fsad-pascal-dfaecf%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Flee%2FRepos%2Fledwards%2Fswupod%2F.claude%2Fworktrees%2Fsad-pascal-dfaecf&matchers=&preferredRegion=&middlewareConfig=e30%3D!":
/*!***********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ../../../node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Flee%2FRepos%2Fledwards%2Fswupod%2F.claude%2Fworktrees%2Fsad-pascal-dfaecf%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Flee%2FRepos%2Fledwards%2Fswupod%2F.claude%2Fworktrees%2Fsad-pascal-dfaecf&matchers=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \***********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_web_globals__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/web/globals */ \"(middleware)/../../../node_modules/next/dist/server/web/globals.js\");\n/* harmony import */ var next_dist_server_web_globals__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_web_globals__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_web_adapter__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/web/adapter */ \"(middleware)/../../../node_modules/next/dist/server/web/adapter.js\");\n/* harmony import */ var next_dist_server_web_adapter__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_web_adapter__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var _proxy_ts__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./proxy.ts */ \"(middleware)/./proxy.ts\");\n/* harmony import */ var next_dist_client_components_is_next_router_error__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! next/dist/client/components/is-next-router-error */ \"(middleware)/../../../node_modules/next/dist/client/components/is-next-router-error.js\");\n/* harmony import */ var next_dist_client_components_is_next_router_error__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(next_dist_client_components_is_next_router_error__WEBPACK_IMPORTED_MODULE_3__);\n\n\n// Import the userland code.\n\n\n\nconst mod = {\n    ..._proxy_ts__WEBPACK_IMPORTED_MODULE_2__\n};\nconst page = \"/proxy\";\nconst isProxy = page === '/proxy' || page === '/src/proxy';\nconst handlerUserland = (isProxy ? mod.proxy : mod.middleware) || mod.default;\nclass ProxyMissingExportError extends Error {\n    constructor(message){\n        super(message);\n        // Stack isn't useful here, remove it considering it spams logs during development.\n        this.stack = '';\n    }\n}\n// TODO: This spams logs during development. Find a better way to handle this.\n// Removing this will spam \"fn is not a function\" logs which is worse.\nif (typeof handlerUserland !== 'function') {\n    throw new ProxyMissingExportError(`The ${isProxy ? 'Proxy' : 'Middleware'} file \"${page}\" must export a function named \\`${isProxy ? 'proxy' : 'middleware'}\\` or a default function.`);\n}\n// Proxy will only sent out the FetchEvent to next server,\n// so load instrumentation module here and track the error inside proxy module.\nfunction errorHandledHandler(fn) {\n    return async (...args)=>{\n        try {\n            return await fn(...args);\n        } catch (err) {\n            // In development, error the navigation API usage in runtime,\n            // since it's not allowed to be used in proxy as it's outside of react component tree.\n            if (true) {\n                if ((0,next_dist_client_components_is_next_router_error__WEBPACK_IMPORTED_MODULE_3__.isNextRouterError)(err)) {\n                    err.message = `Next.js navigation API is not allowed to be used in ${isProxy ? 'Proxy' : 'Middleware'}.`;\n                    throw err;\n                }\n            }\n            const req = args[0];\n            const url = new URL(req.url);\n            const resource = url.pathname + url.search;\n            await (0,next_dist_server_web_globals__WEBPACK_IMPORTED_MODULE_0__.edgeInstrumentationOnRequestError)(err, {\n                path: resource,\n                method: req.method,\n                headers: Object.fromEntries(req.headers.entries())\n            }, {\n                routerKind: 'Pages Router',\n                routePath: '/proxy',\n                routeType: 'proxy',\n                revalidateReason: undefined\n            });\n            throw err;\n        }\n    };\n}\nconst handler = (opts)=>{\n    return (0,next_dist_server_web_adapter__WEBPACK_IMPORTED_MODULE_1__.adapter)({\n        ...opts,\n        page,\n        handler: errorHandledHandler(handlerUserland)\n    });\n};\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (handler);\n\n//# sourceMappingURL=middleware.js.map\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKG1pZGRsZXdhcmUpLy4uLy4uLy4uL25vZGVfbW9kdWxlcy9uZXh0L2Rpc3QvYnVpbGQvd2VicGFjay9sb2FkZXJzL25leHQtbWlkZGxld2FyZS1sb2FkZXIuanM/YWJzb2x1dGVQYWdlUGF0aD0lMkZVc2VycyUyRmxlZSUyRlJlcG9zJTJGbGVkd2FyZHMlMkZzd3Vwb2QlMkYuY2xhdWRlJTJGd29ya3RyZWVzJTJGc2FkLXBhc2NhbC1kZmFlY2YlMkZwcm94eS50cyZwYWdlPSUyRnByb3h5JnJvb3REaXI9JTJGVXNlcnMlMkZsZWUlMkZSZXBvcyUyRmxlZHdhcmRzJTJGc3d1cG9kJTJGLmNsYXVkZSUyRndvcmt0cmVlcyUyRnNhZC1wYXNjYWwtZGZhZWNmJm1hdGNoZXJzPSZwcmVmZXJyZWRSZWdpb249Jm1pZGRsZXdhcmVDb25maWc9ZTMwJTNEISIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUFzQztBQUNpQjtBQUN2RDtBQUNtQztBQUM4QztBQUNJO0FBQ3JGO0FBQ0EsT0FBTyxzQ0FBSTtBQUNYO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw2Q0FBNkMsa0NBQWtDLFFBQVEsS0FBSyxtQ0FBbUMsaUNBQWlDO0FBQ2hLO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsVUFBVTtBQUNWO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBcUM7QUFDckQsb0JBQW9CLG1HQUFpQjtBQUNyQyx5RkFBeUYsaUNBQWlDO0FBQzFIO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGtCQUFrQiwrRkFBaUM7QUFDbkQ7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxXQUFXLHFFQUFPO0FBQ2xCO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBLGlFQUFlLE9BQU8sRUFBQzs7QUFFdkIiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgXCJuZXh0L2Rpc3Qvc2VydmVyL3dlYi9nbG9iYWxzXCI7XG5pbXBvcnQgeyBhZGFwdGVyIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvd2ViL2FkYXB0ZXJcIjtcbi8vIEltcG9ydCB0aGUgdXNlcmxhbmQgY29kZS5cbmltcG9ydCAqIGFzIF9tb2QgZnJvbSBcIi4vcHJveHkudHNcIjtcbmltcG9ydCB7IGVkZ2VJbnN0cnVtZW50YXRpb25PblJlcXVlc3RFcnJvciB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL3dlYi9nbG9iYWxzXCI7XG5pbXBvcnQgeyBpc05leHRSb3V0ZXJFcnJvciB9IGZyb20gXCJuZXh0L2Rpc3QvY2xpZW50L2NvbXBvbmVudHMvaXMtbmV4dC1yb3V0ZXItZXJyb3JcIjtcbmNvbnN0IG1vZCA9IHtcbiAgICAuLi5fbW9kXG59O1xuY29uc3QgcGFnZSA9IFwiL3Byb3h5XCI7XG5jb25zdCBpc1Byb3h5ID0gcGFnZSA9PT0gJy9wcm94eScgfHwgcGFnZSA9PT0gJy9zcmMvcHJveHknO1xuY29uc3QgaGFuZGxlclVzZXJsYW5kID0gKGlzUHJveHkgPyBtb2QucHJveHkgOiBtb2QubWlkZGxld2FyZSkgfHwgbW9kLmRlZmF1bHQ7XG5jbGFzcyBQcm94eU1pc3NpbmdFeHBvcnRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgICBjb25zdHJ1Y3RvcihtZXNzYWdlKXtcbiAgICAgICAgc3VwZXIobWVzc2FnZSk7XG4gICAgICAgIC8vIFN0YWNrIGlzbid0IHVzZWZ1bCBoZXJlLCByZW1vdmUgaXQgY29uc2lkZXJpbmcgaXQgc3BhbXMgbG9ncyBkdXJpbmcgZGV2ZWxvcG1lbnQuXG4gICAgICAgIHRoaXMuc3RhY2sgPSAnJztcbiAgICB9XG59XG4vLyBUT0RPOiBUaGlzIHNwYW1zIGxvZ3MgZHVyaW5nIGRldmVsb3BtZW50LiBGaW5kIGEgYmV0dGVyIHdheSB0byBoYW5kbGUgdGhpcy5cbi8vIFJlbW92aW5nIHRoaXMgd2lsbCBzcGFtIFwiZm4gaXMgbm90IGEgZnVuY3Rpb25cIiBsb2dzIHdoaWNoIGlzIHdvcnNlLlxuaWYgKHR5cGVvZiBoYW5kbGVyVXNlcmxhbmQgIT09ICdmdW5jdGlvbicpIHtcbiAgICB0aHJvdyBuZXcgUHJveHlNaXNzaW5nRXhwb3J0RXJyb3IoYFRoZSAke2lzUHJveHkgPyAnUHJveHknIDogJ01pZGRsZXdhcmUnfSBmaWxlIFwiJHtwYWdlfVwiIG11c3QgZXhwb3J0IGEgZnVuY3Rpb24gbmFtZWQgXFxgJHtpc1Byb3h5ID8gJ3Byb3h5JyA6ICdtaWRkbGV3YXJlJ31cXGAgb3IgYSBkZWZhdWx0IGZ1bmN0aW9uLmApO1xufVxuLy8gUHJveHkgd2lsbCBvbmx5IHNlbnQgb3V0IHRoZSBGZXRjaEV2ZW50IHRvIG5leHQgc2VydmVyLFxuLy8gc28gbG9hZCBpbnN0cnVtZW50YXRpb24gbW9kdWxlIGhlcmUgYW5kIHRyYWNrIHRoZSBlcnJvciBpbnNpZGUgcHJveHkgbW9kdWxlLlxuZnVuY3Rpb24gZXJyb3JIYW5kbGVkSGFuZGxlcihmbikge1xuICAgIHJldHVybiBhc3luYyAoLi4uYXJncyk9PntcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiBhd2FpdCBmbiguLi5hcmdzKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAvLyBJbiBkZXZlbG9wbWVudCwgZXJyb3IgdGhlIG5hdmlnYXRpb24gQVBJIHVzYWdlIGluIHJ1bnRpbWUsXG4gICAgICAgICAgICAvLyBzaW5jZSBpdCdzIG5vdCBhbGxvd2VkIHRvIGJlIHVzZWQgaW4gcHJveHkgYXMgaXQncyBvdXRzaWRlIG9mIHJlYWN0IGNvbXBvbmVudCB0cmVlLlxuICAgICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNOZXh0Um91dGVyRXJyb3IoZXJyKSkge1xuICAgICAgICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9IGBOZXh0LmpzIG5hdmlnYXRpb24gQVBJIGlzIG5vdCBhbGxvd2VkIHRvIGJlIHVzZWQgaW4gJHtpc1Byb3h5ID8gJ1Byb3h5JyA6ICdNaWRkbGV3YXJlJ30uYDtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlcSA9IGFyZ3NbMF07XG4gICAgICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJlcS51cmwpO1xuICAgICAgICAgICAgY29uc3QgcmVzb3VyY2UgPSB1cmwucGF0aG5hbWUgKyB1cmwuc2VhcmNoO1xuICAgICAgICAgICAgYXdhaXQgZWRnZUluc3RydW1lbnRhdGlvbk9uUmVxdWVzdEVycm9yKGVyciwge1xuICAgICAgICAgICAgICAgIHBhdGg6IHJlc291cmNlLFxuICAgICAgICAgICAgICAgIG1ldGhvZDogcmVxLm1ldGhvZCxcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiBPYmplY3QuZnJvbUVudHJpZXMocmVxLmhlYWRlcnMuZW50cmllcygpKVxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHJvdXRlcktpbmQ6ICdQYWdlcyBSb3V0ZXInLFxuICAgICAgICAgICAgICAgIHJvdXRlUGF0aDogJy9wcm94eScsXG4gICAgICAgICAgICAgICAgcm91dGVUeXBlOiAncHJveHknLFxuICAgICAgICAgICAgICAgIHJldmFsaWRhdGVSZWFzb246IHVuZGVmaW5lZFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICB9O1xufVxuY29uc3QgaGFuZGxlciA9IChvcHRzKT0+e1xuICAgIHJldHVybiBhZGFwdGVyKHtcbiAgICAgICAgLi4ub3B0cyxcbiAgICAgICAgcGFnZSxcbiAgICAgICAgaGFuZGxlcjogZXJyb3JIYW5kbGVkSGFuZGxlcihoYW5kbGVyVXNlcmxhbmQpXG4gICAgfSk7XG59O1xuZXhwb3J0IGRlZmF1bHQgaGFuZGxlcjtcblxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9bWlkZGxld2FyZS5qcy5tYXBcbiJdLCJuYW1lcyI6W10sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(middleware)/../../../node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Flee%2FRepos%2Fledwards%2Fswupod%2F.claude%2Fworktrees%2Fsad-pascal-dfaecf%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Flee%2FRepos%2Fledwards%2Fswupod%2F.claude%2Fworktrees%2Fsad-pascal-dfaecf&matchers=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(middleware)/./proxy.ts":
/*!******************!*\
  !*** ./proxy.ts ***!
  \******************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   config: () => (/* binding */ config),\n/* harmony export */   proxy: () => (/* binding */ proxy)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(middleware)/../../../node_modules/next/dist/api/server.js\");\n\nfunction proxy(request) {\n    // Check maintenance mode\n    if (process.env.MAINTENANCE_MODE === 'true') {\n        // Allow access to maintenance page and static assets\n        const { pathname } = request.nextUrl;\n        if (pathname === '/maintenance' || pathname.startsWith('/_next') || pathname.startsWith('/icons') || pathname.startsWith('/images') || pathname === '/favicon.ico') {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.next();\n        }\n        // Redirect everything else to maintenance page\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.redirect(new URL('/maintenance', request.url));\n    }\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.next();\n}\nconst config = {\n    matcher: [\n        '/((?!api/health).*)'\n    ]\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKG1pZGRsZXdhcmUpLy4vcHJveHkudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQTREO0FBRXJELFNBQVNDLE1BQU1DLE9BQW9CO0lBQ3hDLHlCQUF5QjtJQUN6QixJQUFJQyxRQUFRQyxHQUFHLENBQUNDLGdCQUFnQixLQUFLLFFBQVE7UUFDM0MscURBQXFEO1FBQ3JELE1BQU0sRUFBRUMsUUFBUSxFQUFFLEdBQUdKLFFBQVFLLE9BQU87UUFDcEMsSUFDRUQsYUFBYSxrQkFDYkEsU0FBU0UsVUFBVSxDQUFDLGFBQ3BCRixTQUFTRSxVQUFVLENBQUMsYUFDcEJGLFNBQVNFLFVBQVUsQ0FBQyxjQUNwQkYsYUFBYSxnQkFDYjtZQUNBLE9BQU9OLHFEQUFZQSxDQUFDUyxJQUFJO1FBQzFCO1FBRUEsK0NBQStDO1FBQy9DLE9BQU9ULHFEQUFZQSxDQUFDVSxRQUFRLENBQUMsSUFBSUMsSUFBSSxnQkFBZ0JULFFBQVFVLEdBQUc7SUFDbEU7SUFFQSxPQUFPWixxREFBWUEsQ0FBQ1MsSUFBSTtBQUMxQjtBQUVPLE1BQU1JLFNBQVM7SUFDcEJDLFNBQVM7UUFBQztLQUFzQjtBQUNsQyxFQUFDIiwic291cmNlcyI6WyIvVXNlcnMvbGVlL1JlcG9zL2xlZHdhcmRzL3N3dXBvZC8uY2xhdWRlL3dvcmt0cmVlcy9zYWQtcGFzY2FsLWRmYWVjZi9wcm94eS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXh0UmVzcG9uc2UsIHR5cGUgTmV4dFJlcXVlc3QgfSBmcm9tICduZXh0L3NlcnZlcidcblxuZXhwb3J0IGZ1bmN0aW9uIHByb3h5KHJlcXVlc3Q6IE5leHRSZXF1ZXN0KSB7XG4gIC8vIENoZWNrIG1haW50ZW5hbmNlIG1vZGVcbiAgaWYgKHByb2Nlc3MuZW52Lk1BSU5URU5BTkNFX01PREUgPT09ICd0cnVlJykge1xuICAgIC8vIEFsbG93IGFjY2VzcyB0byBtYWludGVuYW5jZSBwYWdlIGFuZCBzdGF0aWMgYXNzZXRzXG4gICAgY29uc3QgeyBwYXRobmFtZSB9ID0gcmVxdWVzdC5uZXh0VXJsXG4gICAgaWYgKFxuICAgICAgcGF0aG5hbWUgPT09ICcvbWFpbnRlbmFuY2UnIHx8XG4gICAgICBwYXRobmFtZS5zdGFydHNXaXRoKCcvX25leHQnKSB8fFxuICAgICAgcGF0aG5hbWUuc3RhcnRzV2l0aCgnL2ljb25zJykgfHxcbiAgICAgIHBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9pbWFnZXMnKSB8fFxuICAgICAgcGF0aG5hbWUgPT09ICcvZmF2aWNvbi5pY28nXG4gICAgKSB7XG4gICAgICByZXR1cm4gTmV4dFJlc3BvbnNlLm5leHQoKVxuICAgIH1cblxuICAgIC8vIFJlZGlyZWN0IGV2ZXJ5dGhpbmcgZWxzZSB0byBtYWludGVuYW5jZSBwYWdlXG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5yZWRpcmVjdChuZXcgVVJMKCcvbWFpbnRlbmFuY2UnLCByZXF1ZXN0LnVybCkpXG4gIH1cblxuICByZXR1cm4gTmV4dFJlc3BvbnNlLm5leHQoKVxufVxuXG5leHBvcnQgY29uc3QgY29uZmlnID0ge1xuICBtYXRjaGVyOiBbJy8oKD8hYXBpL2hlYWx0aCkuKiknXSwgLy8gQWxsb3cgaGVhbHRoIGNoZWNrcyB0aHJvdWdoXG59XG4iXSwibmFtZXMiOlsiTmV4dFJlc3BvbnNlIiwicHJveHkiLCJyZXF1ZXN0IiwicHJvY2VzcyIsImVudiIsIk1BSU5URU5BTkNFX01PREUiLCJwYXRobmFtZSIsIm5leHRVcmwiLCJzdGFydHNXaXRoIiwibmV4dCIsInJlZGlyZWN0IiwiVVJMIiwidXJsIiwiY29uZmlnIiwibWF0Y2hlciJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(middleware)/./proxy.ts\n");

/***/ }),

/***/ "../app-render/after-task-async-storage.external":
/*!***********************************************************************************!*\
  !*** external "next/dist/server/app-render/after-task-async-storage.external.js" ***!
  \***********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/app-render/after-task-async-storage.external.js");

/***/ }),

/***/ "../app-render/work-async-storage.external":
/*!*****************************************************************************!*\
  !*** external "next/dist/server/app-render/work-async-storage.external.js" ***!
  \*****************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/app-render/work-async-storage.external.js");

/***/ }),

/***/ "../app-render/work-unit-async-storage.external":
/*!**********************************************************************************!*\
  !*** external "next/dist/server/app-render/work-unit-async-storage.external.js" ***!
  \**********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/app-render/work-unit-async-storage.external.js");

/***/ }),

/***/ "../incremental-cache/tags-manifest.external":
/*!***********************************************************************************!*\
  !*** external "next/dist/server/lib/incremental-cache/tags-manifest.external.js" ***!
  \***********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/lib/incremental-cache/tags-manifest.external.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "node:async_hooks":
/*!***********************************!*\
  !*** external "node:async_hooks" ***!
  \***********************************/
/***/ ((module) => {

module.exports = require("node:async_hooks");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("./webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/@opentelemetry"], () => (__webpack_exec__("(middleware)/../../../node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Flee%2FRepos%2Fledwards%2Fswupod%2F.claude%2Fworktrees%2Fsad-pascal-dfaecf%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Flee%2FRepos%2Fledwards%2Fswupod%2F.claude%2Fworktrees%2Fsad-pascal-dfaecf&matchers=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();