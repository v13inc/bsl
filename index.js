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

// Utils
var __ = function(i) { return { __p__: true, __i__: i } };
// you can use __ alone as a shorthand for the first arg
__.__p__ = true; __.__i__ = 0;

var deferEval = function(str) { return function() { eval(str) } };
var trimLast = function(str) { return str.substring(0, str.length - 1) };

var placeholders = function(list, args) { return [].map.call(list, function(l) { return l && l.__p__ ? args[l.__i__] : l }) }
var map = function(list, func, args) {
  var args = [].slice.call(arguments), list = args.shift(), func = args.shift();
  return [].map.call(list, function(l) { return func.apply(l, placeholders(args, arguments)) });
}


// runtime state
var R = {
  WD: {}, // word delimiters (for tokenizing words)
  LD: {}, // line delimiters
  N: {}, // namespace
  S: [] // stack
}

// split by string into lines (separated by \n and ;), then split into words (separated by spaces)
var types = { word: 0, func: 1, deferred: 2 }; // base types (deferred is a deferred function)
var type = function(word) { return word && word._t ? word._t : types.word }; // find type
var define = function(word, body) { R.N[word] = func(body) }; // define a word
var func = function(body) { body._t = types.func; return body }; // tag a JS function as a func type
var deferred = function(body) { body._t = types.deferred; return body }; // tag a JS function as deferred

var I = func(function(arg) { return arg }); // identity function
var W = func(function(word) { return function() { R.S.push(word) } }); // wrap a word in a function, pushes it onto stack

// 
// Parsing
//
// delimiters
var delim = function(ns, del, body) { ns[del] = func(body) };
var delims = function(ns, delims, body) { map(delims, delim, ns, __, body) };

var prepend = function(word, list) { return word === '' ? list : [word].concat(list) };
// very special function that's only useful for delimiters. Takes a word with a delim as the last char, and returns:
// [wordWithoutDelimiter, substringUntilDelimiter, lineWithoutSubstringOrDelimiter]
//var splitToDel = function(del, line) { var i = line.lastIndexOf(del); return [line.substr(i + 1), line.substring(0, i)] };
var splitToDel = function(w, l) { 
  var i = l.lastIndexOf(w.substr(-1)); 
  return [w.substr(1), l.substr(i + 1), l.substring(0, i)];
};

// #NotYourShield
var tokenize = function(ns, w, l, r) { // namespace (for delim lookup), word, line, row
  // if line (l) is empty, prepend the word (w) onto the row (r) and return it (stopping recursion);
  // otherwise, find a tokenizing function for the current character in the given namespace (ns) (falling back to tokenize),
  // and call it with the last char of l prepended to w, l without its last char, and the current row.
  // We can define functions called "delimiters" that have the same signature as tokenize. These delimiters 
  // hook into the tokenizer and let us create delimiters that handle "", (), {} and other fun things.
  if(!l) return prepend(w, r); // stop recursion
  var c = l.substr(-1);
  return ( ns[c] || tokenize )(ns, c + w, trimLast(l), r); // call delimiter / tokenizer func on next character
};
// parse uses tokenize to split str into lines (with the R.LD delimiter namespace), then maps tokenize on the
// lines to split each line into words (using the R.WD delimiter namespace)
var parse = function(str) { return map(tokenize(R.LD, '', str, []), tokenize, R.WD, '', __, []) };


// basic whitespace delimiter function
var whitespace = function(ns, w, l, r) { return tokenize(ns, '', l, prepend(w.substr(1), r)) };
delims(R.LD, ';\n\f\r', whitespace);
delims(R.WD, ' \t\n\f\r', whitespace);
// shorthand string definition: `my-string-shorthand => 'my string shorthand'
delims(R.WD, '`', function(ns, w, l, r) { return whitespace(ns, w.replace(/-/g, ' '), l, r) });
//
// Quotes
// ------
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
// ------
// Blocks are strings of code inside of (...), that are executed as a whole unit
// During the parse phase, the block is parsed and an function is pushed on the stack that
// executes the parsed code block when it is called
//

// 
// Executing
//
var lookup = function(word) { var w = R.N[word] || word; return type(w) !== types.func ? W(w) : I(w) };
var execLine = function(line) { line && line.length && ( lookup(line.pop())(), execLine(line) ) };
var exec = function(str) { map(parse(str), execLine, __) }

// 
// Language 
//

// hack for adding JS infix operators
var infix = function(op, type) { define(op, deferEval('R.S.push('+type+'(R.S.pop())'+op+type+'(R.S.pop()))')) };
var infixes = function(ops, type) { map(ops, infix, __, type) };

infixes('+-*/', 'Number'); // maths
define('clear', function() { R.S = [] });
define('print', function() { console.log(R.S.pop()) });

//
// End Language, begin script
//

// exec stdin
var execStdin = function() {
  // why does node make this so hard?!
  // I just wanna execute some stdin, geez
  var stdin = '';
  process.stdin.on('readable', function() {
    var chunk = process.stdin.read();
    if(chunk !== null) stdin += chunk;
  });
  process.stdin.on('end', function() {
    exec(stdin);
    if(R.S.length) console.log(R.S.pop());
  });
}

var execArgs = function() { exec(process.argv.slice(2).join(' ')) };
var repl = function() {
  require('repl').start({ 
    eval: function(cmd, context, filename, callback) {
      var code = cmd.replace(/[(\)]/g, '').trim();
      exec(code);
      callback(null, R.S);
    } 
  });
}

if(process.argv.length > 2) {
  execArgs();
  if(R.S.length) console.log(R.S.pop());
} else {
  console.log(parse('1\'2 3 4\'; 5 "6 7" 8\n9 10 11 12 `hello-world'));
  exec('print "Hello, World!" print / * 8 + 1 2 2');
  repl();
}
