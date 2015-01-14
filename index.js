/**
 * @fileoverview Strengthen the ability of file system
 * @author wliao <wliao@Ctrip.com> 
 */
var fs = require('fs');
var util = require('utils-extend');
var path = require('path');
var fileMatch = require('file-match');

function checkCbAndOpts(options, callback) {
  if (util.isFunction(options)) {
    return {
      options: null,
      callback: options
    };
  } else if (util.isObject(options)) {
    return {
      options: options,
      callback: callback
    };
  } else {
    return {
      options: null,
      callback: util.noop
    };
  }
}

function getExists(filepath) {
  var exists = fs.existsSync(filepath);

  if (exists) {
    return filepath;
  } else {
    return getExists(path.dirname(filepath));
  }
}

util.extend(exports, fs);

/**
 * @description
 * Assign node origin methods to fs
 */
exports.fs = fs;

exports.fileMatch = fileMatch;

/**
 * @description
 * Create dir, if dir exist, it will only invoke callback.
 *
 * @example
 * ```js
 *   fs.mkdir('1/2/3/4/5', 511);
 *   fs.mkdir('path/2/3', function() {});
 * ```
 */
exports.mkdir = function(filepath, mode, callback) {
  var root = getExists(filepath);
  var children  = path.relative(root, filepath);

  if (util.isFunction(mode)) {
    callback = mode;
    mode = null;
  }

  if (!util.isFunction(callback)) {
    callback = util.noop;
  }

  mode = mode || 511;

  if (!children) return callback();

  children = children.split(path.sep);

  function create(filepath) {
    if (create.count === children.length) {
      return callback();
    }

    filepath = path.join(filepath, children[create.count]);

    fs.mkdir(filepath, mode, function(err) {
      create.count++;
      create(filepath);
    });
  }

  create.count = 0;
  create(root);
};

/**
 * @description
 * Same as mkdir, but it is synchronous
 */
exports.mkdirSync = function(filepath, mode) {
  var root = getExists(filepath);
  var children  = path.relative(root, filepath);

  if (!children) return;

  children = children.split(path.sep);

  children.forEach(function(item) {
    root = path.join(root, item);
    fs.mkdirSync(root, mode);
  });
};

/**
 * @description 
 * Create file, if path don't exists, it will not throw error.
 * And will mkdir for path, it is asynchronous
 * 
 * @example
 * ```js
 *   fs.writeFile('path/filename.txt', 'something')
 *   fs.writeFile('path/filename.txt', 'something', {})
 * ```
 */
exports.writeFile = function(filename, data, options, callback) {
  var result = checkCbAndOpts(options, callback);
  var dirname = path.dirname(filename);
  options = result.options;
  callback = result.callback;

  // Create dir first
  exports.mkdir(dirname, function() {
    fs.writeFile(filename, data, options, callback);
  });
};

/**
 * @description
 * Same as writeFile, but it is synchronous
 */
exports.writeFileSync = function(filename, data, options) {
  var dirname = path.dirname(filename);

  exports.mkdirSync(dirname);
  fs.writeFileSync(filename, data, options);
};

/**
 * @description
 * Copy file to dest, if no process options, it will only copy file to dest
 * @example
 * file.copyFileSync('demo.txt', 'demo.dest.txt' { process: function(contents) { }});
 * file.copyFileSync('demo.png', 'dest.png');
 */
exports.copyFileSync = function(srcpath, destpath, options) {
  options = util.extend({
    encoding: 'utf8' 
  }, options || {});
  var contents;

  if (options.process) {
    contents = fs.readFileSync(srcpath, options);
    contents = options.process(contents);
    exports.writeFileSync(destpath, contents, options);    
  } else {
    contents = fs.readFileSync(srcpath);
    exports.writeFileSync(destpath, contents);
  }
};

/**
 * @description
 * Recurse into a directory, executing callback for each file and folder
 * if the filename is undefiend, the callback is for folder, otherwise for file.
 * and it is asynchronous
 * @example
 * file.recurse('path', function(filepath, filename) { });
 * file.recurse('path', ['*.js', 'path/**\/*.html'], function(filepath, filename) { });
 */
exports.recurse = function(dirpath, filter, callback) {
  if (util.isFunction(filter)) {
    callback = filter;
    filter = null;
  }
  var filterCb = fileMatch(filter);
  var rootpath = dirpath;

  function recurse(dirpath) {
    fs.readdir(dirpath, function(err, files) {
      if (err) return callback(err);

      files.forEach(function(filename) {
        var filepath = path.join(dirpath, filename);

        fs.stat(filepath, function(err, stats) {
            var relative = path.relative(rootpath, filepath);
            var flag = filterCb(relative);

            if (stats.isDirectory()) {
              recurse(filepath);
              if (flag) callback(filepath);
            } else {
              if (flag) callback(filepath, filename);
            }
          });
        });
    });
  }

  recurse(dirpath);
};

