"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.SERVER_TIME_MAP = exports.AxiosClient = void 0;
exports.getCurrentServerTime = getCurrentServerTime;
exports.version = void 0;
var _axios = _interopRequireDefault(require("axios"));
var _urijs = _interopRequireDefault(require("urijs"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
var version = exports.version = require("../../package.json").version;
var SERVER_TIME_MAP = exports.SERVER_TIME_MAP = {};
var AxiosClient = exports.AxiosClient = _axios.default.create({
  headers: {
    "X-Client-Name": "js-stellar-sdk",
    "X-Client-Version": version
  }
});
function toSeconds(ms) {
  return Math.floor(ms / 1000);
}
AxiosClient.interceptors.response.use(function (response) {
  var hostname = (0, _urijs.default)(response.config.url).hostname();
  var serverTime = toSeconds(Date.parse(response.headers.date));
  var localTimeRecorded = toSeconds(new Date().getTime());
  if (!Number.isNaN(serverTime)) {
    SERVER_TIME_MAP[hostname] = {
      serverTime: serverTime,
      localTimeRecorded: localTimeRecorded
    };
  }
  return response;
});
var _default = exports.default = AxiosClient;
function getCurrentServerTime(hostname) {
  var entry = SERVER_TIME_MAP[hostname];
  if (!entry || !entry.localTimeRecorded || !entry.serverTime) {
    return null;
  }
  var serverTime = entry.serverTime,
    localTimeRecorded = entry.localTimeRecorded;
  var currentTime = toSeconds(new Date().getTime());
  if (currentTime - localTimeRecorded > 60 * 5) {
    return null;
  }
  return currentTime - localTimeRecorded + serverTime;
}