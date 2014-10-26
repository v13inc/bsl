var ex = module.exports;

// somehow the code below inspired this whole silly mess :P
/*
var namespace = {
  project: function(table, keys) {
      return _.map(table, function(obj) {
          return _.pick.apply(null, construct(obj, keys));
      });
  },

  as: function(table, newNames) {
      return _.map(table, function(obj) {
          return rename(obj, newNames);
      });
  },

  restrict: function(table, pred) {
      return _.reduce(table, function(newTable, obj) {
          if (truthy(pred(obj))) return newTable;
          else return _.without(newTable, obj);
      }, table);
  }
};
*/

// 
// ( the stuff below is a sketch of what I'd like the language to look like )
//
// Line Delimiters:
// - used to split lines in parser
// Word Delimiters:
// - used to tokenize words
//
//
// <line> ; <line> \n <line>
//  - lines of code are delimited by ; or \n
// set <word> <value>
//  - adds a word to the namespace
// <word> , <word>, ...
// [ <word> <word> ... ]
//  - rows are delmited by , or []
// ( ... )
//  - blocks are delmited by '()' and are executed immediately
// { ... }
//  - functions are delmited by '{}' and pushed onto the stack
//
// each-col <function>
//  - maps <function> to cols
//
// each <function>
//  - maps <function> to rows
//
// from `table-one
//  - fetches a table and pushes it onto the stack
//
// select `col-one , `col-two
//  - removes all cols from stack except for given cols
//
// where <guard>
//  - uses guard to filter rows on stack
//
//
//
//

// 
// Utils
// =====
//

var deferEval = function(str) { return function() { eval(str) } };
var trimLast = function(str) { return str.substring(0, str.length - 1) };
// fancy mapping system with placeholders
// __(<index>) for placeholders; __ is shorthand for __(0)
var __ = function(i) { return { __p__: true, __i__: i } }; __.__p__ = true; __.__i__ = 0;
// replaces any placeholders in list with values from args
var placeholders = function(list, args) { return [].map.call(list, function(l) { return l && l.__p__ ? args[l.__i__] : l }) }
// bind arguments to a function
// var func = function(a, b, c, d) { return [a, b, c, d] };
// bind(func, 'one', __(0), 'three', __(1))('two', 'four') // returns: ['one', 'two', 'three', 'four']
var bind = function(func, args) {
  var args = [].slice.call(arguments), func = args.shift();
  return function() { func.apply(null, placeholders(args, arguments)) }
}
var map = function(list, func, args) {
  var args = [].slice.call(arguments), list = args.shift(), func = args.shift();
  return [].map.call(list, function(l) { return func.apply(l, placeholders(args, arguments)) });
}
// a few utils for parsing
var prepend = function(word, list) { return word === '' ? list : [word].concat(list) };
// very special function that's only useful for delimiters. Takes a word with a delim as the last char, and returns:
// [wordWithoutDelimiter, substringUntilDelimiter, lineWithoutSubstringOrDelimiter]
var splitToDel = function(w, l) { var i = l.lastIndexOf(w.substr(-1)); return [w.substr(1), l.substr(i + 1), l.substring(0, i)] };

// 
// Runtime State
// =============
//

var R = ex.R = {
  WD: {}, // word delimiters (for tokenizing words)
  LD: {}, // line delimiters
  T: {}, // types
  N: {}, // namespace
  S: [] // stack
}

// 
// Parsing
// =======
//

// #NotYourShield
// if line (l) is empty, prepend the word (w) onto the row (r) and return it (stopping recursion);
// otherwise, find a tokenizing function for the current character in the given namespace (ns) (falling back to tokenize),
// and call it with the last char of l prepended to w, l without its last char, and the current row.
// We can define functions called "delimiters" that have the same signature as tokenize. These delimiters 
// hook into the tokenizer and let us create delimiters that handle "", (), {} and other fun things.
var tokenize = ex.tokenize = 
  function(ns, w, l, r) { var c = l.substr(-1); return l ? (ns[c] || tokenize)(ns, c + w, trimLast(l), r) : prepend(w, r) }; //:D
// parse uses tokenize to split str into lines (with the R.LD delimiter namespace), then maps tokenize on the
// lines to split each line into words (using the R.WD delimiter namespace)
var parse = ex.parse = function(str) { return map(tokenize(R.LD, '', str, []), tokenize, R.WD, '', __, []) };

// 
// Execution
// =========
// exec -> execBlock -> execLine -> execWord -> lookup -> (executable function)()
// 

var lookup = ex.lookup = function(word) { var w = R.N[word] || word; return R.T[w._t || 'w'](w) };
var execWord = ex.execWord = function(word) { lookup(word)() };
var execLine = ex.execLine = function(line) { map(line.reverse(), execWord, __) };
var execBlock = ex.execBlock = function(block) { map(block, execLine, __) };
var exec = ex.exec = function(str) { execBlock(parse(str)) };

// 
// Language Definitions
// ====================
//

// 
// Delimiters
// ----------
//

var delim = ex.delim = function(ns, del, body) { ns[del] = body };
var delims = ex.delims = function(ns, delims, body) { map(delims, delim, ns, __, body) };
// basic whitespace delimiter function
var whitespace = function(ns, w, l, r) { return tokenize(ns, '', l, prepend(w.substr(1), r)) };

delims(R.LD, ';\n\f\r', whitespace);
delims(R.WD, ' \t\n\f\r', whitespace);
// shorthand string definition: `my-string-shorthand => 'my string shorthand'
delims(R.WD, '`', function(ns, w, l, r) { return whitespace(ns, w.replace(/-/g, ' '), l, r) });

//
// Quotes
//

// this is what the state will look like when we hit a " on a line like 'one "two three"four' (the lack of space before four is a worst-case that we should handle):
// w = 'four"'; l = 'one "two three'; r = []
// we want the state to end up like this:
// w = ''; l = 'one '; r = ['two three', 'four']
//
delims(R.WD, '"\'', function(ns, w, l, r) {
  // del is the current delimiter, i is the next " (remember, we are parsing right -> left, so it's the lastIndexOf l)
  //var del = w.substr(-1), w = w.substr(1), r = prepend(w, r), i = l.lastIndexOf(del), str = l.substr(i + 1);
  var wsl = splitToDel(w, l);
  return tokenize(ns, wsl[0], wsl[2], prepend(wsl[1], prepend(wsl[0], r)));
});

// 
// Blocks
//
// Blocks are strings of code inside of (...), that are executed as a whole unit
// During the parse phase, the block is parsed and an function is pushed on the stack that
// executes the parsed code block when it is called
//

// 
// Type System
// -----------
//
// Base types: word (w), function (f), block (b), deferred block (d)
//

var type = function(name, body) { R.T[name] = function(w) { w._t = name; return function() { body(w) } } };

type('w', function(w) { R.S.push(w) }); // push words onto the stack
type('f', function(f) { debugger; f() }); // execute JS functions
type('b', execBlock); // execute blocks
type('d', R.T.b); // convert deferred blocks to normal blocks

// 
// Built-in words
// --------------
//

var define = function(word, body) { body._t = 'f'; R.N[word] = body }; // define a word

// hack for adding JS infix operators
var infix = function(op, type) { define(op, deferEval('R.S.push('+type+'(R.S.pop())'+op+type+'(R.S.pop()))')) };
var infixes = function(ops, type) { map(ops, infix, __, type) };

infixes('+-*/', 'Number'); // maths
define('clear', function() { R.S = [] });
define('print', function() { console.log(R.S.pop()) });
