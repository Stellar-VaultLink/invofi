"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.version = exports.default = exports.AxiosClient = void 0;
var _axios = _interopRequireDefault(require("axios"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
var version = exports.version = require('../../package.json').version;
var AxiosClient = exports.AxiosClient = _axios.default.create({
  headers: {
    'X-Client-Name': 'js-soroban-client',
    'X-Client-Version': version
  }
});
var _default = exports.default = AxiosClient;