"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/buffer-equal-constant-time";
exports.ids = ["vendor-chunks/buffer-equal-constant-time"];
exports.modules = {

/***/ "(rsc)/../../../node_modules/buffer-equal-constant-time/index.js":
/*!*****************************************************************!*\
  !*** ../../../node_modules/buffer-equal-constant-time/index.js ***!
  \*****************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("/*jshint node:true */\n\nvar Buffer = (__webpack_require__(/*! buffer */ \"buffer\").Buffer); // browserify\nvar SlowBuffer = (__webpack_require__(/*! buffer */ \"buffer\").SlowBuffer);\n\nmodule.exports = bufferEq;\n\nfunction bufferEq(a, b) {\n\n  // shortcutting on type is necessary for correctness\n  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {\n    return false;\n  }\n\n  // buffer sizes should be well-known information, so despite this\n  // shortcutting, it doesn't leak any information about the *contents* of the\n  // buffers.\n  if (a.length !== b.length) {\n    return false;\n  }\n\n  var c = 0;\n  for (var i = 0; i < a.length; i++) {\n    /*jshint bitwise:false */\n    c |= a[i] ^ b[i]; // XOR\n  }\n  return c === 0;\n}\n\nbufferEq.install = function() {\n  Buffer.prototype.equal = SlowBuffer.prototype.equal = function equal(that) {\n    return bufferEq(this, that);\n  };\n};\n\nvar origBufEqual = Buffer.prototype.equal;\nvar origSlowBufEqual = SlowBuffer.prototype.equal;\nbufferEq.restore = function() {\n  Buffer.prototype.equal = origBufEqual;\n  SlowBuffer.prototype.equal = origSlowBufEqual;\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi4vLi4vLi4vbm9kZV9tb2R1bGVzL2J1ZmZlci1lcXVhbC1jb25zdGFudC10aW1lL2luZGV4LmpzIiwibWFwcGluZ3MiOiJBQUFBO0FBQ2E7QUFDYixhQUFhLG9EQUF3QixFQUFFO0FBQ3ZDLGlCQUFpQix3REFBNEI7O0FBRTdDOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLGtCQUFrQixjQUFjO0FBQ2hDO0FBQ0Esc0JBQXNCO0FBQ3RCO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsiL1VzZXJzL2xlZS9SZXBvcy9sZWR3YXJkcy9zd3Vwb2Qvbm9kZV9tb2R1bGVzL2J1ZmZlci1lcXVhbC1jb25zdGFudC10aW1lL2luZGV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qanNoaW50IG5vZGU6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xudmFyIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlcjsgLy8gYnJvd3NlcmlmeVxudmFyIFNsb3dCdWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5TbG93QnVmZmVyO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGJ1ZmZlckVxO1xuXG5mdW5jdGlvbiBidWZmZXJFcShhLCBiKSB7XG5cbiAgLy8gc2hvcnRjdXR0aW5nIG9uIHR5cGUgaXMgbmVjZXNzYXJ5IGZvciBjb3JyZWN0bmVzc1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihhKSB8fCAhQnVmZmVyLmlzQnVmZmVyKGIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gYnVmZmVyIHNpemVzIHNob3VsZCBiZSB3ZWxsLWtub3duIGluZm9ybWF0aW9uLCBzbyBkZXNwaXRlIHRoaXNcbiAgLy8gc2hvcnRjdXR0aW5nLCBpdCBkb2Vzbid0IGxlYWsgYW55IGluZm9ybWF0aW9uIGFib3V0IHRoZSAqY29udGVudHMqIG9mIHRoZVxuICAvLyBidWZmZXJzLlxuICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgdmFyIGMgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAvKmpzaGludCBiaXR3aXNlOmZhbHNlICovXG4gICAgYyB8PSBhW2ldIF4gYltpXTsgLy8gWE9SXG4gIH1cbiAgcmV0dXJuIGMgPT09IDA7XG59XG5cbmJ1ZmZlckVxLmluc3RhbGwgPSBmdW5jdGlvbigpIHtcbiAgQnVmZmVyLnByb3RvdHlwZS5lcXVhbCA9IFNsb3dCdWZmZXIucHJvdG90eXBlLmVxdWFsID0gZnVuY3Rpb24gZXF1YWwodGhhdCkge1xuICAgIHJldHVybiBidWZmZXJFcSh0aGlzLCB0aGF0KTtcbiAgfTtcbn07XG5cbnZhciBvcmlnQnVmRXF1YWwgPSBCdWZmZXIucHJvdG90eXBlLmVxdWFsO1xudmFyIG9yaWdTbG93QnVmRXF1YWwgPSBTbG93QnVmZmVyLnByb3RvdHlwZS5lcXVhbDtcbmJ1ZmZlckVxLnJlc3RvcmUgPSBmdW5jdGlvbigpIHtcbiAgQnVmZmVyLnByb3RvdHlwZS5lcXVhbCA9IG9yaWdCdWZFcXVhbDtcbiAgU2xvd0J1ZmZlci5wcm90b3R5cGUuZXF1YWwgPSBvcmlnU2xvd0J1ZkVxdWFsO1xufTtcbiJdLCJuYW1lcyI6W10sImlnbm9yZUxpc3QiOlswXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/../../../node_modules/buffer-equal-constant-time/index.js\n");

/***/ })

};
;