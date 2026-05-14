"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MimetypeContentWrapper = void 0;
function removeUndefinedKeys(obj) {
    Object.entries(obj).forEach(([key, value]) => {
        if (value === undefined) {
            delete obj[key];
        }
    });
    return obj;
}
class MimetypeContentWrapper {
    wrap(mimetype, obj) {
        const content = mimetype.reduce((acc, item) => (Object.assign(Object.assign({}, acc), { [item]: removeUndefinedKeys(obj) })), {});
        return { content };
    }
}
exports.MimetypeContentWrapper = MimetypeContentWrapper;
