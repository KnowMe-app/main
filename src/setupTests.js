// jest-environment-jsdom doesn't expose TextEncoder/TextDecoder, which @react-pdf/renderer's
// font engine (fontkit) needs even just to be imported. Any test that pulls in a module importing
// @react-pdf/renderer needs this polyfilled before that import runs.
const { TextEncoder, TextDecoder } = require('util');

if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;
