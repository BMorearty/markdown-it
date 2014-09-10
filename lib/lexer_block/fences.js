// fences (``` lang, ~~~ lang)

'use strict';


var skipSpaces      = require('../helpers').skipSpaces;
var skipChars       = require('../helpers').skipChars;
var getLines        = require('../helpers').getLines;


module.exports = function fences(state, startLine, endLine, silent) {
  var marker, len, params, nextLine, mem,
      pos = state.bMarks[startLine] + state.tShift[startLine],
      max = state.eMarks[startLine];

  if (pos + 3 > max) { return false; }

  marker = state.src.charCodeAt(pos);

  if (marker !== 0x7E/* ~ */ && marker !== 0x60 /* ` */) {
    return false;
  }

  // scan marker length
  mem = pos;
  pos = skipChars(state, pos, marker);

  len = pos - mem;

  if (len < 3) { return false; }

  params = state.src.slice(pos, max).trim();

  if (params.indexOf('`') >= 0) { return false; }

  // Since start is found, we can report success here in validation mode
  if (silent) { return true; }

  // search end of block
  nextLine = startLine;

  for (;;) {
    if (nextLine + 1 >= endLine) {
      // unclosed block should be autoclosed by end of document.
      // also block seems to be autoclosed by end of parent
      /*if (state.blkLevel === 0) {
        break;
      }
      return false;*/
      break;
    }

    nextLine++;

    pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];

    if (state.src.charCodeAt(pos) !== marker) { continue; }

    pos = skipChars(state, pos, marker);

    // closing code fence must be at least as long as the opening one
    if (pos - mem < len) { continue; }

    // make sure tail has spaces only
    pos = skipSpaces(state, pos);

    if (pos < max) { continue; }

    // found!
    break;
  }

  // If fense has heading spases, those should be removed from inner block
  len = state.tShift[startLine];

  state.tokens.push({
    type: 'fence',
    params: params ? params.split(/\s+/g) : [],
    content: len === 0 ?
                getLines(state, startLine + 1, nextLine, true)
              :
                getLines(state, startLine + 1, nextLine, true)
                  .replace(RegExp('^ {1,' + len + '}', 'mg'), '')
  });

  state.line = nextLine + 1;
  return true;
};