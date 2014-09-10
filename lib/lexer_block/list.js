// Lists

'use strict';


var isEmpty    = require('../helpers').isEmpty;
var skipSpaces = require('../helpers').skipSpaces;


// Search `[-+*][\n ]`, returns next pos arter marker on success
// or -1 on fail.
function skipBulletListMarker(state, startLine) {
  var marker, pos, max;


  if (state.tShift[startLine] > 3) { return -1; }

  pos = state.bMarks[startLine] + state.tShift[startLine];
  max = state.eMarks[startLine];

  if (pos >= max) { return -1; }

  marker = state.src.charCodeAt(pos++);
  // Check bullet
  if (marker !== 0x2A/* * */ &&
      marker !== 0x2D/* - */ &&
      marker !== 0x2B/* + */) {
    return -1;
  }

  if (pos < max && state.src.charCodeAt(pos) !== 0x20) {
    // " 1.test " - is not a list item
    return -1;
  }

  return pos;
}

// Search `\d+\.[\n ]`, returns next pos arter marker on success
// or -1 on fail.
function skipOrderedListMarker(state, startLine) {
  var ch,
      pos = state.bMarks[startLine] + state.tShift[startLine],
      max = state.eMarks[startLine];

  if (pos + 1 >= max) { return -1; }

  ch = state.src.charCodeAt(pos++);

  if (ch < 0x30/* 0 */ || ch > 0x39/* 9 */) { return -1; }

  for (;;) {
    // EOL -> fail
    if (pos >= max) { return -1; }

    ch = state.src.charCodeAt(pos++);

    if (ch >= 0x30/* 0 */ && ch <= 0x39/* 9 */) {
      continue;
    }

    // found valid marker
    if (ch === 0x29/* ) */ || ch === 0x2e/* . */) {
      break;
    }

    return -1;
  }


  if (pos < max && state.src.charCodeAt(pos) !== 0x20/* space */) {
    // " 1.test " - is not a list item
    return -1;
  }
  return pos;
}


module.exports = function list(state, startLine, endLine, silent) {
  var nextLine,
      indent,
      start,
      posAfterMarker,
      max,
      indentAfterMarker,
      markerValue,
      isOrdered,
      lastLine,
      subState,
      subString,
      contentStart,
      listTokIdx,
      lineMax,
      endOfList;
      //rules_named = state.lexerBlock.rules_named;

  // Detect list type and position after marker
  if ((posAfterMarker = skipOrderedListMarker(state, startLine)) >= 0) {
    isOrdered = true;
  } else if ((posAfterMarker = skipBulletListMarker(state, startLine)) >= 0) {
    isOrdered = false;
  } else {
    return false;
  }

  // For validation mode we can terminate immediately
  if (silent) { return true; }

  // Start list
  listTokIdx = state.tokens.length;

  if (isOrdered) {
    start = state.bMarks[startLine] + state.tShift[startLine];
    markerValue = Number(state.src.substr(start, posAfterMarker - start - 1));

    state.tokens.push({
      type: 'ordered_list_open',
      order: markerValue,
      tight: true
    });

  } else {
    state.tokens.push({
      type: 'bullet_list_open',
      tight: true
    });
  }

  //
  // Iterate list items
  //

  nextLine = startLine;
  lineMax = state.lineMax;
  endOfList = false;

  while (nextLine < endLine && !endOfList) {
    if (isOrdered) {
      posAfterMarker = skipOrderedListMarker(state, nextLine);
      if (posAfterMarker < 0) { break; }
    } else {
      posAfterMarker = skipBulletListMarker(state, nextLine);
      if (posAfterMarker < 0) { break; }
    }

    contentStart = skipSpaces(state, posAfterMarker);
    max = state.eMarks[nextLine];

    if (contentStart >= max) {
      // trimming space in "-    \n  3" case, indent is 1 here
      indentAfterMarker = 1;
    } else {
      indentAfterMarker = contentStart - posAfterMarker;
    }

    // If we have more than 4 spaces, the indent is 1
    // (the rest is just indented code block)
    if (indentAfterMarker > 4) { indentAfterMarker = 1; }

    // If indent is less than 1, assume that it's one, example:
    //  "-\n  test"
    if (indentAfterMarker < 1) { indentAfterMarker = 1; }

    // "  -  test"
    //  ^^^^^ - calculating total length of this thing
    indent = (posAfterMarker - state.bMarks[nextLine]) + indentAfterMarker;

    //
    // Scan lines inside list items
    //
    lastLine = startLine;

    // Run sublexer & write tokens
    state.tokens.push({ type: 'list_item_open' });

    nextLine++;
    for (;;) {
      // if this line is indented more than with N spaces,
      // it's the new paragraph of the same list item
      if (nextLine < lineMax) {
        if (isEmpty(state, nextLine)) {
          nextLine++;
          continue;
        }
        if (state.tShift[nextLine] >= indent) {
          if (nextLine < endLine) { lastLine = nextLine; }
          nextLine++;
          continue;
        }
      }

      if (lastLine < 0) { break; }

      subString = state.src.slice(contentStart, state.eMarks[lastLine])
                    .replace(RegExp('^ {' + indent + '}', 'mg'), '');
      if (lastLine < lineMax) {
        // TODO: we should slice up to next empty line, not up to the end of the document
        // (or even better - up to the next valid token)
        //
        // This has no impact on the algorithm except for performance
        subString += state.src.slice(state.eMarks[lastLine]);
      }

      subState = state.clone(subString);
      state.lexerBlock.tokenize(subState, 0, lastLine - startLine + 1, true);
      nextLine = startLine = subState.line + startLine;
      lastLine = -1;
      contentStart = state.eMarks[startLine];

      // TODO: need to detect loose type.
      // Problem: blocks. separated by empty lines can be member of sublists.

      // If any of list item is loose, mark list as loose
      if (!subState.tight) {
        state.tokens[listTokIdx].tight = false;
      }

      if (nextLine >= endLine) { break; }

      if (isEmpty(state, nextLine)) {
        nextLine++;
        if (nextLine >= endLine || isEmpty(state, nextLine)) {
          // two newlines end the list
          break;
        }
      }
    }

    state.tokens.push({ type: 'list_item_close' });
  }

  // Finilize list
  if (isOrdered) {
    state.tokens.push({ type: 'ordered_list_close' });
  } else {
    state.tokens.push({ type: 'bullet_list_close' });
  }

  state.line = nextLine;
  return true;
};