/**
 * @description
 * Same as recurse, but it is synchronous
 * @example
 * file.recurseSync('path', function(filepath, filename) {});
 * file.recurseSync('path', ['*.js', 'path/**\/*.html'], function(filepath, filename) {});
 */
exports.recurseSync = function(dirpath, filter, callback) {
  if (util.isFunction(filter)) {
    callback = filter;
    filter = null;
  }
  var filterCb = fileMatch(filter);
  var rootpath = dirpath;

  function recurse(dirpath) {
    // permission bug
    try {
      fs.readdirSync(dirpath).forEach(function(filename) {
        var filepath = path.join(dirpath, filename);
        var stats = fs.statSync(filepath);
        var relative = path.relative(rootpath, filepath);
        var flag = filterCb(relative);

        if (stats.isDirectory()) {
          recurse(filepath);
          if (flag) callback(filepath);
        } else {
          if (flag) callback(filepath, filename);
        }
      });
    } catch(e) {
      fs.chmodSync(dirpath, 511);
      recurse(dirpath);
    }
  }

  recurse(dirpath);
};

/**
 * @description
 * Remove folder and files in folder, but it's synchronous
 * @example
 * file.rmdirSync('path');
 */
exports.rmdirSync = function(dirpath) {
  exports.recurseSync(dirpath, function(filepath, filename) {
    // it is file, otherwise it's folder
    if (filename) {
      fs.unlinkSync(filepath);
    } else {
      fs.rmdirSync(filepath);
    }
  });

  fs.rmdirSync(dirpath);
};

/**
 * @description
 * Copy dirpath to destpath, pass process callback for each file hanlder
 * if you want to change the dest filepath, process callback return { contents: '', filepath: ''}
 * otherwise only change contents
 * @example
 * file.copySync('path', 'dest');
 * file.copySync('src', 'dest/src');
 * file.copySync('path', 'dest', { process: function(contents, filepath) {} });
 * file.copySync('path', 'dest', { process: function(contents, filepath) {} }, noProcess: ['']);
 */
exports.copySync = function(dirpath, destpath, options) {
  options = util.extend({
    encoding: 'utf8',
    filter: null,
    noProcess: ''
  }, options || {});
  var files = [];
  var folders = [];

  exports.recurseSync(dirpath, options.filter, function(filepath, filename) {
    if (!filename) return;
    files.push(filepath);
    folders.push(path.dirname(filepath));
  });

  var length = files.length;
  var noProcessCb = fileMatch(options.noProcess);

  // Make sure dest root
  exports.mkdirSync(destpath);
  // First create folder for file
  folders.forEach(function(item, index) {
    var isCreate = true;
    var relative, newpath;

    while(index++ < length) {
      if (folders[index] === item) {
        isCreate = false;
        break;
      }
    }

    if (isCreate) {
      relative = path.relative(dirpath, item);
      if (relative) {
        newpath = path.join(destpath, relative);
        exports.mkdirSync(newpath);
      }
    }
  });

  function copy(oldpath, newpath, options) {
    var result;
    if (options.process) {
      var encoding = {
        encoding: options.encoding
      };
      result = fs.readFileSync(oldpath, encoding);
      result = options.process(result, oldpath);

      if (util.isObject(result) && result.filepath) {
        fs.writeFileSync(result.filepath, result.contents, encoding);
      } else {
        fs.writeFileSync(newpath, result, encoding);
      }
    } else {
      result = fs.readFileSync(oldpath);
      fs.writeFileSync(newpath, result);
    }
  }

  // Copy file
  files.forEach(function(item) {
    var relative = path.relative(dirpath, item);
    var newpath = path.join(destpath, relative);

    if (options.process) {
      if (noProcessCb(relative)) {
        copy(item, newpath, {});
      } else {
        copy(item, newpath, options);
      }
    } else {
      copy(item, newpath, {});
    }
  });
};

function base64(filename, data) {
   var extname = path.extname(filename).substr(1);
  extname = extname || 'png';
  var baseType = {
    jpg: 'jpeg'
  };
  var type = baseType[extname] ? baseType[extname] : extname;

  return 'data:image/' + type + ';base64,' + new Buffer(data, 'binary').toString('base64');
}
/**
 * @description
 * Get image file base64 data
 */
exports.base64 = function(filename, callback) {
  if (!callback) callback = util.noop;

  fs.readFile(filename, { encoding: 'binary' }, function(err, data) {
    if (err) return callback(err);

    callback(null, base64(filename, data));
  });
};

/**
 * @description
 * The api same as base64, but it's synchronous
 */
exports.base64Sync = function(filename) {
  var data = fs.readFileSync(filename);

  return base64(filename, data);
};